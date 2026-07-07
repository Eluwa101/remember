import express from "express";
import { twilioSid, twilioAuthToken } from "../env";
import { verifyDashboardToken } from "../middleware/dashboardAuth";

export const mediaRouter = express.Router();

// Twilio-hosted WhatsApp media (images, voice notes) requires HTTP Basic Auth to fetch —
// pointing an <img>/<audio> tag straight at a Twilio media URL makes the browser pop its
// native login prompt (asking for the Twilio Account SID/Auth Token) and never load the
// media. This proxies the fetch server-side with those credentials, so the browser only
// ever talks to our own server and the Twilio credentials never reach the client.
//
// Requires dashboard auth, and the URL must be one of our own account's Message-Media
// resources — matching only the host would let any caller use this server's Twilio
// credentials as an open proxy for arbitrary paths under api.twilio.com (account info,
// message logs, other accounts' media, etc). The session token is read from a query
// param rather than the Authorization header used elsewhere, because this URL is loaded
// directly by <img>/<audio> src / <a href>, which can't attach custom headers.
const mediaUrlPattern = twilioSid
  ? new RegExp(`^https://api\\.twilio\\.com/2010-04-01/Accounts/${twilioSid}/Messages/[A-Za-z0-9]+/Media/[A-Za-z0-9]+$`)
  : null;

mediaRouter.get("/api/media/proxy", async (req, res) => {
  const token = req.query.token;
  if (typeof token !== "string" || !verifyDashboardToken(token)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const url = req.query.url;
  if (typeof url !== "string" || !mediaUrlPattern || !mediaUrlPattern.test(url)) {
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
