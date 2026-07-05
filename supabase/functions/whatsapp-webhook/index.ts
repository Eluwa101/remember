import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY"); // optional fallback for parsing only
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const USER_TIMEZONE = Deno.env.get("USER_TIMEZONE") || "America/Los_Angeles";
const MAX_BODY_LENGTH = 4000; // guard against pasted essays blowing token budgets
const CLARIFICATION_TTL_MS = 30 * 60 * 1000; // stale unanswered questions expire after 30 min

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function generateTwiMLResponse(message: string) {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message><![CDATA[${message}]]></Message></Response>`,
    { headers: { "Content-Type": "text/xml" } }
  );
}

/** fetch with a hard timeout so one slow provider can't hang the whole webhook */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 9000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// ---------------------------------------------------------------------------
// User resolution
// ---------------------------------------------------------------------------

async function getOrCreateUser(cleanPhone: string): Promise<string> {
  // upsert instead of check-then-insert: avoids the race where two near-simultaneous
  // messages from the same new number both try to insert and one throws a conflict.
  const { data, error } = await supabase
    .from("users")
    .upsert({ whatsapp_number: cleanPhone }, { onConflict: "whatsapp_number", ignoreDuplicates: false })
    .select("id, pending_memory_id")
    .single();

  if (error) {
    console.error("User upsert error:", error);
    throw error;
  }
  return data.id;
}

/**
 * Returns the memory currently awaiting a clarification reply from this user,
 * if any and if it hasn't expired. Expired/missing pending state is cleared.
 */
async function getPendingClarification(userId: string): Promise<{ id: string; raw_content: string } | null> {
  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("pending_memory_id")
    .eq("id", userId)
    .single();

  if (userErr || !user?.pending_memory_id) return null;

  const { data: memory, error: memErr } = await supabase
    .from("memories")
    .select("id, raw_content, created_at")
    .eq("id", user.pending_memory_id)
    .single();

  if (memErr || !memory) {
    await clearPendingClarification(userId);
    return null;
  }

  const age = Date.now() - new Date(memory.created_at).getTime();
  if (age > CLARIFICATION_TTL_MS) {
    console.warn(`Pending clarification for user ${userId} expired — clearing.`);
    await clearPendingClarification(userId);
    return null;
  }

  return { id: memory.id, raw_content: memory.raw_content };
}

async function setPendingClarification(userId: string, memoryId: string): Promise<void> {
  const { error } = await supabase.from("users").update({ pending_memory_id: memoryId }).eq("id", userId);
  if (error) console.error("Failed to set pending clarification:", error);
}

async function clearPendingClarification(userId: string): Promise<void> {
  const { error } = await supabase.from("users").update({ pending_memory_id: null }).eq("id", userId);
  if (error) console.error("Failed to clear pending clarification:", error);
}

// ---------------------------------------------------------------------------
// Intent detection
// ---------------------------------------------------------------------------

type Intent = "list_reminders" | "list_memories" | "search" | "cancel_clarification" | "mark_done" | "snooze" | "save";

// Words that signal "show me a list" rather than "set/mention one in passing" —
// e.g. "reminder" alone shouldn't trigger this (see "remind me to call John"),
// but "reminder" + one of these should.
const LIST_REQUEST_HINTS = ["list", "show", "view", "what are", "do i have", "upcoming", "pending", "give me"];

function detectIntent(queryText: string): { intent: Intent; cleanQuery: string } {
  const t = queryText.toLowerCase().trim();

  const isReminderListRequest =
    t === "reminders" || t === "reminder" ||
    (/\breminders?\b/.test(t) && LIST_REQUEST_HINTS.some((h) => t.includes(h)));
  const isMemoryListRequest =
    t === "memories" || t === "memory" ||
    (/\bmemor(y|ies)\b/.test(t) && LIST_REQUEST_HINTS.some((h) => t.includes(h)));

  if (isReminderListRequest) {
    return { intent: "list_reminders", cleanQuery: queryText };
  }
  if (isMemoryListRequest) {
    return { intent: "list_memories", cleanQuery: queryText };
  }
  if (t.startsWith("search ") || t.startsWith("find ") || t.startsWith("lookup ")) {
    return { intent: "search", cleanQuery: queryText.replace(/^(search|find|lookup)\s+/i, "").trim() };
  }
  if (t.startsWith("recall ")) {
    return { intent: "search", cleanQuery: queryText.replace(/^recall\s+/i, "").trim() };
  }
  if (t === "cancel" || t === "never mind" || t === "nevermind" || t === "forget it") {
    return { intent: "cancel_clarification", cleanQuery: queryText };
  }
  if (t === "done" || t === "mark done" || t === "completed" || t === "complete") {
    return { intent: "mark_done", cleanQuery: queryText };
  }
  if (t === "snooze" || t === "remind me again" || t === "remind me later") {
    return { intent: "snooze", cleanQuery: queryText };
  }
  return { intent: "save", cleanQuery: queryText };
}

// ---------------------------------------------------------------------------
// LLM provider layer
// Embeddings: Gemini only (Groq has no embeddings endpoint — mixing vector
// spaces across models would corrupt similarity search, so no fallback here).
// Parsing/categorization: Gemini primary, Groq fallback (both return the same
// JSON contract).
// ---------------------------------------------------------------------------

async function embedText(text: string): Promise<number[] | null> {
  try {
    const res = await fetchWithTimeout(
      "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=" +
        GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: { parts: [{ text }] },
        }),
      }
    );
    if (!res.ok) {
      console.error("Embedding request failed:", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data?.embedding?.values ?? null;
  } catch (e) {
    console.error("Embedding request threw:", e);
    return null;
  }
}

interface ParsedMemory {
  category: "reminder" | "task" | "insight" | "document" | "uncategorized";
  summary: string;
  entities: string[];
  is_time_bound: boolean;
  execution_time_iso: string | null;
  needs_clarification: boolean;
  ai_response: string;
}

function buildSystemPrompt(): string {
  return `You are the brain of "Remember", an AI Memory Assistant.
Your job is to analyze incoming text or messages from the user on WhatsApp.
First, categorize the message into one of: 'reminder', 'task', 'insight', 'document', 'uncategorized'.
Extract entities (people, places, concepts) and a short summary (max 10 words).
If it is a reminder/time-bound, extract the execution_time in ISO 8601 format. If no time is specified, set is_time_bound to false and execution_time_iso to null. Assume the current time is: ${new Date().toISOString()}.

If the message is genuinely ambiguous in a way that matters (e.g. "remind me to call him" with no indication who "him" is, or "buy groceries" with no time when a time seems intended), set needs_clarification to true and ask ONE tactical follow-up question in ai_response instead of guessing. Only do this when the ambiguity would actually change what gets saved or when the reminder fires — do not ask questions for things that are fine to leave general (e.g. "insight" or "document" style notes rarely need clarification).

If needs_clarification is true, do NOT invent a summary, entities, or execution_time_iso for the missing piece — leave what you don't know out of summary/entities and set execution_time_iso to null unless it truly is known.

Finally, write a natural language response back to the user ("ai_response").
- Do NOT simply say "Memory saved".
- Be conversational, helpful, and natural.
- If it's a clear memory or reminder, acknowledge it naturally (e.g., "Got it, I'll remind you to buy groceries tomorrow at 2pm." or "Interesting thought, I've noted that down for you.").
- Keep responses relatively brief and suitable for WhatsApp.

Respond ONLY in this exact JSON structure (Do NOT wrap in markdown blocks like \`\`\`json):
{
  "category": "reminder|task|insight|document|uncategorized",
  "summary": "Short description",
  "entities": ["entity1", "entity2"],
  "is_time_bound": boolean,
  "execution_time_iso": "YYYY-MM-DDTHH:mm:ssZ" | null,
  "needs_clarification": boolean,
  "ai_response": "The natural language reply to send to the user"
}`;
}

function safeParseJson(raw: string): ParsedMemory | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    // default needs_clarification to false if a provider omits it (older prompt / model quirk)
    if (typeof parsed.needs_clarification !== "boolean") parsed.needs_clarification = false;
    return parsed;
  } catch {
    return null;
  }
}

