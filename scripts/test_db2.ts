import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jbzilvknurendpmwbflj.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_HC1TDQRqYSB_OCsjX3zNkQ_L1CDRv_0";
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from("memories").select("*").limit(1);
  if (error) {
     console.error(error);
  } else {
     if (data.length > 0) {
        console.log(Object.keys(data[0]));
     } else {
        console.log("No data");
     }
  }
}
run();
