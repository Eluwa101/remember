import fs from 'fs';
let content = fs.readFileSync('server.ts', 'utf8');

const oldCron = `    // Select pending reminders where target_time <= NOW()
    const nowIso = new Date().toISOString();
    const { data: reminders, error } = await supabase
      .from("reminders")
      .select(\`
        id,
        reminder_text,
        target_time,
        user_id,
        users (
          id,
          whatsapp_number
        )
      \`)
      .eq("status", "pending")
      .lte("target_time", nowIso);`;

const newCron = `    // Select pending reminders where target_time <= NOW()
    const nowIso = new Date().toISOString();
    
    // Atomic claim: update to 'processing' and select
    const { data: reminders, error } = await supabase
      .from("reminders")
      .update({ status: "processing" })
      .eq("status", "pending")
      .lte("target_time", nowIso)
      .select(\`
        id,
        reminder_text,
        target_time,
        user_id,
        users (
          id,
          whatsapp_number
        )
      \`);`;

content = content.replace(oldCron, newCron);

const oldUpdate1 = `        // Mark as sent
        await supabase
          .from("reminders")
          .update({ status: "sent" })
          .eq("id", rem.id);`;

const oldUpdate2 = `        // If no whatsapp number, mark as failed
        await supabase
          .from("reminders")
          .update({ status: "failed" })
          .eq("id", rem.id);`;

// it's fine, the updates to sent and failed are still valid.

fs.writeFileSync('server.ts', content);