async function parseWithGemini(queryText: string, systemPrompt: string): Promise<ParsedMemory | null> {
  try {
    const res = await fetchWithTimeout(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
        GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Message to parse: "${queryText}"` }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );
    if (!res.ok) {
      console.error("Gemini parse failed:", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    return safeParseJson(text);
  } catch (e) {
    console.error("Gemini parse threw:", e);
    return null;
  }
}

async function parseWithGroq(queryText: string, systemPrompt: string): Promise<ParsedMemory | null> {
  if (!GROQ_API_KEY) return null;
  try {
    const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Message to parse: "${queryText}"` },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.error("Groq fallback parse failed:", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "{}";
    return safeParseJson(text);
  } catch (e) {
    console.error("Groq fallback parse threw:", e);
    return null;
  }
}

/** Try Gemini first, fall back to Groq. Returns null if both fail (caller must handle gracefully). */
async function parseMemory(queryText: string): Promise<{ parsed: ParsedMemory | null; provider: string }> {
  const systemPrompt = buildSystemPrompt();

  const geminiResult = await parseWithGemini(queryText, systemPrompt);
  if (geminiResult) return { parsed: geminiResult, provider: "gemini" };

  console.warn("Falling back to Groq for parsing.");
  const groqResult = await parseWithGroq(queryText, systemPrompt);
  if (groqResult) return { parsed: groqResult, provider: "groq" };

  return { parsed: null, provider: "none" };
}

// ---------------------------------------------------------------------------
// Intent handlers
// ---------------------------------------------------------------------------

async function handleListReminders(userId: string): Promise<Response> {
  const { data: reminders, error } = await supabase
    .from("reminders")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("target_time", { ascending: true });

  if (error) {
    console.error("List reminders error:", error);
    return generateTwiMLResponse("Oops! I couldn't fetch your reminders right now.");
  }

  if (!reminders || reminders.length === 0) {
    return generateTwiMLResponse("⏰ You have no active upcoming reminders right now. Text me to set one!");
  }

  let reply = "⏰ *Your Upcoming Reminders:*\n\n";
  reminders.forEach((r: any, i: number) => {
    const timeStr = new Date(r.target_time).toLocaleString("en-US", { timeZone: USER_TIMEZONE });
    reply += `${i + 1}. ${r.reminder_text}\n   _(Target: ${timeStr})_\n\n`;
  });
  return generateTwiMLResponse(reply.trim());
}

async function handleListMemories(userId: string): Promise<Response> {
  const { data: memories, error } = await supabase
    .from("memories")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("List memories error:", error);
    return generateTwiMLResponse("Oops! I couldn't fetch your memories right now.");
  }

  if (!memories || memories.length === 0) {
    return generateTwiMLResponse("🧠 You haven't saved any memories yet! Text me anything to remember it.");
  }

  let reply = "🧠 *Your Recent Memories:*\n\n";
  memories.forEach((m: any, i: number) => {
    const typeEmoji = m.category === "reminder" ? "⏰" : "📝";
    const d = new Date(m.created_at).toLocaleDateString();
    reply += `${i + 1}. ${typeEmoji} ${m.raw_content} _(${d})_\n`;
  });
  return generateTwiMLResponse(reply.trim());
}

