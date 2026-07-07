import express from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../env";
import { sendWhatsApp } from "../services/whatsapp";

export const authRouter = express.Router();

interface OtpRecord {
  code: string;
  expires: number;
  attempts: number;
  lastSentAt: number;
}

const otpStore = new Map<string, OtpRecord>();
const MAX_OTP_ATTEMPTS = 5;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_INTERVAL_MS = 60 * 1000;

authRouter.post("/api/auth/request-otp", async (req, res) => {
  const { phone } = req.body;
  if (!phone || typeof phone !== "string") return res.status(400).json({ error: "Phone number required" });

  const cleanPhone = phone.replace(/[^0-9]/g, "").trim();
  if (!cleanPhone) return res.status(400).json({ error: "Invalid phone number" });

  const existing = otpStore.get(cleanPhone);
  if (existing && Date.now() - existing.lastSentAt < OTP_RESEND_INTERVAL_MS) {
    return res.status(429).json({ error: "Please wait a bit before requesting another code" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
  otpStore.set(cleanPhone, { code: otp, expires: Date.now() + OTP_TTL_MS, attempts: 0, lastSentAt: Date.now() });

  // Send via WhatsApp
  await sendWhatsApp(cleanPhone, `Your Remember AI dashboard login code is: *${otp}*`);

  res.json({ success: true });
});

authRouter.post("/api/auth/verify-otp", (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) return res.status(400).json({ error: "Phone and code required" });

  const cleanPhone = phone.replace(/[^0-9]/g, "").trim();
  const record = otpStore.get(cleanPhone);

  if (!record || record.expires < Date.now()) {
    otpStore.delete(cleanPhone);
    return res.status(401).json({ error: "OTP expired or invalid" });
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    otpStore.delete(cleanPhone);
    return res.status(429).json({ error: "Too many incorrect attempts — request a new code" });
  }

  if (record.code !== String(code).trim()) {
    record.attempts += 1;
    return res.status(401).json({ error: "Incorrect OTP" });
  }

  // Clear OTP
  otpStore.delete(cleanPhone);

  // Issue JWT
  const token = jwt.sign({ phone: cleanPhone }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ success: true, token });
});
