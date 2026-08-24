// src/controllers/feedbackController.ts
//
// Permanent feedback/bug-report chat (see mobile/components/FeedbackChat.tsx),
// available to every role except system_admin. Every message is classified
// by classifyFeedback() (services/feedbackService.ts): "noise" is deleted
// immediately, "real" feedback persists and is surfaced to system_admin in
// the admin panel's Feedback tab — never replied to in-thread (one-way, see
// getAdminFeedback/resolveFeedback below).

import { Response } from 'express';
import admin from 'firebase-admin';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { classifyFeedback } from '../services/feedbackService.js';

const db = admin.firestore();

// POST /api/feedback
export const submitFeedback = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const role = req.user?.role;
  if (!uid || !role) return res.status(401).json({ message: 'Unauthorized.' });
  if (role === 'system_admin') {
    return res.status(403).json({ message: 'system_admin reviews feedback in the admin panel instead of sending it.' });
  }

  const { text } = req.body;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ message: 'Missing feedback text.' });
  }
  const trimmed = text.trim().slice(0, 2000);

  try {
    const userSnap = await db.collection('users').doc(uid).get();
    const userName = userSnap.data()?.displayName ?? 'Unknown';

    const feedbackRef = db.collection('feedbackMessages').doc();
    await feedbackRef.set({
      userId: uid,
      userName,
      role,
      text: trimmed,
      classification: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const { classification, reasoning } = await classifyFeedback(trimmed);

    if (classification === 'noise') {
      await feedbackRef.delete();
      return res.status(200).json({ success: true, classification, erased: true });
    }

    await feedbackRef.update({ classification: 'real', aiReasoning: reasoning, status: 'open' });

    // Notification failures must never mask the message above, which has
    // already committed by this point.
    try {
      const adminsSnap = await db.collection('users').where('role', '==', 'system_admin').get();
      await Promise.all(adminsSnap.docs.map((adminDoc) =>
        db.collection('notifications').add({
          recipientId: adminDoc.id,
          type: 'feedback_received',
          titleHe: 'משוב חדש התקבל 💬',
          titleEn: 'New Feedback Received 💬',
          bodyHe: `${userName} שלח משוב: "${trimmed.slice(0, 80)}"`,
          bodyEn: `${userName} sent feedback: "${trimmed.slice(0, 80)}"`,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          targetScreen: 'admin_panel_feedback',
        })
      ));
    } catch (notifyError) {
      console.error('Failed to notify system_admin of new feedback:', notifyError);
    }

    return res.status(200).json({ success: true, classification, erased: false });
  } catch (error: any) {
    console.error('submitFeedback error:', error);
    return res.status(500).json({ message: error.message || 'Failed to submit feedback.' });
  }
};

// GET /api/feedback — the caller's own feedback history (noise is already
// erased, so anything returned here is either pending classification or real)
export const getMyFeedback = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });

  try {
    // Sorted in memory rather than via Firestore orderBy — an equality filter
    // plus orderBy on a different field needs a composite index, and this
    // collection is small per-user, so there's no need to provision one.
    const snap = await db.collection('feedbackMessages')
      .where('userId', '==', uid)
      .get();

    const messages = snap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          text: data.text,
          classification: data.classification,
          status: data.status ?? null,
          createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        };
      })
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

    return res.status(200).json({ messages });
  } catch (error: any) {
    console.error('getMyFeedback error:', error);
    return res.status(500).json({ message: 'Failed to load feedback.' });
  }
};

// GET /api/feedback/admin?status=open|resolved — system_admin only
export const getAdminFeedback = async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'system_admin') {
    return res.status(403).json({ message: 'Access denied.' });
  }

  try {
    // Sorted in memory rather than via Firestore orderBy — see getMyFeedback
    // above for why (equality filters + orderBy on a different field needs a
    // composite index this collection has no need to provision).
    let query: FirebaseFirestore.Query = db.collection('feedbackMessages').where('classification', '==', 'real');
    const status = req.query.status;
    if (status === 'open' || status === 'resolved') {
      query = query.where('status', '==', status);
    }
    const snap = await query.get();

    const messages = snap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          userId: data.userId,
          userName: data.userName,
          role: data.role,
          text: data.text,
          aiReasoning: data.aiReasoning ?? null,
          status: data.status ?? 'open',
          createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        };
      })
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

    return res.status(200).json({ messages });
  } catch (error: any) {
    console.error('getAdminFeedback error:', error);
    return res.status(500).json({ message: 'Failed to load feedback.' });
  }
};

// PATCH /api/feedback/admin/:id/resolve — system_admin only
export const resolveFeedback = async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'system_admin') {
    return res.status(403).json({ message: 'Access denied.' });
  }
  const { id } = req.params;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ message: 'Invalid feedback id.' });
  }

  try {
    const ref = db.collection('feedbackMessages').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ message: 'Feedback not found.' });

    await ref.update({
      status: 'resolved',
      resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      resolvedBy: req.user!.uid,
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('resolveFeedback error:', error);
    return res.status(500).json({ message: error.message || 'Failed to resolve feedback.' });
  }
};
