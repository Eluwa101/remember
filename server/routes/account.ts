import express from "express";
import { supabase } from "../env";
import { requireDashboardAuth } from "../middleware/dashboardAuth";
import { resolveUserId } from "../services/memory";

export const accountRouter = express.Router();

// Deletes the user row outright — memories, reminders, and memory_embeddings all have
// ON DELETE CASCADE on their user_id/memory_id foreign keys (see schema.sql), so this
// single delete removes everything the account owns. Irreversible; the frontend gates
// this behind a type-to-confirm step before ever calling it.
accountRouter.post("/api/account/delete", requireDashboardAuth, async (req: any, res) => {
  try {
    const userId = await resolveUserId(req.user.phone);
    const { error } = await supabase.from("users").delete().eq("id", userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
