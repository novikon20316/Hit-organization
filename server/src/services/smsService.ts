import twilio from 'twilio';

// Twilio SMS sender — companion to emailService.ts's Brevo-based email sender.
// Same throw-don't-swallow contract: callers decide how to handle failure
// (see services/notify.ts, the shared dispatcher that wraps this).

/**
 * Normalizes a phone number to E.164 for Twilio. Accepts an already-valid
 * `+`-prefixed number as-is, or an Israeli local number (leading 0) and
 * rewrites it to +972. Returns null for anything else, including
 * missing/empty input — callers should treat null as "skip", not "retry".
 */
export function toE164IL(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.replace(/[\s-]/g, '');
  if (/^\+\d{8,15}$/.test(trimmed)) return trimmed;
  if (/^0\d{8,9}$/.test(trimmed)) return `+972${trimmed.slice(1)}`;
  return null;
}

let client: ReturnType<typeof twilio> | null = null;
/** Shared Twilio client — same account serves SMS and WhatsApp (see whatsappService.ts). */
export function getClient(): ReturnType<typeof twilio> {
  if (!client) {
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return client;
}

export async function sendSms(toE164: string, body: string): Promise<void> {
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!from) throw new Error('TWILIO_FROM_NUMBER is not configured.');
  await getClient().messages.create({ to: toE164, from, body });
  console.log(`📱 SMS sent → ${toE164}`);
}
