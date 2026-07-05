import express from "express";
import { twilioSid, twilioAuthToken } from "../env";

export const mediaRouter = express.Router();

// Twilio-hosted WhatsApp media (images, voice notes) requires HTTP Basic Auth to fetch —
// pointing an <img>/<audio> tag straight at a Twilio media URL makes the browser pop its
// native login prompt (asking for the Twilio Account SID/Auth Token) and never load the
// media. This proxies the fetch server-side with those credentials, so the browser only
// ever talks to our own server and the Twilio credentials never reach the client.
//
// No dashboard auth on this route: a Twilio media URL embeds long, unguessable SIDs and is
// only ever seen by a client that already had authenticated access to it via
// /api/dashboard/summary, so it functions as a de facto capability token. It's restricted
// to Twilio's own media API host so this can't be used as a general-purpose open proxy.
mediaRouter.get("/api/media/proxy", async (req, res) => {
  const url = req.query.url;
  if (typeof url !== "string" || !/^https:\/\/api\.twilio\.com\//.test(url)) {
    res.status(400).json({ error: "Invalid media URL" });
    return;
  }
  if (!twilioSid || !twilioAuthToken) {
    res.status(503).json({ error: "Media proxy unavailable" });
    return;
  }

  try {
    const twilioRes = await fetch(url, {
      headers: {
        Authorization: "Basic " + Buffer.from(`${twilioSid}:${twilioAuthToken}`).toString("base64")
      }
    });

    if (!twilioRes.ok) {
      res.status(502).json({ error: `Failed to fetch media (status ${twilioRes.status})` });
      return;
    }

    res.setHeader("Content-Type", twilioRes.headers.get("content-type") || "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=86400");
    const buffer = Buffer.from(await twilioRes.arrayBuffer());
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
