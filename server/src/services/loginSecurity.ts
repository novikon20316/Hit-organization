// src/services/loginSecurity.ts
//
// Login itself is 100% client-side Firebase Auth — this server has no
// built-in visibility into failed password attempts. This service adds that
// visibility deliberately server-side rather than trusting the client's
// self-report: every "failed attempt" reported by the app is independently
// re-verified against Google's own Identity Toolkit REST API before it's
// counted, so a direct API call (bypassing the app entirely) can't fake
// failed-attempt reports against someone else's email.
//
// After 3 confirmed-wrong-password attempts on a real account, the account is
// disabled at the Firebase Auth level (stops any further guessing cold) and
// the owner gets a one-time link (same pattern as examinerTokens/
// defenseAccessGrants in services/examinerAccess.ts) asking "was this you?".
// Unlike those, this collection is server-mediated only — the mobile screen
// never reads/writes loginSecurityIncidents directly, since resolving one
// always requires an Admin-SDK action (re-enable the account, issue a
// password, or notify admins).

import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db, auth } from '../config/firebase.js';
import { sendNotificationEmail } from './emailService.js';
import { generateTempPassword, setTempPasswordHash, hashPassword } from './userImportExport.js';
import { logAuditEvent } from './auditLog.js';

const INCIDENT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FAILURE_THRESHOLD = 3;

// CRITICAL FIX: this endpoint is unauthenticated by necessity (a failed
// login has no token to key on) — but that also meant anyone who just knows
// a victim's email could submit 3 different garbage passwords and get that
// real account Firebase-disabled, with no credential of their own. Two
// changes close this:
//   1. Resubmitting the exact same wrong password (a person re-trying their
//      own typo, or a flaky client retrying the same failed request) now
//      counts once, not once per submission — tracked via a hash of the
//      last reported password.
//   2. Distinct wrong passwords arriving faster than a real person could
//      plausibly re-type one are collapsed into a single count too. This
//      doesn't make the endpoint immune to a patient, deliberately-throttled
//      attacker — no unauthenticated check fully can — but it closes the
//      trivial "fire 3 requests in under a second" version of the attack,
//      and is backed up by the loginSecurityLimiter IP rate limit already
//      on this route plus the new system_admin "locked accounts" view below,
//      which gives fast visibility + a one-click lift if it ever fires on a
//      real account.
const MIN_MS_BETWEEN_COUNTED_ATTEMPTS = 5000;

// Deliberately NOT reusing examinerAccess.ts's generateUniqueCode — its
// charset includes `%`, `@`, `$` etc., which are safe in a query string
// (?token=...) but break when used as a raw URL PATH segment (confirmed live:
// a generated code containing `%` 500'd the /:code/confirm route). This
// code is used exclusively as a path segment, so keep it strictly
// alphanumeric — inherently URL-safe with no encoding to remember anywhere.
const CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const CODE_LENGTH = 10;

function generateOneTimeCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARSET[bytes[i]! % CODE_CHARSET.length];
  }
  return code;
}

async function generateUniqueCode(collection: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateOneTimeCode();
    const existing = await db.collection(collection).doc(code).get();
    if (!existing.exists) return code;
  }
  throw new Error('Failed to generate a unique incident code — please retry.');
}

// Public, well-known Firebase web API key for this project (same one already
// embedded in mobile/src/firebase/firebase.ts — Firebase web config is not a
// secret by design). Overridable via env in case the project ever changes.
const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || 'AIzaSyD7v2PB_ics4bDV346BxeIZjFvkbSHvjiM';

export interface IpLocation {
  city?:    string;
  region?:  string;
  country?: string;
}

type PasswordCheckResult = 'valid' | 'wrong_password' | 'no_such_user' | 'already_disabled' | 'unknown';

/**
 * Independently confirms whether `password` is actually wrong for `email`,
 * by asking Google directly — never trusts the client's claim alone.
 */
