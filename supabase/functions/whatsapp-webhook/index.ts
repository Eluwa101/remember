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
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
// Exact public URL Twilio is configured to POST to. Required when this function sits behind
// a proxy/gateway that rewrites the request URL Deno sees — Twilio signs the URL it actually
// called, so a mismatch here fails every signature check. Falls back to req.url if unset.
const TWILIO_WEBHOOK_URL = Deno.env.get("TWILIO_WEBHOOK_URL");
const MAX_BODY_LENGTH = 4000; // guard against pasted essays blowing token budgets
const CLARIFICATION_TTL_MS = 30 * 60 * 1000; // stale unanswered questions expire after 30 min

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

/**
 * Verifies the X-Twilio-Signature header per Twilio's request-validation
 * algorithm: HMAC-SHA1(authToken, url + sorted concatenation of "key"+"value"
 * for every POST param), base64-encoded. Without this, anyone who finds the
 * webhook URL can POST arbitrary From/Body values and impersonate any user.
 */
async function isValidTwilioSignature(req: Request, rawBody: string): Promise<boolean> {
  const signature = req.headers.get("X-Twilio-Signature");
  if (!signature || !TWILIO_AUTH_TOKEN) return false;

  const params = new URLSearchParams(rawBody);
  const sortedKeys = [...params.keys()].sort();
  let data = TWILIO_WEBHOOK_URL || req.url;
  for (const key of sortedKeys) {
    data += key + (params.get(key) ?? "");
  }

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(TWILIO_AUTH_TOKEN),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sigBytes = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  return expected === signature;
}

