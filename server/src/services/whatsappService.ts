import { getClient } from './smsService.js';

// Twilio WhatsApp sender — companion to smsService.ts, same Twilio account.
// Same throw-don't-swallow contract: callers decide how to handle failure
// (see services/notify.ts, the shared dispatcher that wraps this).
//
// Requires a Twilio WhatsApp sender (sandbox or an approved WhatsApp
// Business number) configured via TWILIO_WHATSAPP_FROM_NUMBER, in the same
// raw phone-number form as TWILIO_FROM_NUMBER (no `whatsapp:` prefix — added
// here). Messages sent more than 24h after the recipient's last inbound
// message must use an approved WhatsApp template instead of freeform body
// text, or Twilio will reject them.

export async function sendWhatsapp(toE164: string, body: string): Promise<void> {
  const from = process.env.TWILIO_WHATSAPP_FROM_NUMBER;
  if (!from) throw new Error('TWILIO_WHATSAPP_FROM_NUMBER is not configured.');
  await getClient().messages.create({
    to: `whatsapp:${toE164}`,
    from: `whatsapp:${from}`,
    body,
  });
  console.log(`💬 WhatsApp sent → ${toE164}`);
}