async function handleSearch(userId: string, cleanQuery: string): Promise<Response> {
  const embeddingValues = await embedText(cleanQuery);

  if (!embeddingValues) {
    return generateTwiMLResponse(
      "🔍 I couldn't run that search right now (embedding service is unavailable). Try again in a bit."
    );
  }

  const { data: matches, error } = await supabase.rpc("match_memories", {
    query_embedding: embeddingValues,
    match_threshold: 0.3,
    match_count: 3,
    p_user_id: userId,
  });

  if (error) {
    console.error("Search RPC error:", error);
    return generateTwiMLResponse("Oops! Something went wrong while searching your memories.");
  }

  if (!matches || matches.length === 0) {
    return generateTwiMLResponse(`🔍 I searched for "${cleanQuery}", but couldn't find any matching memories.`);
  }

  let reply = `🔍 *Search Results for "${cleanQuery}":*\n\n`;
  matches.forEach((m: any, i: number) => {
    const similarity = Math.round(m.similarity * 100);
    reply += `${i + 1}. ${m.raw_content}\n   _(${similarity}% match)_\n\n`;
  });
  return generateTwiMLResponse(reply.trim());
}

async function handleCancelClarification(userId: string): Promise<Response> {
  const pending = await getPendingClarification(userId);
  if (!pending) {
    return generateTwiMLResponse("No problem — I wasn't waiting on anything from you.");
  }
  await clearPendingClarification(userId);
  await supabase.from("memories").update({ status: "complete" }).eq("id", pending.id);
  return generateTwiMLResponse("No worries, I've dropped that one. Let me know if you want to try again.");
}