function generateTwiMLResponse(message: string) {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message><![CDATA[${message}]]></Message></Response>`,
    { headers: { "Content-Type": "text/xml" } }
  );
}

/** Acks a Twilio retry with no outbound message, since the original delivery already replied. */
function emptyTwiMLResponse() {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
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

type Intent = "list_reminders" | "list_memories" | "search" | "general_question" | "cancel_clarification" | "mark_done" | "snooze" | "chitchat" | "update_profile" | "save";

interface UserProfileFields {
  name?: string;
  title?: string;
  timezone?: string;
}

async function getUserProfileFields(userId: string): Promise<UserProfileFields> {
  const { data, error } = await supabase.from("users").select("name, title, timezone").eq("id", userId).single();
  if (error || !data) return {};
  return {
    name: data.name || undefined,
    title: data.title || undefined,
    timezone: data.timezone || undefined,
  };
}

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates and persists any profile info the model opportunistically extracted
 * from a message. Returns only the fields that were actually applied, so callers
 * can build an accurate confirmation instead of trusting the model's free text
 * for facts the code itself can verify.
 */
async function applyDetectedProfileFields(
  userId: string,
  parsed: Pick<ParsedMemory, "detected_name" | "detected_timezone"> | null | undefined
): Promise<{ name?: string; timezone?: string }> {
  if (!parsed) return {};
  const updates: Record<string, string> = {};
  if (parsed.detected_name && parsed.detected_name.trim()) {
    updates.name = parsed.detected_name.trim();
  }
  if (parsed.detected_timezone && isValidTimezone(parsed.detected_timezone)) {
    updates.timezone = parsed.detected_timezone;
  }
  if (Object.keys(updates).length === 0) return {};

  const { error } = await supabase.from("users").update(updates).eq("id", userId);
  if (error) {
    console.error("Failed to apply detected profile fields:", error);
    return {};
  }
  return updates;
}

// Words that signal "show me a list" rather than "set/mention one in passing" —
// e.g. "reminder" alone shouldn't trigger this (see "remind me to call John"),
// but "reminder" + one of these should.
const LIST_REQUEST_HINTS = ["list", "show", "view", "what are", "do i have", "upcoming", "pending", "give me"];

// Exact-match only (never a substring check) — these are common enough to shortcut
// for free, but a longer message that happens to start with "ok" or "great" (e.g.
// "ok remind me to call mom tomorrow") must NOT be caught here, only a bare filler.
const CHITCHAT_GREETINGS = ["hi", "hii", "hiya", "hello", "hey", "hey there", "yo"];
const CHITCHAT_ACKNOWLEDGMENTS = [
  "ok", "okay", "k", "kk", "cool", "nice", "great", "awesome", "perfect", "sounds good",
  "thanks", "thank you", "thanks!", "thank you!", "ty", "👍", "🙏", "lol", "haha",
];

/**
 * Zero-cost pattern match for unambiguous short commands — no LLM call needed.
 * Returns null (rather than defaulting to "save") when nothing obviously matches,
 * so the caller knows to fall through to LLM-based classification instead of
 * silently treating an unrecognized command as a new memory.
 */
function detectFastIntent(queryText: string): { intent: Exclude<Intent, "save">; cleanQuery: string } | null {
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
  if (CHITCHAT_GREETINGS.includes(t) || CHITCHAT_ACKNOWLEDGMENTS.includes(t)) {
    return { intent: "chitchat", cleanQuery: queryText };
  }
  return null;
}

/** Canned reply for chitchat caught by the fast path (no LLM call, so no generated text available). */
function pickChitchatReply(queryText: string): string {
  const t = queryText.toLowerCase().trim();
  if (CHITCHAT_GREETINGS.includes(t)) {
    return "Hey there! 👋 What can I help you remember today?";
  }
  return "You're welcome! I'm here whenever you need me. 🙂";
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
  intent: Intent;
  category: "reminder" | "task" | "insight" | "document" | "uncategorized";
  summary: string;
  entities: string[];
  is_time_bound: boolean;
  execution_time_iso: string | null;
  needs_clarification: boolean;
  is_safe_keep: boolean;
  detected_name: string | null;
  detected_timezone: string | null;
  ai_response: string;
}

const VALID_INTENTS: Intent[] = [
  "list_reminders", "list_memories", "search", "general_question", "cancel_clarification", "mark_done", "snooze", "chitchat", "update_profile", "save",
];

function buildSystemPrompt(profile: UserProfileFields): string {
  const nowUtc = new Date().toISOString();
  const nowContext = profile.timezone
    ? `Right now it's ${nowUtc} in UTC, which is ${new Date().toLocaleString("en-US", { timeZone: profile.timezone })} in the user's local timezone (${profile.timezone}).`
    : `Right now it's ${nowUtc} in UTC. The user's timezone isn't known yet, so treat this as the best available "current time" for anything not reminder-related.`;

  const timeContext = profile.timezone
    ? `The user's timezone is ${profile.timezone}. Resolve all relative times ("tomorrow", "at 4", "in an hour", "4pm") against their local time given above, and always produce execution_time_iso as a proper ISO 8601 string carrying that timezone's UTC offset — never assume UTC.`
    : `The user's timezone is NOT known yet. Do not guess one. If this message is time-bound (would need an execution_time_iso), set needs_clarification to true and ask for their city or timezone in ai_response instead of guessing — getting this wrong means their reminder fires at the wrong time. If the message is NOT time-bound, proceed normally; not knowing their timezone doesn't block anything else.`;

  return `You are the brain of "Remember", an AI Memory Assistant on WhatsApp.
${profile.name ? `You know the user as ${profile.title ? profile.title + " " : ""}${profile.name}.` : "You don't know the user's name yet."}
${nowContext}

You are also a normal conversational AI — the user can ask you plain questions (general knowledge, today's date, small talk) the same way they would ask any AI assistant, not just give you things to remember. Don't make them feel like every message has to be a command.

STEP 1 — Classify the user's intent into exactly one of:
- "list_reminders": asking to see their existing reminders (e.g. "what are my reminders", "give me a list of my pending reminders")
- "list_memories": asking to see their saved memories/notes (e.g. "show my memories", "what have I saved")
- "search": asking to find/recall something specific from THEIR OWN memories/reminders previously saved with this bot (e.g. "what did I save about the parking code", "find my note about the meeting"). Never use this for general knowledge or anything not about their own saved data.
- "general_question": a general-knowledge, factual, or conversational question that has NOTHING to do with their own saved data — e.g. "what's today's date", "what time is it", "who is the president of the US", "what's the capital of France", "how are you", "what can you do". Answer directly and naturally in ai_response using your own knowledge and the current-time info given above. If you genuinely don't know, or the question needs real-time/current-event info you can't be confident about (news, sports scores, weather, stock prices, anything after your training), say so plainly and gracefully — e.g. "Sorry, I don't have up-to-date knowledge on that" — rather than guessing or making something up.
- "mark_done": saying a reminder is done/completed
- "snooze": asking to be reminded again later about the last reminder that fired
- "cancel_clarification": saying never mind / cancel in reply to a clarifying question you just asked
- "chitchat": greetings, thanks, acknowledgments, small talk with nothing to actually answer or remember (e.g. "hi", "thanks!", "ok cool", "haha nice", "sounds good"). If they're asking something that expects an actual answer, use "general_question" instead, even if it's casual (e.g. "how are you" is general_question, "haha nice" is chitchat).
- "update_profile": the user is telling you their name/what to call them, or their location/timezone, and THAT IS THE ENTIRE POINT of the message (e.g. "call me Dave", "my name is Dave", "I'm in Lagos, Nigeria", "set my timezone to Africa/Lagos"). If the message ALSO contains a genuine new note/reminder to save, classify as "save" instead and let the STEP 3 detection below carry the profile info alongside it — never drop a reminder just to record a name.
- "save": anything else — a brand new note, task, insight, or reminder the user actually wants remembered

STEP 2 — Only if intent is "save", also categorize the message into one of: 'reminder', 'task', 'insight', 'document', 'uncategorized'.
Extract entities (people, places, concepts) and a short summary (max 10 words).
If it is a reminder/time-bound, extract the execution_time in ISO 8601 format. If no time is specified, set is_time_bound to false and execution_time_iso to null. ${timeContext}

If the message is genuinely ambiguous in a way that matters (e.g. "remind me to call him" with no indication who "him" is, or "buy groceries" with no time when a time seems intended), set needs_clarification to true and ask ONE tactical follow-up question in ai_response instead of guessing. Only do this when the ambiguity would actually change what gets saved or when the reminder fires — do not ask questions for things that are fine to leave general (e.g. "insight" or "document" style notes rarely need clarification).

If needs_clarification is true, do NOT invent a summary, entities, or execution_time_iso for the missing piece — leave what you don't know out of summary/entities and set execution_time_iso to null unless it truly is known.

Also set is_safe_keep to true if the message contains something worth keeping around for a long time for personal reference — passwords, PINs, ID/account numbers, important dates, anniversaries, addresses, or similar. These get a much longer retention period than ordinary saves. Leave it false for everything else, including ordinary reminders/tasks/insights.

STEP 3 — On ANY message, regardless of intent, opportunistically check if the user reveals their name or timezone/location and extract it:
- "detected_name": their name or what they want to be called, as a plain string, or null if not mentioned in this message.
- "detected_timezone": if they mention a city, country, or timezone, convert it to the single best-matching real IANA timezone name (e.g. "Lagos" -> "Africa/Lagos", "New York" -> "America/New_York", "GMT+1" -> a reasonable equivalent zone), or null if not mentioned in this message. Only set this if you can confidently produce one specific real IANA zone name — never guess vaguely, and never invent a zone that doesn't exist.

Special case — clarification replies: if the message contains a "(clarification: ...)" suffix, that's the user's reply to a question you asked about an earlier, still-unsaved message. If that reply actually answers the question, merge it in and finalize normally (needs_clarification: false). If the original question was asking for their timezone/city, use their answer to BOTH resolve the original relative time into execution_time_iso AND populate detected_timezone so it's remembered going forward. But if the reply does NOT answer the question — e.g. it's a greeting, off-topic, or otherwise doesn't resolve the ambiguity — set needs_clarification back to true and ask again in ai_response, rather than saving a garbled memory that stitches the original text together with an unrelated reply.

Finally, write a natural language response back to the user ("ai_response"). This field is ONLY ever shown to the user when intent is "save", "chitchat", or "general_question" — for every other intent (including "update_profile") it is discarded and either a real database lookup or a code-constructed confirmation answers them instead, so do not guess at facts you don't have (e.g. never claim what their reminders/memories do or don't contain).
- Do NOT simply say "Memory saved".
- Be conversational, helpful, and natural.
- If it's a clear memory or reminder, acknowledge it naturally (e.g., "Got it, I'll remind you to buy groceries tomorrow at 2pm." or "Interesting thought, I've noted that down for you.").
- Keep responses relatively brief and suitable for WhatsApp.

Respond ONLY in this exact JSON structure (Do NOT wrap in markdown blocks like \`\`\`json):
{
  "intent": "list_reminders" | "list_memories" | "search" | "general_question" | "mark_done" | "snooze" | "cancel_clarification" | "chitchat" | "update_profile" | "save",
  "category": "reminder|task|insight|document|uncategorized",
  "summary": "Short description",
  "entities": ["entity1", "entity2"],
  "is_time_bound": boolean,
  "execution_time_iso": "YYYY-MM-DDTHH:mm:ssZ" | null,
  "needs_clarification": boolean,
  "is_safe_keep": boolean,
  "detected_name": string | null,
  "detected_timezone": string | null,
  "ai_response": "The natural language reply to send to the user — only used when intent is 'save', 'chitchat', or 'general_question'"
}`;
}

