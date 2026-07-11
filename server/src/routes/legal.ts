// src/routes/legal.ts
// Public, unauthenticated static pages required by app store review (Google
// Play's Data Safety section and store listing require a reachable privacy
// policy URL). Mounted at the app root in index.ts, so the path is exactly
// /privacy-policy — no prefix.
//
// TODO before shipping: make sure this server is reachable at a public HTTPS
// URL (the current dev apiUrl in mobile/app.json is a LAN IP, which Play
// will not accept).

import { Router, Request, Response } from 'express';

const CONTACT_EMAIL = 'Support2HIT@gmail.com';
const INSTITUTION_NAME = 'Holon Institute of Technology (HIT)';
const EFFECTIVE_DATE = '2026-07-11';

const PRIVACY_POLICY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Privacy Policy</title>
  <style>
    body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width: 720px; margin: 0 auto; padding: 32px 20px; color: #111; line-height: 1.6; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    h2 { font-size: 18px; margin-top: 32px; margin-bottom: 8px; }
    p { color: #333; white-space: pre-line; }
    .meta { color: #667; font-size: 13px; margin-bottom: 24px; }
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p class="meta">Effective date: ${EFFECTIVE_DATE} &middot; Data controller: ${INSTITUTION_NAME} &middot; Contact: ${CONTACT_EMAIL}</p>

  <h2>Who we are</h2>
  <p>This privacy policy applies to ${INSTITUTION_NAME}'s student project/thesis management app (the "App"). The data controller is ${INSTITUTION_NAME}. For privacy questions, contact ${CONTACT_EMAIL}.</p>

  <h2>Information we collect</h2>
  <p>&bull; Account &amp; profile details: full name, email address, phone number, student/ID number, faculty, degree program, year of study, and interface language. Your password is managed and secured by Firebase Authentication &mdash; we never see or store it in plain text.
&bull; Academic data: your project/thesis details, milestones, files you upload, supervisor/examiner assignments, and defense-scheduling information.
&bull; Communications: in-app chat messages between students, supervisors, examiners, and coordinators; notifications sent to you.
&bull; Device data: a push-notification token for your device.
&bull; Security data: login timestamps, an approximate location derived from your IP address (used only to flag suspicious logins), and failed login attempt counts.</p>

  <h2>How we use this information</h2>
  <p>We use this information to operate the project/thesis management workflow (enrollment, supervisor assignment, milestone tracking, defense scheduling, and examiner access), to send you operational notifications and emails, to secure your account (automatic lockout after repeated failed logins, two-factor authentication), and to meet the institution's academic recordkeeping requirements.</p>

  <h2>Who we share it with</h2>
  <p>We use the following processors to handle data on our behalf &mdash; they are not permitted to use your data for their own purposes:
&bull; Google Firebase (Authentication, Firestore, Cloud Messaging) &mdash; account storage, the app database, and push notifications.
&bull; Expo &mdash; delivering push notifications to your device.
&bull; Our SMTP email provider &mdash; sending operational emails (signup verification, security alerts, updates).
&bull; ipinfo.io &mdash; coarse IP-based location lookup, used only for login security alerts.
We do not sell your personal data to advertisers or other third parties.</p>

  <h2>Data retention &amp; account deletion</h2>
  <p>Student accounts are automatically flagged and reviewed after your expected graduation date, and may be deleted per the institution's retention policy. You may request deletion of your account at any time from within the app; the request is subject to an eligibility check (e.g. no active academic process still in progress).</p>

  <h2>Security measures</h2>
  <p>All communication between the app and our servers is encrypted (HTTPS). We support two-factor authentication (2FA), email verification at signup, and automatic account lockout after repeated failed login attempts.</p>

  <h2>Children's privacy</h2>
  <p>The App is intended for enrolled higher-education students, supervisors, examiners, and staff, and is not directed at children.</p>

  <h2>Your rights</h2>
  <p>You may request access to, correction of, or deletion of your personal data by contacting us at ${CONTACT_EMAIL}.</p>

  <h2>Changes to this policy</h2>
  <p>This policy took effect on ${EFFECTIVE_DATE}. We may update it from time to time; material changes will be communicated within the app.</p>
</body>
</html>`;

const router = Router();

router.get('/privacy-policy', (_req: Request, res: Response) => {
  res.type('html').send(PRIVACY_POLICY_HTML);
});

export default router;
