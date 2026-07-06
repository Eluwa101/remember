import { ai, supabase, groqApiKey, openRouterApiKey } from "../env";

export interface UserProfile {
  name?: string;
  title?: string;
  // Deliberately optional/no default here — undefined means "genuinely
  // unknown," which the WhatsApp bot uses to decide whether to ask for it
  // before parsing a time-bound reminder. Callers that need a display
  // fallback should do `profile.timezone || "America/Los_Angeles"` themselves.
  timezone?: string;
  last_greeting_period?: string;
  last_greeting_date?: string;
}

// Ultra-robust, high-performance user resolution that satisfies both public.users and auth.users foreign key constraints
export async function resolveUserId(phone: string): Promise<string> {
  const cleanPhone = phone.replace(/[^0-9]/g, "").trim();
  const { data, error } = await supabase
    .from("users")
    .upsert({ whatsapp_number: cleanPhone }, { onConflict: "whatsapp_number" })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[User Resolve] Upsert error:", error?.message);
    throw new Error("Failed to resolve user ID");
  }
  return data.id;
}

export async function safeEmbedContent(text: string): Promise<number[] | null> {
  try {
    const res = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: text
    });
    return res.embeddings?.[0]?.values || null;
  } catch (err: any) {
    console.error("[Embedding Error] Skipping embedding:", err.message);
    return null;
  }
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("name, title, timezone, last_greeting_period, last_greeting_date")
      .eq("id", userId)
      .single();

    if (error || !data) {
      console.error("Failed to get user profile:", error?.message);
      return {};
    }

    return {
      name: data.name || undefined,
      title: data.title || undefined,
      timezone: data.timezone || undefined,
      last_greeting_period: data.last_greeting_period || undefined,
      last_greeting_date: data.last_greeting_date || undefined
    };
  } catch (err) {
    console.error("Failed to get user profile:", err);
    return {};
  }
}

export async function saveUserProfile(userId: string, profile: Partial<UserProfile>): Promise<void> {
  try {
    const { error } = await supabase.from("users").update(profile).eq("id", userId);
    if (error) console.error("Failed to save user profile:", error.message);
  } catch (err) {
    console.error("Failed to save user profile:", err);
  }
}

// Robust fallback parser to shift load away from Gemini and provide a backup
export async function parseWithFallback(systemPrompt: string, userText: string, mediaData: any = null): Promise<string> {
  const hasMedia = !!mediaData;
  const isImage = hasMedia && mediaData.mimeType.startsWith("image/");

  // If there's media (especially audio/documents), Gemini is our best bet natively.
  // We'll try Gemini first if we have a real API key OR if there's media.
  if (process.env.GEMINI_API_KEY && hasMedia) {
    try {
      console.log("[Parsing] Attempting Gemini API for Multimodal...");
      const contents: any[] = [{
        inlineData: {
          data: mediaData.data,
          mimeType: mediaData.mimeType
        }
      }];
      if (userText.trim()) contents.push({ text: `Message to parse: "${userText}"` });
      else contents.push({ text: "Please analyze the attached media and summarize it according to the system instructions." });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: {
          responseMimeType: "application/json",
          systemInstruction: systemPrompt
        }
      });
      if (response.text) return response.text;
    } catch (err: any) {
      console.error("[Parsing] Gemini Multimodal failed:", err.message);
      if (err.message.includes("SCOPE_INSUFFICIENT") || err.message.includes("UNAUTHENTICATED") || err.status === 403 || err.status === 401) {
         throw new Error("Missing or invalid GEMINI_API_KEY in Secrets. Please configure it in AI Studio.");
      }
    }
  }

  if (!hasMedia && groqApiKey) {
    try {
      console.log("[Parsing] Attempting Groq API...");
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", { signal: AbortSignal.timeout(15000),
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Message to parse: "${userText}"` }
          ],
          response_format: { type: "json_object" },
          temperature: 0.1
        })
      });
      if (res.ok) {
        const data = await res.json();
        return data.choices[0].message.content;
      } else {
        console.warn("[Parsing] Groq API failed with status:", res.status);
      }
    } catch (e: any) {
      console.warn("[Parsing] Groq API error:", e.message);
    }
  }

  if (openRouterApiKey) {
    try {
      console.log("[Parsing] Attempting OpenRouter API...");
      const messages: any[] = [
        { role: "system", content: systemPrompt }
      ];
      if (isImage) {
        messages.push({
          role: "user",
          content: [
            { type: "text", text: `Message to parse: "${userText}"` },
            { type: "image_url", image_url: { url: `data:${mediaData.mimeType};base64,${mediaData.data}` } }
          ]
        });
      } else {
         messages.push({ role: "user", content: `Message to parse: "${userText}"` });
      }
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", { signal: AbortSignal.timeout(15000),
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openRouterApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: isImage ? "google/gemini-2.5-flash" : "meta-llama/llama-3.3-70b-instruct",
          messages: messages,
          response_format: { type: "json_object" },
          temperature: 0.1
        })
      });
      if (res.ok) {
        const data = await res.json();
        return data.choices[0].message.content;
      } else {
        console.warn("[Parsing] OpenRouter API failed with status:", res.status);
      }
    } catch (e: any) {
      console.warn("[Parsing] OpenRouter API error:", e.message);
    }
  }

  console.log("[Parsing] Falling back to official Gemini API...");
  if (!process.env.GEMINI_API_KEY) {
     throw new Error("Missing GEMINI_API_KEY in Secrets. Please configure it in AI Studio to use this feature.");
  }
  const contents: any[] = [];
  if (mediaData) {
    contents.push({
      inlineData: {
        data: mediaData.data,
        mimeType: mediaData.mimeType
      }
    });
  }
  contents.push({ text: `Message to parse: "${userText}"` });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config: {
      responseMimeType: "application/json",
      systemInstruction: systemPrompt
    }
  });

  return response.text || "";
}
