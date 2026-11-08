// src/controllers/notificationPrefsController.ts
//
// GET/PUT /api/users/me/notification-prefs — the signed-in user's own
// notification settings (services/notificationPrefs.ts). Only ever the
// caller's own doc; the stored value is always the server's normalized
// shape, never the raw request body.

import { Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { readPrefs, NOTIFICATION_CATEGORIES, OPTIONAL_CHANNELS } from '../services/notificationPrefs.js';
import { L } from '../utils/localize.js';

export const getMyNotificationPrefs = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized', 'לא מורשה') });
  try {
    const snap = await db.collection('users').doc(req.user.uid).get();
    return res.status(200).json({ prefs: readPrefs(snap.data()?.notificationPrefs) });
  } catch (error) {
    console.error('getMyNotificationPrefs error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load notification settings.', 'טעינת הגדרות ההתראות נכשלה.') });
  }
};

export const updateMyNotificationPrefs = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized', 'לא מורשה') });
  const body = req.body?.prefs;
  // Strict shape check — readPrefs alone would silently default anything
  // malformed, which would hide a broken client.
  const valid = body && typeof body === 'object'
    && typeof body.emailDigest === 'boolean'
    && NOTIFICATION_CATEGORIES.every((c) => OPTIONAL_CHANNELS.every((ch) => typeof body.channels?.[c]?.[ch] === 'boolean'));
  if (!valid) return res.status(400).json({ message: L(req, 'Invalid notification settings.', 'הגדרות ההתראות אינן תקינות.') });

  const prefs = readPrefs(body);
  try {
    await db.collection('users').doc(req.user.uid).set({ notificationPrefs: prefs }, { merge: true });
    return res.status(200).json({ prefs });
  } catch (error) {
    console.error('updateMyNotificationPrefs error:', error);
    return res.status(500).json({ message: L(req, 'Failed to save notification settings.', 'שמירת הגדרות ההתראות נכשלה.') });
  }
};
