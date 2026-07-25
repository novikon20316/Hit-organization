// src/controllers/presenceController.ts
//
// Backs the system_admin-only "Live Transportation" monitoring page. Clients
// (web + mobile) call heartbeat() every ~25s while signed in; the admin page
// reads the `presence` collection directly via a Firestore client listener
// (see mobile/firestore.rules — system_admin read-only, no client write) to
// get instant updates without any polling on the read side.

import { Response } from 'express';
import { db } from '../config/firebase.js';
import admin from 'firebase-admin';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const heartbeat = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const platform = req.body?.platform === 'mobile' ? 'mobile' : 'web';

    await db.collection('presence').doc(uid).set({
      uid,
      displayName: req.user?.displayName ?? '',
      role: req.user?.role ?? 'student',
      platform,
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('presence heartbeat error:', error);
    return res.status(500).json({ error: 'Failed to record presence' });
  }
};
