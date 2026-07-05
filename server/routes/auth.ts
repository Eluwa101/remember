import express from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../env";
import { sendWhatsApp } from "../services/whatsapp";

export const authRouter = express.Router();

const otpStore = new Map<string, { code: string, expires: number }>();

authRouter.post("/api/auth/request-otp", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone number required" });

  const cleanPhone = phone.replace(/[^0-9]/g, "").trim();
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits

  // Store OTP (valid for 5 mins)
  otpStore.set(cleanPhone, { code: otp, expires: Date.now() + 5 * 60 * 1000 });

  // Send via WhatsApp
  await sendWhatsApp(cleanPhone, `Your Remember AI dashboard login code is: *uid*`.replace("uid", otp));

  res.json({ success: true });
});

authRouter.post("/api/auth/verify-otp", (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) return res.status(400).json({ error: "Phone and code required" });

  const cleanPhone = phone.replace(/[^0-9]/g, "").trim();
  const record = otpStore.get(cleanPhone);

  if (!record || record.expires < Date.now()) {
    return res.status(401).json({ error: "OTP expired or invalid" });
  }

  if (record.code !== code.trim()) {
    return res.status(401).json({ error: "Incorrect OTP" });
  }

  // Clear OTP
  otpStore.delete(cleanPhone);

  // Issue JWT
  const token = jwt.sign({ phone: cleanPhone }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ success: true, token });
});