async function handleMarkDone(userId: string): Promise<Response> {
  // Find the most recent sent reminder
  const { data: recentReminders, error } = await supabase
    .from("reminders")
    .select("id, reminder_text")
    .eq("user_id", userId)
    .eq("status", "sent")
    .order("target_time", { ascending: false })
    .limit(1);

  if (error || !recentReminders || recentReminders.length === 0) {
    return generateTwiMLResponse("You don't have any recent reminders to mark as done.");
  }

  const remId = recentReminders[0].id;
  await supabase.from("reminders").update({ status: "completed" }).eq("id", remId);

  return generateTwiMLResponse(`✅ Awesome, I've marked "${recentReminders[0].reminder_text}" as done!`);
}

async function handleSnooze(userId: string): Promise<Response> {
  // Find the most recent sent reminder
  const { data: recentReminders, error } = await supabase
    .from("reminders")
    .select("id, memory_id, reminder_text")
    .eq("user_id", userId)
    .eq("status", "sent")
    .order("target_time", { ascending: false })
    .limit(1);

  if (error || !recentReminders || recentReminders.length === 0) {
    return generateTwiMLResponse("You don't have any recent reminders to snooze.");
  }

  const memoryId = recentReminders[0].memory_id;
  // Mark the current user as needing clarification on this memory again
  await setPendingClarification(userId, memoryId);
  // Update memory status back to pending_clarification
  await supabase.from("memories").update({ status: "pending_clarification" }).eq("id", memoryId);

  return generateTwiMLResponse(`Sure, I can remind you about "${recentReminders[0].reminder_text}" again. When should I remind you?`);
}

/**
 * Runs parse+embed for the given text and writes the result to an existing
 * memory row. Shared by both fresh saves and clarification follow-ups so the
 * "needs another round of clarification" logic only lives in one place.
 */
async function enrichAndFinalizeMemory(
  userId: string,
  memoryId: string,
  fullText: string,
  mediaUrl: string | null
): Promise<string> {
  const [{ parsed, provider }, embeddingValues] = await Promise.all([
    parseMemory(fullText),
    embedText(fullText),
  ]);

  if (!embeddingValues) {
    console.error(`Embedding failed for memory ${memoryId} — will not be searchable until backfilled.`);
    await supabase.from("memories").update({ embedding_status: "failed" }).eq("id", memoryId);
  } else {
    // Replace any prior embedding for this memory (relevant on the clarification-merge path).
    await supabase.from("memory_embeddings").delete().eq("memory_id", memoryId);
    const { error: embedInsertErr } = await supabase
      .from("memory_embeddings")
      .insert({ memory_id: memoryId, embedding: embeddingValues });
    if (embedInsertErr) console.error("Embedding insert error:", embedInsertErr);
  }

  if (!parsed) {
    console.error(`Parsing failed for memory ${memoryId} (both providers down).`);
    await clearPendingClarification(userId);
    await supabase.from("memories").update({ status: "complete" }).eq("id", memoryId);
    return "🧠 *Memory Saved* (uncategorized — my parsing brain is briefly unavailable, but nothing is lost). Ask me to search for it anytime.";
  }

  await supabase
    .from("memories")
    .update({
      raw_content: fullText,
      category: parsed.category || "uncategorized",
      status: parsed.needs_clarification ? "pending_clarification" : "complete",
      metadata: {
        summary: parsed.summary,
        entities: parsed.entities,
        is_time_bound: parsed.is_time_bound,
        execution_time_iso: parsed.execution_time_iso,
        media_url: mediaUrl,
        parsed_by: provider,
      },
    })
    .eq("id", memoryId);

  if (parsed.needs_clarification) {
    // Still incomplete — keep waiting instead of creating a reminder off a guess.
    await setPendingClarification(userId, memoryId);
    return parsed.ai_response || "Could you tell me a bit more?";
  }

  await clearPendingClarification(userId);

  if (parsed.is_time_bound && parsed.execution_time_iso) {
    const targetTime = new Date(parsed.execution_time_iso);
    
    // Check if a reminder for this memory already exists
    const { data: existingRem } = await supabase.from("reminders").select("id").eq("memory_id", memoryId).order("created_at", { ascending: false }).limit(1);
    
    if (existingRem && existingRem.length > 0) {
      const { error: remErr } = await supabase.from("reminders").update({
        reminder_text: parsed.summary || fullText,
        target_time: targetTime.toISOString(),
        status: "pending"
      }).eq("id", existingRem[0].id);
      if (remErr) console.error("Reminder update error:", remErr);
    } else {
      const { error: remErr } = await supabase.from("reminders").insert({
        user_id: userId,
        memory_id: memoryId,
        reminder_text: parsed.summary || fullText,
        target_time: targetTime.toISOString(),
        status: "pending",
      });
      if (remErr) console.error("Reminder insert error:", remErr);
    }
  }

  return parsed.ai_response || "Got it, I've noted that down.";
}