async function verifyPasswordViaIdentityToolkit(email: string, password: string): Promise<PasswordCheckResult> {
  let res: Response;
  try {
    res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: false }),
        signal: AbortSignal.timeout(8000),
      },
    );
  } catch (err) {
    console.error('Identity Toolkit verification call failed:', err);
    return 'unknown';
  }

  if (res.ok) return 'valid';

  const body: any = await res.json().catch(() => ({}));
  const message = body?.error?.message ?? '';

  if (message === 'EMAIL_NOT_FOUND') return 'no_such_user';
  if (message === 'INVALID_PASSWORD') return 'wrong_password';
  if (message === 'USER_DISABLED') return 'already_disabled';
  if (message === 'INVALID_LOGIN_CREDENTIALS') {
    // Project has email-enumeration protection on — Google no longer
    // distinguishes "no such user" from "wrong password" in this message.
    // Admin SDK can check existence without needing the password at all.
    try {
      await auth.getUserByEmail(email);
      return 'wrong_password';
    } catch {
      return 'no_such_user';
    }
  }
  if (message.startsWith('TOO_MANY_ATTEMPTS_TRY_LATER')) {
    // Google's own per-account throttling kicked in after repeated real
    // failed attempts — confirmed live in testing (Google starts returning
    // this before our own 3rd strike if attempts come in quick succession).
    // This is itself strong evidence of exactly the brute-force pattern this
    // feature exists to catch, so treat it the same as a confirmed wrong
    // password rather than silently dropping the report.
    return 'wrong_password';
  }
  console.error('Unexpected Identity Toolkit response, treating as unknown:', message);
  return 'unknown';
}

/** Best-effort IP → city/region/country. Fails open — never blocks the flow. */
export async function resolveIpLocation(ip: string): Promise<IpLocation | null> {
  if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.')) {
    return null; // local/private — nothing a public geo-IP lookup can resolve
  }
  try {
    const res = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const location: IpLocation = { city: data.city, region: data.region, country: data.country };
    return (location.city || location.region || location.country) ? location : null;
  } catch (err) {
    console.error('IP geolocation lookup failed:', err);
    return null;
  }
}

function formatLocation(loc: IpLocation | null): string {
  if (!loc) return '';
  return [loc.city, loc.region, loc.country].filter(Boolean).join(', ');
}

