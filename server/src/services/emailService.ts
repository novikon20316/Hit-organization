import nodemailer from 'nodemailer';
import { buildEmailHtml, NotificationType } from './emailTemplates.js';

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendNotificationEmail(params: {
  toEmail:    string;
  type:       NotificationType;
  lang:       'he' | 'en';
  data:       Record<string, string>;
}): Promise<void> {
  const { toEmail, type, lang, data } = params;
  const { subject, html } = buildEmailHtml(type, lang, data);

  await transporter.sendMail({
    from:    `"${process.env.SMTP_FROM_NAME || 'Project System'}" <${process.env.SMTP_USER}>`,
    to:      toEmail,
    subject,
    html,
  });

  console.log(`📧 Email sent → ${toEmail} [${type}]`);
}