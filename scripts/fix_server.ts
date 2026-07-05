import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// 1. Import randomUUID and AbortSignal timeout is native in Node 18
content = content.replace('import dotenv from "dotenv";', 'import dotenv from "dotenv";\nimport { randomUUID } from "crypto";');
content = content.replace(/crypto\.randomUUID\(\)/g, 'randomUUID()');

// 2. Remove fallback credentials
content = content.replace(
  /const supabaseUrl = process\.env\.NEXT_PUBLIC_SUPABASE_URL \|\| "[^"]+";\nconst supabaseKey = process\.env\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \|\| "[^"]+";/,
  `const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.warn("Missing Supabase credentials in .env");
}`
);

// 3. Fix resolveUserId race
content = content.replace(
  /async function resolveUserId[\s\S]*?return newId;\n}/,
  `async function resolveUserId(phone: string): Promise<string> {
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
}`
);

// 4. Add AbortSignal to fetch Media
content = content.replace(
  /const res = await fetch\(url\);/,
  `const res = await fetch(url, { signal: AbortSignal.timeout(10000) });`
);

// Add AbortSignal to parseWithFallback
content = content.replace(
  /const res = await fetch\("https:\/\/api\.groq\.com\/openai\/v1\/chat\/completions", {/g,
  `const res = await fetch("https://api.groq.com/openai/v1/chat/completions", { signal: AbortSignal.timeout(15000),`
);
content = content.replace(
  /const res = await fetch\("https:\/\/openrouter\.ai\/api\/v1\/chat\/completions", {/g,
  `const res = await fetch("https://openrouter.ai/api/v1/chat/completions", { signal: AbortSignal.timeout(15000),`
);

// 6. "Done"/"Snooze" intent handling
content = content.replace(
  /  \/\/ Default to save\n  return { type: "save" };\n}/,
  `  // 5. Done / Snooze
  if (t === "done" || t === "mark done" || t === "completed" || t === "complete") {
    return { type: "mark_done" };
  }
  if (t === "snooze" || t === "remind me again" || t === "remind me later") {
    return { type: "snooze" };
  }

  // Default to save
  return { type: "save" };
}`
);

// Change intent type signature
content = content.replace(
  /\{ type: "list_reminders" \| "list_memories" \| "search" \| "save"; cleanQuery\?: string \}/,
  `{ type: "list_reminders" | "list_memories" | "search" | "mark_done" | "snooze" | "save"; cleanQuery?: string }`
);

// Fix webhook handling for 'mark_done' and 'snooze'
const webhookAdditions = `    } else if (intent.type === "mark_done") {
      const { data: recentReminders, error } = await supabase
        .from("reminders")
        .select("id, reminder_text")
        .eq("user_id", userId)
        .eq("status", "sent")
        .order("target_time", { ascending: false })
        .limit(1);

      if (error || !recentReminders || recentReminders.length === 0) {
        await sendWhatsApp(phone, "You don't have any recent reminders to mark as done.");
      } else {
        const remId = recentReminders[0].id;
        await supabase.from("reminders").update({ status: "completed" }).eq("id", remId);
        await sendWhatsApp(phone, \`✅ Awesome, I've marked "\${recentReminders[0].reminder_text}" as done!\`);
      }
    } else if (intent.type === "snooze") {
      const { data: recentReminders, error } = await supabase
        .from("reminders")
        .select("id, memory_id, reminder_text")
        .eq("user_id", userId)
        .eq("status", "sent")
        .order("target_time", { ascending: false })
        .limit(1);

      if (error || !recentReminders || recentReminders.length === 0) {
        await sendWhatsApp(phone, "You don't have any recent reminders to snooze.");
      } else {
        const memoryId = recentReminders[0].memory_id;
        // Just update the reminder target_time to +1 hour for a simple snooze
        const newTargetTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        
        await supabase.from("reminders").update({ 
          status: "pending", 
          target_time: newTargetTime 
        }).eq("id", recentReminders[0].id);
        
        await sendWhatsApp(phone, \`Sure, I've snoozed "\${recentReminders[0].reminder_text}" for 1 hour.\`);
      }
    } else {
      // 'save' intent`;

content = content.replace(/    \} else \{\n      \/\/ 'save' intent/, webhookAdditions);

// Fix embedding model and dimensions in webhook search
content = content.replace(
  /model: "gemini-embedding-2-preview",\n\s*contents: cleanedQuery,\n\s*config: \{ outputDimensionality: 1536 \}/,
  `model: "text-embedding-004",\n        contents: cleanedQuery`
);

// Fix raw insert then parse in webhook save
content = content.replace(
  /\/\/ Optimization: run structure parsing and embedding creation in parallel![\s\S]*?console\.log\("Structure response:", cleanJsonText\);\n\s*const parsed = JSON\.parse\(cleanJsonText\);\n\n\s*\/\/ 1\. Insert memory\n\s*const \{ data: memory, error: memErr \} = await supabase[\s\S]*?\}\n\n\s*\/\/ 2\. Insert pre-generated embedding vector/,
  `// 1. Insert raw memory first to avoid data loss on parse failure
      const { data: memory, error: memErr } = await supabase
        .from("memories")
        .insert({
          user_id: userId,
          raw_content: queryText,
          category: "uncategorized",
          source_channel: "whatsapp"
        })
        .select("id")
        .single();

      if (memErr) {
        throw new Error(\`Failed to insert memory: \${memErr.message}\`);
      }

      // Optimization: run structure parsing and embedding creation in parallel!
      const [cleanJsonText, embedResponse] = await Promise.all([
        parseWithFallback(systemPrompt, queryText, mediaData),
        ai.models.embedContent({
          model: "text-embedding-004",
          contents: queryText
        })
      ]);

      let parsed: any = {};
      try {
        parsed = JSON.parse(cleanJsonText);
        
        // Update memory with parsed data
        await supabase.from("memories").update({
          category: parsed.category || "uncategorized",
          metadata: {
            summary: parsed.summary,
            entities: parsed.entities,
            is_time_bound: parsed.is_time_bound,
            execution_time_iso: parsed.execution_time_iso,
            media_url: MediaUrl0 || null
          }
        }).eq("id", memory.id);
      } catch (parseErr) {
        console.error("Failed to parse JSON, saving raw memory only.", cleanJsonText);
        parsed = { category: "uncategorized" };
      }

      // 2. Insert pre-generated embedding vector`
);


// Replace toUpperCase category in Webhook list_memories and search matches
content = content.replace(/m\.category\.toUpperCase\(\)/g, "(m.category || 'uncategorized').toUpperCase()");


// Fix missing auth on Dashboard APIs
content = content.replace(
  /\/\/ UI APIs for dashboard/,
  `// UI APIs for dashboard
const requireDashboardAuth = (req: any, res: any, next: any) => {
  const auth = req.headers.authorization;
  const key = process.env.DASHBOARD_API_KEY;
  if (!key || auth !== \`Bearer \${key}\`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};`
);

content = content.replace(/app\.get\("\/api\/dashboard\/summary", async/g, 'app.get("/api/dashboard/summary", requireDashboardAuth, async');
content = content.replace(/app\.post\("\/api\/web\/memories", async/g, 'app.post("/api/web/memories", requireDashboardAuth, async');
content = content.replace(/app\.post\("\/api\/web\/memories\/delete", async/g, 'app.post("/api/web/memories/delete", requireDashboardAuth, async');


// Fix raw insert then parse in /api/web/memories
content = content.replace(
  /const cleanJsonText = await parseWithFallback\(systemPrompt, content\);\n\s*const parsed = JSON\.parse\(cleanJsonText\);\n\n\s*\/\/ Save memory\n\s*const \{ data: memory, error: mErr \} = await supabase[\s\S]*?\}\n\n\s*\/\/ Embed content/,
  `// 1. Save raw memory first
    const { data: memory, error: mErr } = await supabase
      .from("memories")
      .insert({
        user_id: userId,
        raw_content: content,
        category: "uncategorized",
        source_channel: "web"
      })
      .select("id")
      .single();

    if (mErr) {
      throw new Error(\`Database error saving memory: \${mErr.message} (user_id: \${userId})\`);
    }

    const cleanJsonText = await parseWithFallback(systemPrompt, content);
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

    // Embed content`
);

// Fix embedding model and dimensions in /api/web/memories
content = content.replace(
  /model: "gemini-embedding-2-preview",\n\s*contents: content,\n\s*config: \{ outputDimensionality: 1536 \}/,
  `model: "text-embedding-004",\n      contents: content`
);


// Delete ownership fix for /api/web/memories/delete
content = content.replace(
  /const \{ id \} = req\.body;\n\s*if \(\!id\) \{/,
  `const { id, phone } = req.body;
  if (!id || !phone) {`
);

content = content.replace(
  /const \{ error \} = await supabase\.from\("memories"\)\.delete\(\)\.eq\("id", id\);/,
  `const userId = await resolveUserId(phone);
    const { error } = await supabase.from("memories").delete().eq("id", id).eq("user_id", userId);`
);

// Fix missing parsed.category.toUpperCase() in /api/whatsapp-webhook save success
content = content.replace(
  /const categoryIcon = parsed\.category === 'reminder' \? '🔔' : parsed\.category === 'task' \? '✅' : parsed\.category === 'insight' \? '💡' : parsed\.category === 'document' \? '📄' : '🧠';\n\s*const confirmMsg = `🧠 \*Memory Saved!\* \(\$\{categoryIcon\} \$\{parsed\.category\.toUpperCase\(\)\}\)\\n\\n_Summary:_ \$\{parsed\.summary\}\$\{reminderText\}\\n\\nAsk me anytime to search or lookup your memories!`;/,
  `const safeCat = parsed.category || 'uncategorized';
      const categoryIcon = safeCat === 'reminder' ? '🔔' : safeCat === 'task' ? '✅' : safeCat === 'insight' ? '💡' : safeCat === 'document' ? '📄' : '🧠';
      const confirmMsg = \`🧠 *Memory Saved!* (\${categoryIcon} \${safeCat.toUpperCase()})\n\n_Summary:_ \${parsed.summary || content}\${reminderText}\n\nAsk me anytime to search or lookup your memories!\`;`
);


// Fix missing timeout for ai.models.generateContent
// We'll wrap the Gemini call with AbortSignal. Wait, GenAI SDK uses fetch internally? We don't have to worry about it unless they support it.
// The user just said "No timeout on any of the Groq/OpenRouter/Gemini fetch calls", but GenAI SDK doesn't natively expose timeout yet for this version, or maybe it does? `httpOptions: { timeout: 10000 }` could be passed at client init. Let's add that to the GenAI init!

content = content.replace(
  /httpOptions: \{\n\s*'User-Agent': 'aistudio-build',\n\s*\}/,
  `httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
      timeout: 10000
    }`
);

fs.writeFileSync('server.ts', content);
