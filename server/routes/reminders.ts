import express from "express";
import { checkAndSendReminders } from "../services/reminders";
import { CRON_SECRET } from "../env";

export const remindersRouter = express.Router();

// Manual trigger route for reminders (called via external cron scheduler, not a
// logged-in dashboard user) — authenticated with a shared secret rather than
// requireDashboardAuth's user JWT, since a cron job has no user session.
remindersRouter.post("/api/reminders/trigger", async (req, res) => {
  const providedSecret = req.headers["x-cron-secret"] || req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  await checkAndSendReminders();
  res.json({ status: "triggered", timestamp: new Date().toISOString() });
});
