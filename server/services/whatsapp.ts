import { twilioClient, twilioSandboxNumber } from "../env";

export async function sendWhatsApp(to: string, message: string) {
  const cleanTo = to.replace(/[^0-9]/g, ""); // strictly keep digits only
  const formattedTo = `whatsapp:+${cleanTo}`;
  console.log(`[WhatsApp Outbox] To: ${formattedTo}, Message: ${message}`);

  if (twilioClient) {
    try {
      const cleanSandbox = twilioSandboxNumber.replace(/[^0-9]/g, "");
      await twilioClient.messages.create({
        from: `whatsapp:+${cleanSandbox}`,
        to: formattedTo,
        body: message
      });
      console.log(`[WhatsApp Outbox] Message sent successfully via Twilio.`);
    } catch (err: any) {
      console.error(`[WhatsApp Outbox] Error sending via Twilio:`, err.message);
    }
  }
}