function safeParseJson(raw: string): ParsedMemory | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    // default needs_clarification to false if a provider omits it (older prompt / model quirk)
    if (typeof parsed.needs_clarification !== "boolean") parsed.needs_clarification = false;
    // default is_safe_keep to false if a provider omits it
    if (typeof parsed.is_safe_keep !== "boolean") parsed.is_safe_keep = false;
    // default to "save" if a provider omits/mangles intent — safest fallback (never loses the message)
    if (!VALID_INTENTS.includes(parsed.intent)) parsed.intent = "save";
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
async function parseMemory(queryText: string, profile: UserProfileFields): Promise<{ parsed: ParsedMemory | null; provider: string }> {
  const systemPrompt = buildSystemPrompt(profile);

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

async function handleListReminders(userId: string, profile: UserProfileFields): Promise<Response> {
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

  const displayTimezone = profile.timezone || USER_TIMEZONE;
  let reply = "⏰ *Your Upcoming Reminders:*\n\n";
  reminders.forEach((r: any, i: number) => {
    const timeStr = new Date(r.target_time).toLocaleString("en-US", { timeZone: displayTimezone });
    reply += `${i + 1}. ${r.reminder_text}\n   _(Target: ${timeStr})_\n\n`;
  });
  return generateTwiMLResponse(reply.trim());
}

/** "update_profile" intent handler — applies whatever the model extracted and
 * builds its OWN confirmation from the validated fields rather than trusting
 * the model's free-form ai_response, consistent with how every other intent
 * here only ever confirms facts the code itself controls. */
async function handleUpdateProfile(userId: string, parsed: ParsedMemory | null): Promise<Response> {
  const updates = await applyDetectedProfileFields(userId, parsed);
  if (!updates.name && !updates.timezone) {
    return generateTwiMLResponse('Sorry, I didn\'t catch what you\'d like me to update — try "call me Dave" or "my timezone is Africa/Lagos".');
  }
  const parts: string[] = [];
  if (updates.name) parts.push(`I'll call you ${updates.name} from now on`);
  if (updates.timezone) parts.push(`I've set your timezone to ${updates.timezone}`);
  return generateTwiMLResponse(`Got it — ${parts.join(" and ")}.`);
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
  // fulfilled_at drives the archive sweep's 7-day countdown (server/services/archive.ts).
  // Using "now" rather than target_time matters here specifically: a "done" reply can
  // arrive days after target_time, and target_time alone would put the memory instantly
  // past its review window the moment it's marked complete.
  const { error: updateErr } = await supabase
    .from("reminders")
    .update({ status: "completed", fulfilled_at: new Date().toISOString() })
    .eq("id", remId);
  if (updateErr) {
    console.error("Mark-done update error:", updateErr);
    return generateTwiMLResponse("Oops! I hit an error marking that as done. Please try again.");
  }

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
  mediaUrl: string | null,
  mediaContentType: string | null = null,
  profile: UserProfileFields = {},
  preParsed?: { parsed: ParsedMemory | null; provider: string }
): Promise<string> {
  const [{ parsed, provider }, embeddingValues] = await Promise.all([
    preParsed ?? parseMemory(fullText, profile),
    embedText(fullText),
  ]);

  // Applied unconditionally (even if still needs_clarification) — this is what lets the
  // very reply that answers "what's your timezone?" both resolve the original reminder's
  // time below AND get remembered so future messages never need to ask again.
  await applyDetectedProfileFields(userId, parsed);

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

  // Only overwrite raw_content/category once we're actually finalizing. If this reply
  // didn't resolve the clarification (see the prompt's "clarification replies" rule —
  // needs_clarification can come back true again), keep the original text untouched so
  // the NEXT reply merges against the clean original instead of an ever-growing chain
  // of failed attempts (e.g. "I like it\n(clarification: Hi)\n(clarification: ...)").
  const updatePayload: Record<string, unknown> = {
    status: parsed.needs_clarification ? "pending_clarification" : "complete",
    metadata: {
      summary: parsed.summary,
      entities: parsed.entities,
      is_time_bound: parsed.is_time_bound,
      execution_time_iso: parsed.execution_time_iso,
      media_url: mediaUrl,
      media_content_type: mediaContentType,
      parsed_by: provider,
    },
  };
  if (!parsed.needs_clarification) {
    updatePayload.raw_content = fullText;
    updatePayload.category = parsed.category || "uncategorized";

    if (parsed.is_safe_keep) {
      // Don't clobber a day-count the user already edited on a prior message revision —
      // only apply the default the first time this memory gets flagged as safe-keep.
      const { data: existing } = await supabase.from("memories").select("is_safe_keep").eq("id", memoryId).single();
      if (!existing?.is_safe_keep) {
        const defaultDays = 90;
        updatePayload.is_safe_keep = true;
        updatePayload.safe_keep_days = defaultDays;
        updatePayload.safe_keep_expires_at = new Date(Date.now() + defaultDays * 24 * 60 * 60 * 1000).toISOString();
      }
    }
  }
  await supabase.from("memories").update(updatePayload).eq("id", memoryId);

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
        status: "pending",
        fulfilled_at: null
      }).eq("id", existingRem[0].id);
      if (remErr) console.error("Reminder update error:", remErr);
      // This reminder is becoming live again (e.g. a snooze giving it a new time) —
      // if its memory had already been archived, un-archive it. Otherwise the archive
      // sweep would have no reason to know it's active again and it'd sit stuck in
      // the Archive view while quietly becoming a live reminder underneath.
      await supabase.from("memories").update({ archived_at: null, archive_snoozed_until: null }).eq("id", memoryId);
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

