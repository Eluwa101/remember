import { supabase } from "../env";

const ARCHIVE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 3;
const DEFAULT_SAFE_KEEP_DAYS = 90;

/**
 * Moves fulfilled, non-safe-keep memories into the Archive view 7 days after
 * their reminder concluded, permanently deletes items that have been archived
 * longer than the owning user's archive_retention_days setting, and separately
 * deletes safe-keep items whose own (much longer, per-item) retention has expired.
 */
async function archiveFulfilledMemories(): Promise<void> {
  try {
    const { data: candidateReminders, error } = await supabase
      .from("reminders")
      .select("memory_id, target_time, fulfilled_at")
      .in("status", ["sent", "completed", "failed", "cancelled"]);

    if (error) {
      console.error("[Archive Sweep] Failed to fetch candidate reminders:", error.message);
      return;
    }

    const cutoffMs = Date.now() - ARCHIVE_AFTER_MS;
    const eligibleMemoryIds = Array.from(new Set(
      (candidateReminders || [])
        .filter(r => new Date(r.fulfilled_at || r.target_time).getTime() < cutoffMs)
        .map(r => r.memory_id)
        .filter((id): id is string => !!id)
    ));

    if (eligibleMemoryIds.length === 0) return;

    const nowIso = new Date().toISOString();
    const { error: archiveErr } = await supabase
      .from("memories")
      .update({ archived_at: nowIso })
      .in("id", eligibleMemoryIds)
      .is("archived_at", null)
      .eq("is_safe_keep", false)
      .or(`archive_snoozed_until.is.null,archive_snoozed_until.lt.${nowIso}`);

    if (archiveErr) {
      console.error("[Archive Sweep] Failed to archive memories:", archiveErr.message);
    }
  } catch (err: any) {
    console.error("[Archive Sweep] Error archiving fulfilled memories:", err.message);
  }
}

async function deleteRetainedOutMemories(): Promise<void> {
  try {
    const { data: users, error } = await supabase.from("users").select("id, archive_retention_days");
    if (error) {
      console.error("[Archive Sweep] Failed to fetch user retention settings:", error.message);
      return;
    }

    // Most users share the default — group by retention value so this is one
    // delete per distinct setting rather than one per user.
    const groups = new Map<number, string[]>();
    for (const u of users || []) {
      const days = u.archive_retention_days ?? DEFAULT_RETENTION_DAYS;
      if (!groups.has(days)) groups.set(days, []);
      groups.get(days)!.push(u.id);
    }

    for (const [days, userIds] of groups) {
      const cutoffIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { error: delErr } = await supabase
        .from("memories")
        .delete()
        .not("archived_at", "is", null)
        .lt("archived_at", cutoffIso)
        .in("user_id", userIds);
      if (delErr) {
        console.error(`[Archive Sweep] Failed to delete retained-out memories (retention=${days}d):`, delErr.message);
      }
    }
  } catch (err: any) {
    console.error("[Archive Sweep] Error deleting retained-out memories:", err.message);
  }
}

async function deleteExpiredSafeKeepMemories(): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("memories")
      .delete()
      .eq("is_safe_keep", true)
      .not("safe_keep_expires_at", "is", null)
      .lt("safe_keep_expires_at", nowIso);
    if (error) {
      console.error("[Archive Sweep] Failed to delete expired safe-keep memories:", error.message);
    }
  } catch (err: any) {
    console.error("[Archive Sweep] Error deleting expired safe-keep memories:", err.message);
  }
}

export async function runArchiveSweep(): Promise<void> {
  await archiveFulfilledMemories();
  await deleteRetainedOutMemories();
  await deleteExpiredSafeKeepMemories();
}

export { DEFAULT_SAFE_KEEP_DAYS };
