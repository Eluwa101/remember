import express from "express";
import { checkAndSendReminders } from "../services/reminders";

export const remindersRouter = express.Router();

// Manual trigger route for reminders (called via cron scheduler)
remindersRouter.post("/api/reminders/trigger", async (req, res) => {
  await checkAndSendReminders();
  res.json({ status: "triggered", timestamp: new Date().toISOString() });
});
