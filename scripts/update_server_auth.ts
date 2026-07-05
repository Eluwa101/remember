import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// 1. Add jwt import and setup
content = content.replace(
  'import { randomUUID } from "crypto";',
  'import { randomUUID } from "crypto";\nimport jwt from "jsonwebtoken";'
);

const authCode = `
// --- Authentication (OTP & JWT) ---
const JWT_SECRET = process.env.JWT_SECRET || randomUUID(); // In production, set JWT_SECRET in .env
const otpStore = new Map<string, { code: string, expires: number }>();

app.post("/api/auth/request-otp", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone number required" });
  
  const cleanPhone = phone.replace(/[^0-9]/g, "").trim();
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
  
  // Store OTP (valid for 5 mins)
  otpStore.set(cleanPhone, { code: otp, expires: Date.now() + 5 * 60 * 1000 });
  
  // Send via WhatsApp
  await sendWhatsApp(cleanPhone, \`Your Remember AI dashboard login code is: *uid*\`.replace("uid", otp));
  
  res.json({ success: true });
});

app.post("/api/auth/verify-otp", (req, res) => {
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

// UI APIs for dashboard
const requireDashboardAuth = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { phone: string };
    req.user = decoded; // Attach user to request
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};
`;

content = content.replace(
  /\/\/ UI APIs for dashboard[\s\S]*?const requireDashboardAuth[\s\S]*?next\(\);\n\};/,
  authCode
);

fs.writeFileSync('server.ts', content);
