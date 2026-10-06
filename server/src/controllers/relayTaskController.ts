// src/controllers/relayTaskController.ts
//
// Tracked follow-up for a committee decision the chairman routed to someone
// other than the student (see services/decisionRelay.ts) — that person is
// responsible for relaying the outcome to the student themselves, and this
// keeps the obligation visible on their dashboard until they explicitly
// mark it done, rather than trusting a one-shot notification alone.

import { Response } from 'express';
import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

/** GET /api/relay-tasks/mine — every open (unresolved) relay task assigned
 *  to the caller, oldest first. */
export const getMyRelayTasks = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  try {
    const snap = await db.collection('relayTasks')
      .where('recipientId', '==', uid)
      .where('resolvedAt', '==', null)
      .orderBy('createdAt', 'asc')
      .get();
    const tasks = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json({ tasks });
  } catch (error: any) {
    console.error('getMyRelayTasks error:', error);
    return res.status(500).json({ message: 'Failed to load your relay tasks.' });
  }
};

/** POST /api/relay-tasks/:id/resolve — the recipient confirms they've
 *  passed the outcome on to the student. Only the assigned recipient may
 *  resolve their own task. */
export const resolveRelayTask = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const { id } = req.params as { id: string };
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  try {
    const ref = db.collection('relayTasks').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ message: 'Relay task not found.' });
    const data = snap.data()!;
    if (data.recipientId !== uid) {
      return res.status(403).json({ message: 'Only the assigned recipient may resolve this task.' });
    }
    if (data.resolvedAt) return res.status(200).json({ success: true });
    await ref.update({ resolvedAt: admin.firestore.FieldValue.serverTimestamp() });
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('resolveRelayTask error:', error);
    return res.status(500).json({ message: 'Failed to resolve the relay task.' });
  }
};
