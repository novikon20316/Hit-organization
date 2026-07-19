import { buildEmailHtml, NotificationType } from './emailTemplates.js';

// Render's free tier blocks outbound traffic on SMTP ports (25/465/587), which
// made nodemailer time out in production even though it worked locally. Brevo's
// API runs over plain HTTPS, so it isn't affected by that restriction. Using
// single-sender verification (no owned domain / DNS records needed) — see
// EMAIL_FROM_ADDRESS in .env.
// https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

export async function sendNotificationEmail(params: {
  toEmail:    string;
  type:       NotificationType;
  lang:       'he' | 'en';
  data:       Record<string, string>;
}): Promise<void> {
  const { toEmail, type, lang, data } = params;
  const { subject, html } = buildEmailHtml(type, lang, data);

  const fromName    = process.env.EMAIL_FROM_NAME    || 'Project System';
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key':      process.env.BREVO_API_KEY || '',
      'Content-Type': 'application/json',
      'Accept':       'application/json',
    },
    body: JSON.stringify({
      sender:      { name: fromName, email: fromAddress },
      to:          [{ email: toEmail }],
      subject,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Brevo API error ${response.status}: ${body}`);
  }

  console.log(`📧 Email sent → ${toEmail} [${type}]`);
}