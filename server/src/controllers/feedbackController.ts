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
import { AuthenticatedRequest, hasAnyRole, getUserRoles } from '../middleware/auth.js';
import { classifyFeedback, type OpenFeedbackForAi } from '../services/feedbackService.js';
import { L } from '../utils/localize.js';

const db = admin.firestore();

/** Where a feedback message was sent from, collected by the client so a
 *  report like "it doesn't work" can be tied to a screen, device and build.
 *  Every field is optional and length-capped — it's client-supplied. */
interface FeedbackContext {
  platform?: 'web' | 'ios' | 'android';
  appVersion?: string;
  screen?: string;
  activeRole?: string;
  device?: string;
  language?: string;
  /** Cloud Run revision of the API that received it — ties the report to a deploy. */
  serverRevision?: string;
}

function cleanString(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
}

function sanitizeContext(raw: unknown, req: AuthenticatedRequest): FeedbackContext {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const platform = body.platform === 'web' || body.platform === 'ios' || body.platform === 'android' ? body.platform : undefined;
  const activeRole = cleanString(body.activeRole, 40);
  const context: { [K in keyof FeedbackContext]-?: FeedbackContext[K] | undefined } = {
    platform,
    appVersion: cleanString(body.appVersion, 60),
    screen: cleanString(body.screen, 300),
    // Only a role the sender actually holds.
    activeRole: activeRole && getUserRoles(req.user).includes(activeRole) ? activeRole : undefined,
    device: cleanString(body.device, 200),
    language: body.language === 'he' || body.language === 'en' ? body.language : undefined,
    serverRevision: cleanString(process.env.K_REVISION, 80),
  };
  // Firestore rejects undefined field values.
  return Object.fromEntries(Object.entries(context).filter(([, v]) => v !== undefined)) as FeedbackContext;
}

/** The most recent open real feedback, offered to the classifier so it can
 *  flag a new message as a duplicate. Equality-only filters, so no
 *  composite index is needed; sorted and capped in memory. */
async function loadOpenFeedbackForAi(): Promise<OpenFeedbackForAi[]> {
  const snap = await db.collection('feedbackMessages')
    .where('classification', '==', 'real')
    .where('status', '==', 'open')
    .get();
  return snap.docs
    .map((doc) => ({ doc, createdAt: doc.data().createdAt?.toMillis?.() ?? 0 }))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 40)
    .map(({ doc }) => {
      const data = doc.data();
      return { id: doc.id, summary: (data.summaryEn ?? String(data.text ?? '')).slice(0, 200) };
    });
}

// POST /api/feedback
export const submitFeedback = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const role = req.user?.role;
  if (!uid || !role) return res.status(401).json({ message: L(req, 'Unauthorized.', 'המשתמש אינו מאומת.') });
  if (role === 'system_admin') {
    return res.status(403).json({ message: L(req, 'system_admin reviews feedback in the admin panel instead of sending it.', 'מנהל מערכת סוקר משוב בפאנל הניהול ולא שולח אותו.') });
  }

  const { text } = req.body;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ message: L(req, 'Missing feedback text.', 'חסר תוכן המשוב.') });
  }
  const trimmed = text.trim().slice(0, 2000);
  const context = sanitizeContext(req.body.context, req);

  try {
    const userSnap = await db.collection('users').doc(uid).get();
    const userName = userSnap.data()?.displayName ?? 'Unknown';

    const feedbackRef = db.collection('feedbackMessages').doc();
    await feedbackRef.set({
      userId: uid,
      userName,
      // The role they were viewing the app as, when known — a multi-role
      // user's primary role says little about which screen they mean.
      role: context.activeRole ?? role,
      text: trimmed,
      context,
      classification: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const openItems = await loadOpenFeedbackForAi().catch((err) => {
      console.error('loadOpenFeedbackForAi failed:', err);
      return [];
    });
    const { classification, reasoning, category, urgency, summaryEn, duplicateOfId } = await classifyFeedback(
      trimmed,
      { role: context.activeRole ?? role, screen: context.screen, platform: context.platform },
      openItems,
    );

    if (classification === 'noise') {
      await feedbackRef.delete();
      return res.status(200).json({ success: true, classification, erased: true });
    }

    await feedbackRef.update({
      classification: 'real',
      aiReasoning: reasoning,
      category,
      urgency,
      summaryEn,
      duplicateOfId,
      status: 'open',
    });

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
    return res.status(500).json({ message: L(req, 'Failed to submit feedback.', 'שליחת המשוב נכשלה.') });
  }
};

// GET /api/feedback — the caller's own feedback history (noise is already
// erased, so anything returned here is either pending classification or real)
export const getMyFeedback = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'המשתמש אינו מאומת.') });

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
    return res.status(500).json({ message: L(req, 'Failed to load feedback.', 'טעינת המשוב נכשלה.') });
  }
};

// GET /api/feedback/admin?status=open|resolved — system_admin only
export const getAdminFeedback = async (req: AuthenticatedRequest, res: Response) => {
  if (!hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'Access denied.', 'הגישה נדחתה.') });
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
          category: data.category ?? null,
          urgency: data.urgency ?? null,
          summaryEn: data.summaryEn ?? null,
          duplicateOfId: data.duplicateOfId ?? null,
          context: data.context ?? null,
          status: data.status ?? 'open',
          createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        };
      })
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

    return res.status(200).json({ messages });
  } catch (error: any) {
    console.error('getAdminFeedback error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load feedback.', 'טעינת המשוב נכשלה.') });
  }
};

// PATCH /api/feedback/admin/:id/resolve — system_admin only
export const resolveFeedback = async (req: AuthenticatedRequest, res: Response) => {
  if (!hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'Access denied.', 'הגישה נדחתה.') });
  }
  const { id } = req.params;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ message: L(req, 'Invalid feedback id.', 'מזהה משוב לא תקין.') });
  }

  try {
    const ref = db.collection('feedbackMessages').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ message: L(req, 'Feedback not found.', 'המשוב לא נמצא.') });

    await ref.update({
      status: 'resolved',
      resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      resolvedBy: req.user!.uid,
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('resolveFeedback error:', error);
    return res.status(500).json({ message: L(req, 'Failed to resolve feedback.', 'סימון המשוב כטופל נכשל.') });
  }
};
