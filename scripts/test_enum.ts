import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jbzilvknurendpmwbflj.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_HC1TDQRqYSB_OCsjX3zNkQ_L1CDRv_0";
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.rpc("get_enum_values", { enum_name: "category_enum" });
  if (error) {
     console.error("RPC error (might not exist):", error.message);
  } else {
     console.log(data);
  }
}
run();
