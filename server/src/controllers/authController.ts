import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { db } from '../config/firebase.js'; // your firebase config
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { sendNotificationEmail } from '../services/emailService.js';

const RECOVERY_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function hashRecoveryCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// TOTP secrets/recovery-hash live here, not on users/{uid} directly — that doc
// is readable by any signed-in user (students need to read supervisors' names
// off it), so a client-readable Firestore path can never hold these. Firestore
// rules deny all client access to this subcollection outright; only the Admin
// SDK (this server) can reach it, since Admin SDK bypasses security rules.
function totpRef(uid: string) {
  return db.collection('users').doc(uid).collection('private').doc('totp');
}

// Step 1: Generate secret + QR code for the student
export const setup2FA = async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user; // from your verifyToken middleware
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  try {
    // 2FA is already active — resetting it must go through the email-verified
    // recovery flow (requestTotpRecoveryCode / verifyTotpRecoveryCode) instead
    // of this endpoint, or anyone who knows the password could silently swap
    // in their own authenticator without proving anything else.
    const existingDoc = await db.collection('users').doc(user.uid).get();
    if (existingDoc.data()?.totp_enabled) {
      return res.status(403).json({ error: '2FA is already enabled. Use account recovery to reset it.' });
    }

    const secret = speakeasy.generateSecret({
      name: `HIT Final Projects (${user.email})`,
      length: 20,
    });

    // Save temp secret until user confirms — set() with merge since this
    // subcollection doc may not exist yet for a first-time setup.
    await totpRef(user.uid).set({ secretTemp: secret.base32 }, { merge: true });

    const otpauthUrl = secret.otpauth_url;
    if (!otpauthUrl) return res.status(500).json({ error: 'Failed to generate secret.' });

    const qrCode = await QRCode.toDataURL(otpauthUrl);
    res.json({ qrCode, secret: secret.base32, otpauthUrl: otpauthUrl });
  } catch (error: any) {
    console.error('setup2FA error:', error);
    res.status(500).json({ error: 'Failed to set up 2FA.' });
  }
};

// Step 2: Student scans QR, enters code — activate 2FA
export const verify2FA = async (req: AuthenticatedRequest, res: Response) => {
  const { token } = req.body;
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  try {
    const totpDoc = await totpRef(user.uid).get();
    const { secretTemp } = totpDoc.data() ?? {};

    const verified = speakeasy.totp.verify({
      secret: secretTemp,
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!verified) return res.status(400).json({ error: 'Invalid code. Try again.' });

    await Promise.all([
      db.collection('users').doc(user.uid).update({ totp_enabled: true }),
      totpRef(user.uid).set({ secret: secretTemp, secretTemp: FieldValue.delete() }, { merge: true }),
    ]);

    res.json({ success: true });
  } catch (error: any) {
    console.error('verify2FA error:', error);
    res.status(500).json({ error: 'Failed to verify 2FA code.' });
  }
};

// Step 3: During login — validate the 6-digit code
export const login2FA = async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized.' }); // ← fix 1: guard

  const { token } = req.body; // ← fix 2: remove uid from here, use middleware

  try {
    const userDoc = await db.collection('users').doc(user.uid).get(); // ← fix 3: uid from middleware
    const { totp_enabled } = userDoc.data()!;

    if (!totp_enabled) return res.status(400).json({ error: '2FA not set up.' });

    const totpDoc = await totpRef(user.uid).get();
    const { secret: totp_secret } = totpDoc.data() ?? {};

    const verified = speakeasy.totp.verify({
      secret: totp_secret,
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!verified) return res.status(401).json({ error: 'Invalid 2FA code.' });

    // ✅ fix 4: save today's verification so _layout.tsx can skip 2FA for rest of day
    await db.collection('users').doc(user.uid).update({
      totp_last_verified: FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('login2FA error:', error);
    res.status(500).json({ error: 'Failed to verify 2FA code.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Lost-authenticator recovery — for a user stuck at the verify2fa screen
// (e.g. they deleted Google Authenticator). Two steps:
//   1. requestTotpRecoveryCode — emails a one-time code to the account's
//      own address (the user is already password-authenticated at this
//      point, just not yet 2FA-verified, so req.user.email is trustworthy).
//   2. verifyTotpRecoveryCode  — checks that code, then generates a brand
//      new TOTP secret/QR (same shape as setup2FA) so the user can enroll a
//      fresh authenticator. The existing /api/auth/2fa/verify endpoint is
//      reused to confirm the new secret and re-enable 2FA.
// ─────────────────────────────────────────────────────────────────────────────

// Step R1: email a 6-digit recovery code to the account's own address
export const requestTotpRecoveryCode = async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });
  if (!user.email) return res.status(400).json({ error: 'No email on file for this account.' });

  try {
    const userDoc  = await db.collection('users').doc(user.uid).get();
    const userData = userDoc.data();
    if (!userData?.totp_enabled) {
      return res.status(400).json({ error: '2FA is not set up on this account.' });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));

    await totpRef(user.uid).set({
      recoveryCodeHash: hashRecoveryCode(code),
      recoveryExpires:  Timestamp.fromMillis(Date.now() + RECOVERY_CODE_TTL_MS),
    }, { merge: true });

    await sendNotificationEmail({
      toEmail: user.email,
      type:    'totp_recovery_code',
      lang:    userData.language === 'en' ? 'en' : 'he',
      data:    { name: userData.displayName || '', code },
    });

    res.json({ success: true, message: 'Recovery code sent to your email.' });
  } catch (error: any) {
    console.error('requestTotpRecoveryCode error:', error);
    res.status(500).json({ error: 'Failed to send recovery code.' });
  }
};

// Step R2: verify that emailed code, then hand back a brand-new QR to enroll
export const verifyTotpRecoveryCode = async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Recovery code is required.' });
  }

  try {
    const totpDoc  = await totpRef(user.uid).get();
    const totpData = totpDoc.data();
    const storedHash   = totpData?.recoveryCodeHash;
    const storedExpiry = totpData?.recoveryExpires as Timestamp | undefined;

    if (!storedHash || !storedExpiry) {
      return res.status(400).json({ error: 'No recovery code was requested. Please request a new one.' });
    }
    if (Date.now() > storedExpiry.toMillis()) {
      return res.status(400).json({ error: 'This recovery code has expired. Please request a new one.' });
    }
    if (hashRecoveryCode(code) !== storedHash) {
      return res.status(400).json({ error: 'Invalid recovery code.' });
    }

    // Code confirmed — clear it (single use) and issue a fresh TOTP secret,
    // pending confirmation via the normal /api/auth/2fa/verify endpoint.
    const secret = speakeasy.generateSecret({
      name: `HIT Final Projects (${user.email})`,
      length: 20,
    });

    await totpRef(user.uid).set({
      secretTemp:       secret.base32,
      recoveryCodeHash: FieldValue.delete(),
      recoveryExpires:  FieldValue.delete(),
    }, { merge: true });

    const otpauthUrl = secret.otpauth_url;
    if (!otpauthUrl) return res.status(500).json({ error: 'Failed to generate secret.' });

    const qrCode = await QRCode.toDataURL(otpauthUrl);
    res.json({ qrCode, secret: secret.base32, otpauthUrl });
  } catch (error: any) {
    console.error('verifyTotpRecoveryCode error:', error);
    res.status(500).json({ error: 'Failed to verify recovery code.' });
  }
};

