import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";

dotenv.config();

export const PORT = Number(process.env.PORT) || 3000;

export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Initialize Supabase Client using the service_role key: this server resolves users by
// phone number rather than a Supabase Auth session, so it must bypass RLS intentionally.
// RLS policies deny anon/authenticated entirely (see schema.sql) — this key must stay server-only.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
}
export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Explicitly set to Twilio's global WhatsApp sandbox number to prevent Error 63007
export const twilioSandboxNumber = "+14155238886";

export const twilioSid = process.env.TWILIO_ACCOUNT_SID;
export const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

export let twilioClient: any = null;
if (twilioSid && twilioAuthToken) {
  try {
    twilioClient = twilio(twilioSid, twilioAuthToken);
    console.log("Twilio client initialized successfully.");
  } catch (err: any) {
    console.error("Failed to initialize Twilio:", err.message);
  }
} else {
  console.log("Twilio credentials missing. WhatsApp sending will be bypassed/logged.");
}

export const groqApiKey = process.env.GROQ_API_KEY;
export const openRouterApiKey = process.env.OPEN_ROUTER_API_KEY;

const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret) {
  throw new Error("Missing JWT_SECRET in .env — refusing to start with an insecure default");
}
export const JWT_SECRET: string = rawJwtSecret;
