import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import type { AuthenticatedRequest } from './auth.js';

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