async function handleSave(userId: string, queryText: string, mediaUrl: string | null): Promise<Response> {
  const pending = await getPendingClarification(userId);

  if (pending) {
    // Treat this message as the answer to the outstanding question, not a new memory.
    const mergedText = `${pending.raw_content}\n(clarification: ${queryText})`;
    const reply = await enrichAndFinalizeMemory(userId, pending.id, mergedText, mediaUrl);
    return generateTwiMLResponse(reply);
  }

  // 1. Save the raw message FIRST, uncategorized. Losing the user's message because
  //    enrichment (LLM/embedding) failed is worse than a plain, unenriched save.
  const { data: memory, error: memErr } = await supabase
    .from("memories")
    .insert({
      user_id: userId,
      raw_content: queryText,
      category: "uncategorized",
      status: "complete",
      source_channel: "whatsapp",
      metadata: { media_url: mediaUrl },
    })
    .select("id")
    .single();

  if (memErr) {
    console.error("Memory insert error:", memErr);
    return generateTwiMLResponse("Oops! I encountered an error saving your message.");
  }

  const reply = await enrichAndFinalizeMemory(userId, memory.id, queryText, mediaUrl);
  return generateTwiMLResponse(reply);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const rawBody = await req.text();
    const params = new URLSearchParams(rawBody);
    const From = params.get("From");
    const Body = params.get("Body");
    const MediaUrl0 = params.get("MediaUrl0");

    if (!From) {
      return new Response("No sender", { status: 400 });
    }

    const cleanPhone = From.replace("whatsapp:", "").replace(/[^0-9]/g, "").trim();
    let queryText = (Body || "").trim();

    if (queryText.length > MAX_BODY_LENGTH) {
      queryText = queryText.slice(0, MAX_BODY_LENGTH);
      console.warn(`Truncated oversized message from ${cleanPhone} to ${MAX_BODY_LENGTH} chars.`);
    }

    const userId = await getOrCreateUser(cleanPhone);
    const { intent, cleanQuery } = detectIntent(queryText);

    switch (intent) {
      case "list_reminders":
        return await handleListReminders(userId);
      case "list_memories":
        return await handleListMemories(userId);
      case "search":
        return await handleSearch(userId, cleanQuery);
      case "cancel_clarification":
        return await handleCancelClarification(userId);
      case "mark_done":
        return await handleMarkDone(userId);
      case "snooze":
        return await handleSnooze(userId);
      case "save":
      default:
        return await handleSave(userId, queryText, MediaUrl0);
    }
  } catch (err: any) {
    console.error("Unhandled error:", err);
    return generateTwiMLResponse("Oops! I encountered an error processing your message.");
  }
});