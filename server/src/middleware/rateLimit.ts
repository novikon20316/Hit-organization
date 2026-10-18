import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import type { AuthenticatedRequest } from './auth.js';
import { L } from '../utils/localize.js';

// Runs after verifyToken where available, so authenticated brute-force attempts
// (e.g. a stolen token trying every TOTP code) are throttled per-account rather
// than just per-IP, which a NAT/proxy would otherwise let multiple attackers share.
function keyByUserOrIp(req: Request): string {
  const uid = (req as AuthenticatedRequest).user?.uid;
  return uid ?? ipKeyGenerator(req.ip ?? '');
}

// Baseline guard against generic abuse/scraping across the whole API.
// MEDIUM FIX: this is mounted at app.use('/api', apiLimiter) — BEFORE any
// route's verifyToken runs — so req.user is never populated yet here;
// keyByUserOrIp would always fall through to IP-only keying anyway, so
// there's no way to key this one by account without restructuring the
// whole middleware order. Instead, raised the ceiling: a single open chat
// tab alone polls every 3s (~20 req/min, see chatController.ts's
// getChatMessages) — 300/15min was the entire budget for ONE such tab. On
// a shared/NAT'd IP (plausible on campus Wi-Fi, where many students share
// one public IP), that meant one active user's normal polling could get
// unrelated users behind the same IP 429'd. 1000/15min stays a real
// backstop against blatant scraping/abuse while comfortably absorbing
// legitimate concurrent shared-IP polling at this system's scale.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// TOTP validate + recovery request/verify — guessable 6-digit codes.
// Mount AFTER verifyToken so keyByUserOrIp can key on the account being targeted.
export const totpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: 'Too many attempts. Please wait before trying again.' },
});

// Examiner-access links are unauthenticated by design (external examiners have
// no Firebase account) — grant codes and access tokens are the only secret,
// so this is the one place a plain per-IP limiter is the last line of defense.
export const examinerAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// Public view-only final report links (see services/finalReport.ts) — a
// student re-opening/printing their report is a handful of requests; this
// only needs to make token guessing pointless on top of the 256-bit token.
export const finalReportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// Impersonation (see config/featureFlags.ts) mints live Firebase sign-in
// tokens — throttle it per-admin-account like totpLimiter above, rather than
// leaning solely on the blanket apiLimiter.
export const impersonationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: 'Too many impersonation attempts. Please wait before trying again.' },
});

// External read-only integration endpoint (see routes/integrations.ts) — gated
// only by a static shared secret, not Firebase Auth, so if that secret ever
// leaks the blanket apiLimiter's 1000/15min would let an attacker enumerate
// thousands of Israeli ID numbers (which have a checksum, so a much smaller
// effective space than 10^9) and pull back grades/PII for each match. A
// single legitimate integration partner has no reason to need more than a
// few dozen lookups per window.
export const integrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// Login-security endpoints are unauthenticated by necessity — a failed login
// has no token to key on, and the confirm/deny link is only ever clicked by
// someone who isn't signed in. Also protects the report endpoint's live call
// out to Google's Identity Toolkit from being hammered.
export const loginSecurityLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// Client crash/timeout/network-failure reports (see services/errorReports.ts)
// are unauthenticated by necessity — a crash can happen before login, or
// when the token itself is what's broken. Aggregation server-side already
// collapses repeat identical errors into one admin alert, so this limit is
// purely an abuse/cost backstop, not the anti-spam mechanism — generous
// enough that one device hitting a real crash loop doesn't lose reports.
export const errorReportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: 'Too many requests. Please try again later.' },
});

// MEDIUM FIX (M7, AUDIT_FULL_2026_10_13.md): one POST
// /api/project-coordinator/students/message can reach up to 500 students
// over in-app + email + push + SMS + WhatsApp — every send costs real
// Twilio/Brevo credit. Without a per-account limit, a compromised
// administrative_secretary account could loop it to drain credit and spam
// a whole faculty. 10 sends/hour per account is well above real usage (a
// few announcements a day). Mount AFTER verifyToken so it keys per account.
// Note: the counter is in-memory per Cloud Run instance, so it's a ceiling
// per instance, not a strict global one — still caps a runaway loop.
export const studentsMessageLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: (req: Request) => ({
    message: L(
      req,
      'You have sent too many messages in the last hour. Please try again later.',
      'שלחת יותר מדי הודעות בשעה האחרונה. נסה/י שוב מאוחר יותר.',
    ),
  }),
});

// POST /api/users/sync — student signup. Since the roster name check
// (services/studentNameMatch.ts), a refused attempt tells the caller "wrong
// name for this ID", so unlimited retries would let someone guess a
// stranger's name. Real signups need one or two calls. Mount AFTER
// verifyTokenOnly so it keys per Firebase account, not per IP.
export const signupSyncLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: (req: Request) => ({
    error: L(req, 'Too many registration attempts. Please try again in an hour.', 'יותר מדי ניסיונות הרשמה. יש לנסות שוב בעוד שעה.'),
  }),
});

// Per-account caps on the upload endpoints that aren't tied to a specific
// project/milestone (application CV/transcript, chat images, new-project
// files) — each upload costs Cloudinary storage. Separate instance per
// route so heavy chat-image use doesn't block a student's application.
// Mount AFTER verifyToken so they key per account.
function uploadLimiter(limitPerHour: number) {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: limitPerHour,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyByUserOrIp,
    message: (req: Request) => ({
      message: L(req, 'Too many uploads in the last hour. Please try again later.', 'יותר מדי העלאות בשעה האחרונה. יש לנסות שוב מאוחר יותר.'),
    }),
  });
}
export const applicationUploadLimiter = uploadLimiter(20);
export const chatImageUploadLimiter = uploadLimiter(30);
export const projectFileUploadLimiter = uploadLimiter(30);
