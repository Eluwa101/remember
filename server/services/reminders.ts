import { ai, supabase } from "../env";
import { getUserProfile, saveUserProfile } from "./memory";
import { sendWhatsApp } from "./whatsapp";

async function checkAndSendGreetings(userId: string, phone: string) {
  if (!phone || phone.startsWith("test_")) return; // ignore test/mock numbers

  try {
    const profile = await getUserProfile(userId);
    const userTimezone = profile.timezone || "America/Los_Angeles";

    // Determine user's local hour and date
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: userTimezone,
      hour: "numeric",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const parts = formatter.formatToParts(new Date());
    const hourPart = parts.find(p => p.type === "hour");
    const dayPart = parts.find(p => p.type === "day");
    const monthPart = parts.find(p => p.type === "month");
    const yearPart = parts.find(p => p.type === "year");

    if (!hourPart || !dayPart || !monthPart || !yearPart) return;

    const localHour = parseInt(hourPart.value, 10);
    const localDateStr = `${yearPart.value}-${monthPart.value}-${dayPart.value}`;

    let period: "morning" | "afternoon" | "evening" | null = null;
    if (localHour >= 8 && localHour < 10) {
      period = "morning";
    } else if (localHour >= 13 && localHour < 15) {
      period = "afternoon";
    } else if (localHour >= 19 && localHour < 21) {
      period = "evening";
    }

    if (!period) return; // Not in any greeting window

    // Check if we already greeted the user for this period today
    if (profile.last_greeting_period === period && profile.last_greeting_date === localDateStr) {
      return; // Already sent!
    }

    // Prevent double triggering immediately by updating profile state first
    await saveUserProfile(userId, {
      last_greeting_period: period,
      last_greeting_date: localDateStr
    });

    console.log(`[Greeting Engine] Sending ${period} greeting to user ${userId} (${phone})`);

    // Fetch last 5 memories/reminders for context
    const { data: recent } = await supabase
      .from("memories")
      .select("raw_content, category, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);

    const contextStr = recent && recent.length > 0
      ? recent.map(r => `- [${r.category}] ${r.raw_content}`).join("\n")
      : "No memories saved yet.";

    const userName = profile.name || "";
    const userTitle = profile.title || "";

    const prompt = `You are "Remember" AI, a warm, supportive, and friendly memory assistant.
You are initiating contact with the user to say a warm greeting for the ${period}.
The current time is roughly ${localHour}:00 in the user's local timezone.

User profile:
- Name: ${userName || "Unknown"}
- Title: ${userTitle || "None"}

Recent memories/reminders saved by this user:
${contextStr}

Your job is to write a warm, friendly WhatsApp greeting suitable for the ${period}.
Follow these guidelines:
1. Speak in a highly conversational, friendly, and human-like tone, like a supportive close friend.
2. If the user's name is "Unknown", you MUST ask them how you may refer to them (e.g., "Hey, how may I refer to you?" or "Good morning! By the way, how may I refer to you?"). This helps us address them warmly in the future.
3. If you know the user's name or title, refer to them by name or title to build rapport (e.g., "Good morning Monday!", "Hello Dr. Smith, hope your afternoon is going well").
4. Actively ask a follow-up question based on their recent memories or reminders if you already know their name. Look at the context! For example, if they saved "Went on a beautiful date with Amy", ask "How did your date with Amy go?" or if they scheduled "Pick up dry cleaning at 4 PM" and it has passed, ask "Were you able to get the dry cleaning sorted out?". If no specific events are in context, ask a general friendly check-in question (e.g., "Any exciting plans or notes you want me to write down for you today?").
5. Keep the entire response suitable for a WhatsApp message: concise (usually 2-3 sentences max), warm, and engaging. Avoid any generic AI boilerplate.

Do not write any Markdown formatting blocks (no \`\`\`json or similar). Just output the raw WhatsApp message text.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt
    });

    const greetingText = response.text?.trim();
    if (greetingText) {
      await sendWhatsApp(phone, greetingText);
      console.log(`[Greeting Engine] Sent greeting successfully: "${greetingText}"`);
    }
  } catch (err: any) {
    console.error("[Greeting Engine] Error in checkAndSendGreetings:", err.message);
  }
}

let schemaWarningLogged = false;

// Trigger checker for scheduled reminders
export async function checkAndSendReminders() {
  try {
    // Check and send greetings first for any timezone-appropriate users
    try {
      const { data: allUsers } = await supabase.from("users").select("id, whatsapp_number");
      if (allUsers) {
        for (const u of allUsers) {
          if (u.whatsapp_number) {
            await checkAndSendGreetings(u.id, u.whatsapp_number);
          }
        }
      }
    } catch (gerr: any) {
      console.error("[Reminder Engine] Greeting engine check failed:", gerr.message);
    }

    // Select pending reminders where target_time <= NOW()
    const nowIso = new Date().toISOString();

    // Atomic claim: update to 'processing' and select
    const { data: reminders, error } = await supabase
      .from("reminders")
      .update({ status: "processing" })
      .eq("status", "pending")
      .lte("target_time", nowIso)
      .select(`
        id,
        reminder_text,
        target_time,
        user_id,
        users (
          id,
          whatsapp_number
        )
      `);

    if (error) {
      if (error.message.includes("Could not find the table") || error.message.includes("relation") || error.message.includes("schema cache")) {
        if (!schemaWarningLogged) {
          console.error(
            "\n⚠️ [Database Warning] The required tables ('users', 'reminders', 'memory_embeddings') are missing in your Supabase database.\n" +
            "👉 Please run the SQL queries from the 'schema.sql' file in your Supabase SQL Editor to initialize them.\n"
          );
          schemaWarningLogged = true;
        }
      } else {
        console.error("[Reminder Engine] Error fetching pending reminders:", error.message);
      }
      return;
    }

    // Reset warning once tables are found and fetched successfully
    schemaWarningLogged = false;

    if (!reminders || reminders.length === 0) {
      return;
    }

    console.log(`[Reminder Engine] Found ${reminders.length} reminder(s) to trigger.`);

    for (const rem of reminders) {
      const user = rem.users as any;
      if (user && user.whatsapp_number) {
        // Send WhatsApp
        const msg = `🔔 *REMINDER:* ${rem.reminder_text}\n\nReply:\n✅ *Done* - to mark as completed\n⏰ *Snooze* - to be reminded again`;
        await sendWhatsApp(user.whatsapp_number, msg);

        // Mark as sent
        await supabase
          .from("reminders")
          .update({ status: "sent" })
          .eq("id", rem.id);

        console.log(`[Reminder Engine] Triggered reminder ${rem.id} for ${user.whatsapp_number}`);
      } else {
        // If no whatsapp number, mark as failed
        await supabase
          .from("reminders")
          .update({ status: "failed" })
          .eq("id", rem.id);
        console.log(`[Reminder Engine] Cancelled/Failed reminder ${rem.id} due to missing phone number.`);
      }
    }
  } catch (err: any) {
    console.error("[Reminder Engine] Error running checks:", err.message);
  }
}
