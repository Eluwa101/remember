import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

import { PORT } from "./server/env";
import { checkAndSendReminders } from "./server/services/reminders";
import { runArchiveSweep } from "./server/services/archive";
import { healthRouter } from "./server/routes/health";
import { remindersRouter } from "./server/routes/reminders";
import { authRouter } from "./server/routes/auth";
import { dashboardRouter } from "./server/routes/dashboard";
import { archiveRouter } from "./server/routes/archive";
import { mediaRouter } from "./server/routes/media";
import { accountRouter } from "./server/routes/account";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(healthRouter);
app.use(remindersRouter);
app.use(authRouter);
app.use(dashboardRouter);
app.use(archiveRouter);
app.use(mediaRouter);
app.use(accountRouter);

// Run active reminder checks every 20 seconds (Node-side fallback for container robustness)
setInterval(checkAndSendReminders, 20 * 1000);

// Archive/retention sweep runs hourly — day-scale lifecycle, no need for 60s granularity
setInterval(runArchiveSweep, 60 * 60 * 1000);

// Setup Vite development server or build assets
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
