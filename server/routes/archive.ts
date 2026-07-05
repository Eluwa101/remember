import express from "express";
import { supabase } from "../env";
import { requireDashboardAuth } from "../middleware/dashboardAuth";
import { resolveUserId } from "../services/memory";
import { runArchiveSweep, DEFAULT_SAFE_KEEP_DAYS } from "../services/archive";

export const archiveRouter = express.Router();

const RESTORE_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

// Move an archived memory back to the main feed. Sets a 7-day snooze so the
// next archive sweep doesn't immediately re-archive it — its linked reminder
// is still in a terminal state, so without this Restore would be a no-op.
archiveRouter.post("/api/web/memories/restore", requireDashboardAuth, async (req: any, res) => {
  const { id } = req.body;
  if (!id) {
    res.status(400).json({ error: "Memory ID required" });
    return;
  }
  try {
    const userId = await resolveUserId(req.user.phone);
    const { error } = await supabase
      .from("memories")
      .update({ archived_at: null, archive_snoozed_until: new Date(Date.now() + RESTORE_SNOOZE_MS).toISOString() })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle safe-keep on a memory, with a user-editable per-item retention day-count.
archiveRouter.post("/api/web/memories/safe-keep", requireDashboardAuth, async (req: any, res) => {
  const { id, enabled, days } = req.body;
  if (!id || typeof enabled !== "boolean") {
    res.status(400).json({ error: "Memory ID and enabled flag are required" });
    return;
  }
  try {
    const userId = await resolveUserId(req.user.phone);
    const safeKeepDays = typeof days === "number" && days >= 1 ? Math.floor(days) : DEFAULT_SAFE_KEEP_DAYS;

    const updatePayload = enabled
      ? {
          is_safe_keep: true,
          safe_keep_days: safeKeepDays,
          safe_keep_expires_at: new Date(Date.now() + safeKeepDays * 24 * 60 * 60 * 1000).toISOString(),
          // Enabling safe-keep exempts this memory from the normal archive lifecycle —
          // clear any archive state so it doesn't sit stuck in the Archive view.
          archived_at: null,
          archive_snoozed_until: null
        }
      : {
          is_safe_keep: false,
          safe_keep_days: null,
          safe_keep_expires_at: null
        };

    const { error } = await supabase.from("memories").update(updatePayload).eq("id", id).eq("user_id", userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get/set the per-user archive retention setting (how long an item stays in
// Archive before it's permanently deleted).
archiveRouter.post("/api/dashboard/settings", requireDashboardAuth, async (req: any, res) => {
  const { archive_retention_days } = req.body;
  if (typeof archive_retention_days !== "number" || archive_retention_days < 1) {
    res.status(400).json({ error: "archive_retention_days must be a number >= 1" });
    return;
  }
  try {
    const userId = await resolveUserId(req.user.phone);
    const { error } = await supabase
      .from("users")
      .update({ archive_retention_days: Math.floor(archive_retention_days) })
      .eq("id", userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Manual trigger for testing — unlike /api/reminders/trigger, this performs hard
// deletes, so it stays behind auth rather than mirroring that route's open access.
archiveRouter.post("/api/archive/trigger", requireDashboardAuth, async (req, res) => {
  await runArchiveSweep();
  res.json({ status: "triggered", timestamp: new Date().toISOString() });
});
