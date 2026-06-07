import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { db } from '../config/firebase.js'; // your firebase config
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';

// Step 1: Generate secret + QR code for the student
export const setup2FA = async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user; // from your verifyToken middleware
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });
  const secret = speakeasy.generateSecret({
    name: `HIT Final Projects (${user.email})`,
    length: 20,
  });

  // Save temp secret to Firestore until user confirms
  await db.collection('users').doc(user.uid).update({
    totp_secret_temp: secret.base32,
  });

  const otpauthUrl = secret.otpauth_url;
  if (!otpauthUrl) return res.status(500).json({ error: 'Failed to generate secret.' });

  const qrCode = await QRCode.toDataURL(otpauthUrl);
  res.json({ qrCode, secret: secret.base32, otpauthUrl: otpauthUrl });
};

// Step 2: Student scans QR, enters code — activate 2FA
export const verify2FA = async (req: AuthenticatedRequest, res: Response) => {
  const { token } = req.body;
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });
  const userDoc = await db.collection('users').doc(user.uid).get();
  const { totp_secret_temp } = userDoc.data()!;

  const verified = speakeasy.totp.verify({
    secret: totp_secret_temp,
    encoding: 'base32',
    token,
    window: 1,
  });

  if (!verified) return res.status(400).json({ error: 'Invalid code. Try again.' });

  await db.collection('users').doc(user.uid).update({
    totp_secret: totp_secret_temp,
    totp_enabled: true,
    totp_secret_temp: null,
  });

  res.json({ success: true });
};

// Step 3: During login — validate the 6-digit code
export const login2FA = async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized.' }); // ← fix 1: guard

  const { token } = req.body; // ← fix 2: remove uid from here, use middleware

  const userDoc = await db.collection('users').doc(user.uid).get(); // ← fix 3: uid from middleware
  const { totp_secret, totp_enabled } = userDoc.data()!;

  console.log('🔐 login2FA — totp_enabled:', totp_enabled);
  console.log('🔐 login2FA — totp_secret exists:', !!totp_secret);
  console.log('🔐 login2FA — token received:', token);
  console.log('🔐 login2FA — user.uid:', user.uid);
  if (!totp_enabled) return res.status(400).json({ error: '2FA not set up.' });

  const verified = speakeasy.totp.verify({
    secret: totp_secret,
    encoding: 'base32',
    token,
    window: 1,
  });

  if (!verified) return res.status(401).json({ error: 'Invalid 2FA code.' });

  // ✅ fix 4: save today's verification so _layout.tsx can skip 2FA for rest of day
  await db.collection('users').doc(user.uid).update({
    totp_last_verified: new Date(),
  });

  res.json({ success: true });
};

