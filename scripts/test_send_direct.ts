import twilio from "twilio";
import dotenv from "dotenv";
dotenv.config();

const twilioSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

async function run() {
  if (!twilioSid || !twilioAuthToken) return;
  const twilioClient = twilio(twilioSid, twilioAuthToken);
  try {
    const response = await twilioClient.messages.create({
      from: "whatsapp:+14155238886",
      to: "whatsapp:+2349134846401",
      body: "Direct test message to your phone!"
    });
    console.log("Sent successfully:", response.sid);
  } catch (err: any) {
    console.error("Error sending:", err.message);
  }
}
run();
