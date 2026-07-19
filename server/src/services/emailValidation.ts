// src/services/emailValidation.ts
//
// Shared email-validation helpers used by both student self-signup
// (syncData in userController.ts) and admin-provisioned accounts
// (createAdminUser in adminController.ts) — preventing typo'd/made-up
// addresses from reaching Firebase Auth + triggering a bounced welcome
// email in the first place.

import dns from 'dns';

const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailFormat(email: unknown): email is string {
  return typeof email === 'string' && EMAIL_FORMAT_REGEX.test(email.trim());
}

function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  return at === -1 ? null : email.slice(at + 1).trim().toLowerCase();
}

// Students self-register with an institutional or Gmail address only —
// never a domain of their own choosing.
export const STUDENT_ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'my.hit.ac.il'];

export function isAllowedStudentEmailDomain(email: unknown): boolean {
  if (!isValidEmailFormat(email)) return false;
  const domain = emailDomain(email);
  return domain !== null && STUDENT_ALLOWED_EMAIL_DOMAINS.includes(domain);
}

const MX_LOOKUP_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('DNS lookup timed out')), ms)),
  ]);
}

// Admin-provisioned accounts (any role, any real-world domain — not
// restricted to a fixed allowlist like students) — verified instead by
// confirming the domain can actually receive mail at all, catching typo'd/
// nonexistent domains (e.g. "gnail.com") without needing a paid third-party
// verification service. Not a guarantee the specific mailbox exists, only
// that the domain itself is real and mail-capable.
export async function domainHasMailServer(email: unknown): Promise<boolean> {
  if (!isValidEmailFormat(email)) return false;
  const domain = emailDomain(email);
  if (!domain) return false;

  try {
    const records = await withTimeout(dns.promises.resolveMx(domain), MX_LOOKUP_TIMEOUT_MS);
    if (Array.isArray(records) && records.length > 0) return true;
  } catch {
    // No MX record (or lookup failed) — fall through to the A-record
    // fallback below before giving up.
  }

  // RFC 5321 §5.1 fallback: a domain with no MX record can still accept
  // mail directly via its A/AAAA record. Rare in practice, but rejecting a
  // domain solely for lacking an MX record would be a false positive.
  try {
    await withTimeout(dns.promises.resolve4(domain), MX_LOOKUP_TIMEOUT_MS);
    return true;
  } catch {
    return false;
  }
}
