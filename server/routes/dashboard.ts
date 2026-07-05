import express from "express";
import { supabase } from "../env";
import { requireDashboardAuth } from "../middleware/dashboardAuth";
import { resolveUserId, getUserProfile, saveUserProfile, parseWithFallback, safeEmbedContent } from "../services/memory";

export const dashboardRouter = express.Router();

dashboardRouter.get("/api/dashboard/summary", requireDashboardAuth, async (req, res) => {
  try {
    const { phone, timezone, name } = req.query;

    // Lookup or create user using ultra-robust resolution helper
    const userId = await resolveUserId(phone as string);

    // If frontend sends browser timezone/name, sync them automatically
    if (timezone) {
      await saveUserProfile(userId, {
        timezone: timezone as string,
        ...(name ? { name: name as string } : {})
      });
    }

    // Get user profile (timezone, name, etc.)
    const profile = await getUserProfile(userId);

    // Fetch memories
    const { data: memories } = await supabase
      .from("memories")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    // Filter out internal system profile records to keep the UI clean
    const filteredMemories = (memories || []).filter(
      m => !(m.metadata && m.metadata.is_user_profile === true)
    );

    // Fetch reminders
    const { data: reminders } = await supabase
      .from("reminders")
      .select("*")
      .eq("user_id", userId)
      .order("target_time", { ascending: true });

    res.json({
      memories: filteredMemories || [],
      reminders: reminders || [],
      profile
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to manually add memory via Web UI dashboard
dashboardRouter.post("/api/web/memories", requireDashboardAuth, async (req: any, res: any) => {
  const { content: textContent, media } = req.body;
  const phone = req.user.phone;
  if (!textContent && !media) {
    res.status(400).json({ error: "Phone and content are required." });
    return;
  }

  try {
    // Find or create user using ultra-robust resolution helper
    const userId = await resolveUserId(phone);
    console.log(`[Save Memory API] Resolved userId: ${userId} for phone: ${phone}`);

    // DIAGNOSTIC CHECK: Verify if the user row actually exists in the users table
    const { data: verifyUser, error: verifyErr } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    console.log("[Save Memory API] DIAGNOSTIC - Verifying resolved user in database:", {
      resolvedUserId: userId,
      foundInDb: !!verifyUser,
      dbUserRecord: verifyUser,
      verifyError: verifyErr ? verifyErr.message : null
    });

    if (!verifyUser) {
      console.warn("[Save Memory API] WARNING: User row does not actually exist in the database despite resolution! This explains the foreign key violation.");
    }

    const profile = await getUserProfile(userId);
    const userTimezone = profile.timezone || "America/Los_Angeles";
    const currentLocalTimeStr = new Date().toLocaleString("en-US", { timeZone: userTimezone });

    const systemPrompt = `You are the parsing brain of "Remember" AI Memory Assistant.
Your job is to analyze incoming text or messages, categorize them into one of the following:
- 'reminder' (if it specifies an action to be reminded of at a certain time)
- 'task' (if it is a clear actionable task but no specific time is mentioned, or it is a list of tasks)
- 'insight' (if it is an interesting thought, note, realization, or idea to remember)
- 'document' (if it looks like a recipe, code snippet, contact info, receipts, or documentation details)
- 'uncategorized' (for anything else)

Identify if the message is time-bound (specifically for reminders or scheduled tasks).
If it is time-bound:
1. Determine the target execution time.
2. Format it as an absolute ISO 8601 string (e.g. "2026-07-03T15:00:00-07:00").
3. Keep in mind that the current local reference time is ${currentLocalTimeStr} (Timezone: ${userTimezone}). Use this reference to calculate relative times.

Return a JSON object conforming exactly to this structure:
{
  "category": "reminder" | "task" | "insight" | "document" | "uncategorized",
  "is_time_bound": boolean,
  "execution_time_iso": string | null,
  "summary": string,
  "entities": {
    "key_points": string[],
    "dates_mentioned": string[],
    "people": string[],
    "actions": string[]
  }
}
Do not include any Markdown blocks (like \`\`\`json) in your raw response. Return only the JSON string.`;

    // 1. Save raw memory first
    const { data: memory, error: mErr } = await supabase
      .from("memories")
      .insert({
        user_id: userId,
        raw_content: textContent || "[Media Upload]",
        category: "uncategorized",
        source_channel: "web"
      })
      .select("id")
      .single();

    if (mErr) {
      throw new Error(`Database error saving memory: ${mErr.message} (user_id: ${userId})`);
    }

    const cleanJsonText = await parseWithFallback(systemPrompt, textContent || "", media);
    let parsed: any = {};
    try {
      parsed = JSON.parse(cleanJsonText);
      await supabase.from("memories").update({
        category: parsed.category || "uncategorized",
        metadata: {
          summary: parsed.summary,
          entities: parsed.entities,
          is_time_bound: parsed.is_time_bound,
          execution_time_iso: parsed.execution_time_iso
        }
      }).eq("id", memory.id);
    } catch (parseErr) {
      console.error("Failed to parse JSON, saving raw memory only.", cleanJsonText);
      parsed = { category: "uncategorized" };
    }

    // Embed content
    const embeddingValues = await safeEmbedContent(textContent || "[Media Upload]");
    if (embeddingValues) {
      await supabase
        .from("memory_embeddings")
        .insert({
          memory_id: memory.id,
          embedding: embeddingValues
        });
    }

    // If time bound reminder
    if (parsed.is_time_bound && parsed.execution_time_iso) {
      await supabase
        .from("reminders")
        .insert({
          user_id: userId,
          memory_id: memory.id,
          reminder_text: parsed.summary || textContent,
          target_time: new Date(parsed.execution_time_iso).toISOString(),
          status: "pending"
        });
    }

    res.json({ success: true, parsed });

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to delete memories from dashboard
dashboardRouter.post("/api/web/memories/delete", requireDashboardAuth, async (req, res) => {
  const { id, phone } = req.body;
  if (!id || !phone) {
    res.status(400).json({ error: "Memory ID required" });
    return;
  }
  try {
    const userId = await resolveUserId(phone);
    const { error } = await supabase.from("memories").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