function formatDateTime(iso: string, lang: 'he' | 'en'): string {
  return new Date(iso).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US', {
    timeZone: 'Asia/Jerusalem',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function securityDocRef(uid: string) {
  return db.collection('users').doc(uid).collection('private').doc('security');
}

/**
 * Called after the mobile client catches a client-side Firebase wrong-password
 * error. Independently re-verifies the attempt, and only counts/acts on it if
 * Google itself confirms the password was actually wrong for a real account.
 */
export async function reportFailedLogin(
  email: string,
  password: string,
  ip: string,
): Promise<{ locked: boolean }> {
  const result = await verifyPasswordViaIdentityToolkit(email, password);
  if (result !== 'wrong_password') return { locked: false };

  const userRecord = await auth.getUserByEmail(email).catch(() => null);
  if (!userRecord) return { locked: false }; // defensive — verify already implied existence

  const uid = userRecord.uid;

  // Feeds the "Live Transportation" admin table with a visible comment for
  // every confirmed-wrong-password attempt, not just the 3rd-strike lockout
  // below — uses the Admin-Auth record's own displayName so this doesn't add
  // an extra Firestore read to this public, unauthenticated endpoint.
  await logAuditEvent({
    userId: uid,
    userRole: 'unknown',
    action: 'login_failed',
    entityType: 'session',
    entityId: uid,
    explanation: `Failed login attempt from ${ip}`,
    userDisplayName: userRecord.displayName,
  });

  const securityRef = securityDocRef(uid);
  const passwordHash = hashPassword(password);

  const shouldCreateIncident = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(securityRef);
    const data = snap.data() ?? {};

    // An incident is already awaiting the owner's response — don't pile on
    // more counting or send another alert email while one's outstanding.
    if (data.pendingIncidentCode) return false;

    const lastAt = (data.lastFailedLoginAt?.toMillis?.() as number | undefined) ?? 0;
    const isRepeatOfLastPassword = data.lastFailedPasswordHash === passwordHash;
    const isTooFastToBeARealRetry = !isRepeatOfLastPassword && lastAt > 0 && (Date.now() - lastAt) < MIN_MS_BETWEEN_COUNTED_ATTEMPTS;

    if (isRepeatOfLastPassword || isTooFastToBeARealRetry) {
      transaction.set(securityRef, {
        lastFailedPasswordHash: passwordHash,
        lastFailedLoginAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return false;
    }

    const newCount = (data.failedLoginCount ?? 0) + 1;
    if (newCount >= FAILURE_THRESHOLD) {
      transaction.set(securityRef, {
        failedLoginCount: 0,
        lastFailedPasswordHash: passwordHash,
        lastFailedLoginAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return true;
    }

    transaction.set(securityRef, {
      failedLoginCount: newCount,
      lastFailedPasswordHash: passwordHash,
      lastFailedLoginAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return false;
  });

  if (!shouldCreateIncident) return { locked: false };

  const code = await generateUniqueCode('loginSecurityIncidents');
  const location = await resolveIpLocation(ip);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INCIDENT_TTL_MS);

  await db.collection('loginSecurityIncidents').doc(code).set({
    code,
    uid,
    email,
    ip,
    location,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: 'pending',
    resolvedAt: null,
  });

  await securityRef.set({ pendingIncidentCode: code }, { merge: true });

  // Stops any further guessing immediately — including by the real owner,
  // but they were already failing to log in, so this costs them nothing
  // beyond needing to check email first.
  await auth.updateUser(uid, { disabled: true });

  const userDoc = await db.collection('users').doc(uid).get();
  const userData = userDoc.data();
  const lang: 'he' | 'en' = userData?.language === 'en' ? 'en' : 'he';
  const baseUrl = process.env.EXAMINER_ACCESS_BASE_URL || ''; // same public deep-link base as examinerAccess.ts
  if (!baseUrl) {
    console.error(
      `login_security_alert for ${email}: EXAMINER_ACCESS_BASE_URL is unset — the "click here to respond" ` +
      `link in this email will be missing its domain and won't work.`
    );
  }
  const link = `${baseUrl}/login-security?code=${encodeURIComponent(code)}`;

  // Previously: a bare `.catch(console.error)` — a delivery failure vanished
  // into a server log nobody was watching, with no way to tell afterward
  // that the account got disabled but the owner was never actually notified.
  // Persisting the outcome on the incident doc makes that diagnosable.
  try {
    await sendNotificationEmail({
      toEmail: email,
      type: 'login_security_alert',
      lang,
      data: {
        name: userData?.displayName || '',
        email,
        dateTime: formatDateTime(now.toISOString(), lang),
        ip,
        location: formatLocation(location),
        link,
      },
    });
    await db.collection('loginSecurityIncidents').doc(code).update({ emailDelivery: 'sent' });
  } catch (err: any) {
    console.error(`Failed to send login_security_alert email for incident ${code}:`, err);
    await db.collection('loginSecurityIncidents').doc(code).update({
      emailDelivery: 'failed',
      emailDeliveryError: String(err?.message ?? err),
    }).catch(() => {}); // best-effort — never let a logging write mask the original failure
  }

  return { locked: true };
}

export interface IncidentSummary {
  email:     string;
  ip:        string;
  location:  string;
  dateTime:  string;
  status:    'pending' | 'confirmed_owner' | 'confirmed_attacker' | 'expired';
}

export async function getIncidentSummary(code: string): Promise<IncidentSummary | null> {
  const ref = db.collection('loginSecurityIncidents').doc(code);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const data = snap.data()!;
  let status = data.status as IncidentSummary['status'];

  if (status === 'pending' && new Date(data.expiresAt).getTime() < Date.now()) {
    await ref.update({ status: 'expired' });
    status = 'expired';
  }

  return {
    email: data.email,
    ip: data.ip,
    location: formatLocation(data.location ?? null),
    dateTime: formatDateTime(data.createdAt, 'en'),
    status,
  };
}

export type IncidentDecision = 'owner' | 'attacker';

export async function resolveIncident(
  code: string,
  decision: IncidentDecision,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'already_resolved' | 'expired' }> {
  const ref = db.collection('loginSecurityIncidents').doc(code);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: 'not_found' };

  const incident = snap.data()!;
  if (incident.status !== 'pending') return { ok: false, reason: 'already_resolved' };
  if (new Date(incident.expiresAt).getTime() < Date.now()) {
    await ref.update({ status: 'expired' });
    return { ok: false, reason: 'expired' };
  }

  const uid = incident.uid as string;
  const securityRef = securityDocRef(uid);
  const resolvedAt = new Date().toISOString();

  if (decision === 'owner') {
    const tempPassword = generateTempPassword();
    await auth.updateUser(uid, { password: tempPassword, disabled: false });
    await db.collection('users').doc(uid).update({
      mustChangePassword: true,
      updatedAt: new Date().toISOString(),
    });
    await setTempPasswordHash(uid, tempPassword);
    await securityRef.set({ pendingIncidentCode: FieldValue.delete(), failedLoginCount: 0 }, { merge: true });
    await ref.update({ status: 'confirmed_owner', resolvedAt });

    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();
    await sendNotificationEmail({
      toEmail: incident.email,
      type: 'temp_password_issued',
      lang: userData?.language === 'en' ? 'en' : 'he',
      data: { name: userData?.displayName || '', tempPassword },
    }).catch((err) => console.error('Failed to send temp_password_issued email:', err));

    return { ok: true };
  }

  // decision === 'attacker' — leave the account disabled, alert admins.
  await securityRef.set({ pendingIncidentCode: FieldValue.delete() }, { merge: true });
  await ref.update({ status: 'confirmed_attacker', resolvedAt });
  await notifySystemAdmins({
    email: incident.email,
    ip: incident.ip,
    location: incident.location ?? null,
    createdAt: incident.createdAt,
  });

  return { ok: true };
}

export interface PendingLockout {
  code:      string;
  uid:       string;
  email:     string;
  displayName: string;
  ip:        string;
  location:  string;
  createdAt: string;
}

/** system_admin "locked accounts" view — every account currently disabled by
 *  the 3-strikes flow, still awaiting either the owner's email link or an
 *  admin lifting it directly (see liftLockout below). */
export async function listPendingLockouts(): Promise<PendingLockout[]> {
  const snap = await db.collection('loginSecurityIncidents').where('status', '==', 'pending').orderBy('createdAt', 'desc').get();
  if (snap.empty) return [];

  const incidents = snap.docs.map((d) => ({ code: d.id, ...d.data() } as any));
  const userSnaps = await Promise.all(incidents.map((inc) => db.collection('users').doc(inc.uid).get()));

  return incidents.map((inc, i) => ({
    code:        inc.code,
    uid:         inc.uid,
    email:       inc.email,
    displayName: userSnaps[i]?.data()?.displayName ?? '',
    ip:          inc.ip ?? '',
    location:    formatLocation(inc.location ?? null),
    createdAt:   inc.createdAt,
  }));
}

/** system_admin lifting a lockout directly from the admin panel — reuses the
 *  exact same "was this you? → yes" recovery path the account owner's own
 *  email link triggers (re-enable, issue+email a fresh temp password, clear
 *  the pending incident) rather than a separate, divergent code path. */
export async function liftLockout(code: string): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'already_resolved' | 'expired' }> {
  return resolveIncident(code, 'owner');
}

async function notifySystemAdmins(incident: {
  email: string;
  ip: string;
  location: IpLocation | null;
  createdAt: string;
}): Promise<void> {
  const [byRole, byRolesArray] = await Promise.all([
    db.collection('users').where('role', '==', 'system_admin').get(),
    db.collection('users').where('roles', 'array-contains', 'system_admin').get(),
  ]);

  const admins = new Map<string, FirebaseFirestore.DocumentData>();
  byRole.docs.forEach((d) => admins.set(d.id, d.data()));
  byRolesArray.docs.forEach((d) => admins.set(d.id, d.data()));

  const location = formatLocation(incident.location);

  await Promise.all(Array.from(admins.entries()).map(async ([adminUid, adminData]) => {
    const lang: 'he' | 'en' = adminData?.language === 'en' ? 'en' : 'he';
    const dateTime = formatDateTime(incident.createdAt, lang);

    await db.collection('notifications').add({
      recipientId: adminUid,
      type: 'suspicious_login',
      titleHe: '🚨 ניסיון התחברות חשוד',
      titleEn: '🚨 Suspicious login attempt',
      bodyHe: `ניסיון התחברות לחשבון ${incident.email} מכתובת ${incident.ip}${location ? ` (${location})` : ''} ב-${dateTime}, סומן כלא-מזוהה על ידי בעל החשבון.`,
      bodyEn: `A login attempt on ${incident.email} from ${incident.ip}${location ? ` (${location})` : ''} at ${dateTime} was flagged as not recognized by the account owner.`,
      isRead: false,
      relatedProjectId: null,
      relatedMilestoneId: null,
      createdAt: FieldValue.serverTimestamp(),
      targetScreen: 'login_security',
    }).catch((err) => console.error('Failed to create admin notification:', err));

    if (adminData?.email) {
      await sendNotificationEmail({
        toEmail: adminData.email,
        type: 'suspicious_login_admin_alert',
        lang,
        data: {
          name: adminData?.displayName || '',
          attemptedEmail: incident.email,
          ip: incident.ip,
          location,
          dateTime,
        },
      }).catch((err) => console.error('Failed to send suspicious_login_admin_alert email:', err));
    }
  }));
}
