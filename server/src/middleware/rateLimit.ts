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
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
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