async function handleSave(
  userId: string,
  queryText: string,
  mediaUrl: string | null,
  mediaContentType: string | null = null,
  profile: UserProfileFields = {},
  preParsed?: { parsed: ParsedMemory | null; provider: string }
): Promise<Response> {
  // Note: pending-clarification replies are intercepted earlier in the main handler,
  // before intent classification even runs, so this always handles a fresh memory.

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
      metadata: { media_url: mediaUrl, media_content_type: mediaContentType },
    })
    .select("id")
    .single();

  if (memErr) {
    console.error("Memory insert error:", memErr);
    return generateTwiMLResponse("Oops! I encountered an error saving your message.");
  }

  const reply = await enrichAndFinalizeMemory(userId, memory.id, queryText, mediaUrl, mediaContentType, profile, preParsed);
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

    if (!(await isValidTwilioSignature(req, rawBody))) {
      console.warn("Rejected webhook request: invalid or missing Twilio signature.");
      return new Response("Forbidden", { status: 403 });
    }

    const params = new URLSearchParams(rawBody);
    const From = params.get("From");
    const Body = params.get("Body");
    const MediaUrl0 = params.get("MediaUrl0");
    const MediaContentType0 = params.get("MediaContentType0");
    const MessageSid = params.get("MessageSid");

    if (!From) {
      return new Response("No sender", { status: 400 });
    }

    // Twilio retries a webhook delivery if it doesn't get a timely response (this handler
    // chains two ~9s-timeout LLM calls plus several DB round-trips, so it can run close to
    // that edge). Recording MessageSid first and bailing out on a duplicate insert stops a
    // retry from creating a second memory/reminder for the same inbound message.
    if (MessageSid) {
      const { error: dupeError } = await supabase
        .from("processed_webhook_messages")
        .insert({ message_sid: MessageSid });
      if (dupeError) {
        if (dupeError.code === "23505") {
          console.log(`Duplicate Twilio delivery for MessageSid ${MessageSid} — acking without reprocessing.`);
          return emptyTwiMLResponse();
        }
        console.error("Failed to record webhook MessageSid (continuing without dedup):", dupeError);
      }
    }

    const cleanPhone = From.replace("whatsapp:", "").replace(/[^0-9]/g, "").trim();
    let queryText = (Body || "").trim();

    if (queryText.length > MAX_BODY_LENGTH) {
      queryText = queryText.slice(0, MAX_BODY_LENGTH);
      console.warn(`Truncated oversized message from ${cleanPhone} to ${MAX_BODY_LENGTH} chars.`);
    }

    const userId = await getOrCreateUser(cleanPhone);
    const profile = await getUserProfileFields(userId);

    // Clarification replies take priority over everything else — never run intent
    // detection on what's actually an answer to a question we just asked.
    const pending = await getPendingClarification(userId);
    if (pending) {
      const mergedText = `${pending.raw_content}\n(clarification: ${queryText})`;
      const reply = await enrichAndFinalizeMemory(userId, pending.id, mergedText, MediaUrl0, MediaContentType0, profile);
      return generateTwiMLResponse(reply);
    }

    // Fast, free path for unambiguous short commands — no LLM call needed.
    const fastIntent = detectFastIntent(queryText);
    if (fastIntent) {
      switch (fastIntent.intent) {
        case "list_reminders":
          return await handleListReminders(userId, profile);
        case "list_memories":
          return await handleListMemories(userId);
        case "search":
          return await handleSearch(userId, fastIntent.cleanQuery);
        case "cancel_clarification":
          return await handleCancelClarification(userId);
        case "mark_done":
          return await handleMarkDone(userId);
        case "snooze":
          return await handleSnooze(userId);
        case "chitchat":
          return generateTwiMLResponse(pickChitchatReply(fastIntent.cleanQuery));
      }
    }

    // No obvious fast match — one LLM call both classifies the intent and parses
    // the message (in case it turns out to be a save), so a genuine new memory
    // never pays for a second round-trip. Only "save"/"chitchat"/"general_question"
    // ever use ai_response; every other intent below answers from a real database query.
    const classification = await parseMemory(queryText, profile);
    const intent = classification.parsed?.intent || "save";

    switch (intent) {
      case "list_reminders":
        return await handleListReminders(userId, profile);
      case "list_memories":
        return await handleListMemories(userId);
      case "search":
        return await handleSearch(userId, queryText);
      case "chitchat":
        // Nothing worth saving — reply and skip the memories table entirely.
        return generateTwiMLResponse(classification.parsed?.ai_response || "👍");
      case "general_question":
        // A normal question unrelated to their own saved data — answer directly from
        // the model's own knowledge rather than running it through memory search.
        return generateTwiMLResponse(classification.parsed?.ai_response || "Sorry, I'm not able to answer that right now — try again in a bit.");
      case "update_profile":
        return await handleUpdateProfile(userId, classification.parsed);
      case "cancel_clarification":
        return await handleCancelClarification(userId);
      case "mark_done":
        return await handleMarkDone(userId);
      case "snooze":
        return await handleSnooze(userId);
      case "save":
      default:
        return await handleSave(userId, queryText, MediaUrl0, MediaContentType0, profile, classification);
    }
  } catch (err: any) {
    console.error("Unhandled error:", err);
    return generateTwiMLResponse("Oops! I encountered an error processing your message.");
  }
});