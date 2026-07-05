import express from "express";
import { twilioSandboxNumber } from "../env";

export const healthRouter = express.Router();

healthRouter.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Endpoint to fetch environmental details safely (without secrets)
healthRouter.get("/api/config", (req, res) => {
  res.json({
    twilioSandboxNumber,
    twilioSandboxCode: process.env.TWILIO_SANDBOX_CODE || "caught-addition",
    appUrl: process.env.APP_URL || "https://ais-dev-z62hviz7t6ovsuqxqzcfkd-558271063869.europe-west1.run.app"
  });
});
