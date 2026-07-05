import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jbzilvknurendpmwbflj.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!supabaseKey) throw new Error("Missing Supabase key in environment");

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const query = `
    ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'complete';
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pending_memory_id UUID REFERENCES public.memories(id) ON DELETE SET NULL;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS timezone VARCHAR DEFAULT 'UTC';
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name VARCHAR;
  `;
  try {
    const { error } = await supabase.rpc("exec_sql", { sql: query });
    if (error) {
      console.error("RPC exec_sql error:", error.message);
    } else {
      console.log("Database schema updated successfully via RPC!");
    }
  } catch (err: any) {
    console.warn("exec_sql failed, attempting direct REST fetch fallback:", err.message);
  }
}
run();
