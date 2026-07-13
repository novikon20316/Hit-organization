// src/controllers/notificationController.ts
import { Response } from 'express';
import admin from 'firebase-admin';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { softError } from '../middleware/auth.js';

const db = admin.firestore();

/**
 * GET /api/notifications/inbox
 */
export const getNotificationInboxSummary = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ message: 'Unauthorized access: Missing token context.' });

    const snapshot = await db.collection('notifications')
      .where('recipientId', '==', uid)
      .where('isRead', '==', false)
      .get();

    return res.status(200).json({ unreadCount: snapshot.size });

  } catch (error: any) {
    return softError(res, 'Failed to load notification inbox.', error);
  }
};

// No confirmed live caller in the mobile app today, but it's a real,
// deployed, authenticated-only route that let any signed-in user push a
// fully attacker-controlled title/body/deep-link to any other user — a
// phishing/impersonation vector. Restricted to staff-tier roles as
// defense-in-depth until an actual caller/use case is defined.
const NOTIFICATION_DISPATCH_ROLES = [
  'supervisor', 'secondary_supervisor', 'coordinator', 'administrative_secretary',
  'program_head', 'internal_examiner', 'faculty_admin', 'grad_school_head', 'system_admin',
];

/**
 * POST /api/notifications/trigger
 */
export const triggerNotificationDispatch = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.role || !NOTIFICATION_DISPATCH_ROLES.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const { recipientUid, title, body, data } = req.body;

    // Missing fields is a caller mistake → keep 400
    if (!recipientUid || !title || !body) {
      return res.status(400).json({ error: 'Missing notification dispatch telemetry.' });
    }

    const notifRef = db.collection('notifications').doc();
    await notifRef.set({
      recipientId:      recipientUid,
      titleHe:          title,
      titleEn:          title,
      bodyHe:           body,
      bodyEn:           body,
      isRead:           false,
      createdAt:        new Date().toISOString(),
      relatedProjectId: data?.projectId || null,
      type:             data?.type      || 'general',
      chatId:           data?.chatId    || null,
    });

    const userDoc  = await db.collection('users').doc(recipientUid).get();
    const userData = userDoc.data();
    const pushToken = userData?.expoPushToken;

    if (pushToken && pushToken.startsWith('ExponentPushToken')) {
      const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:    pushToken,
          title,
          body,
          data:  data || {},
          sound: 'default',
        }),
      });

      const expoJson = await expoResponse.json();

      if (expoJson?.data?.status === 'error') {
        console.error('❌ Expo push delivery error:', expoJson.data.details);
        // Stale token — clear it so we don't keep sending to a dead device
        if (expoJson.data.details?.error === 'DeviceNotRegistered') {
          await db.collection('users').doc(recipientUid).update({ expoPushToken: null });
        }
      } else {
        console.log(`📲 Push routed to UID: ${recipientUid}`);
      }
    }

    return res.status(200).json({ success: true, message: 'Notification archived and dispatched.' });

  } catch (error: any) {
    return softError(res, 'Failed to send notification.', error);
  }
};

/**
 * GET /api/notifications/feed
 */
export const getUserNotificationFeed = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized user credentials' });

    const snapshot = await db.collection('notifications')
      .where('recipientId', '==', uid)
      .orderBy('createdAt', 'desc')
      .get();

    const feedItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json(feedItems);

  } catch (error: any) {
    return softError(res, 'Failed to load notifications.', error);
  }
};

/**
 * POST /api/notifications/mark-all-read
 */
export const markAllNotificationsAsRead = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized user context.' });

    const unreadSnap = await db.collection('notifications')
      .where('recipientId', '==', uid)
      .where('isRead', '==', false)
      .get();

    if (unreadSnap.empty) {
      return res.status(200).json({ success: true, message: 'No unread notifications found.' });
    }

    const batch = db.batch();
    unreadSnap.docs.forEach((doc) => {
      batch.update(db.collection('notifications').doc(doc.id), { isRead: true });
    });
    await batch.commit();

    return res.status(200).json({
      success: true,
      message: `Successfully marked ${unreadSnap.size} notifications as read.`,
    });

  } catch (error: any) {
    return softError(res, 'Failed to mark notifications as read.', error);
  }
};

/**
 * PATCH /api/notifications/:notificationId/read
 */
export const markNotificationRead = async (req: AuthenticatedRequest, res: Response) => {
  const uid                = req.user?.uid;
  const { notificationId } = req.params;

  if (!notificationId || typeof notificationId !== 'string') {
    return res.status(400).json({ message: 'Invalid notificationId.' });
  }

  try {
    const notifRef  = db.collection('notifications').doc(notificationId);
    const notifSnap = await notifRef.get();

    if (!notifSnap.exists) {
      return res.status(404).json({ message: 'Notification not found.' });
    }

    if (notifSnap.data()?.recipientId !== uid) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    await notifRef.update({ isRead: true, readAt: new Date().toISOString() });
    return res.status(200).json({ success: true, message: 'Notification marked as read.' });

  } catch (error: any) {
    return softError(res, 'Failed to mark notification as read.', error);
  }
};

/**
 * GET /api/notifications/badge-count
 */
export const getNotificationBadgeCount = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });

  try {
    const snap = await db.collection('notifications')
      .where('recipientId', '==', uid)
      .where('isRead', '==', false)
      .get();

    return res.status(200).json({ unreadCount: snap.size });

  } catch (error: any) {
    return softError(res, 'Failed to fetch badge count.', error);
  }
};

/**
 * PATCH /api/notifications/:notificationId/read  (legacy alias)
 */
export const ReadMessage = async (req: AuthenticatedRequest, res: Response) => {
  const { notificationId } = req.params;
  if (!notificationId || typeof notificationId !== 'string') {
    return res.status(400).json({ message: 'Error. Wrong notification ID' });
  }
  try {
    await db.collection('notifications').doc(notificationId).update({ isRead: true });
    return res.status(200).json({ success: true });
  } catch (e: any) {
    return softError(res, 'Failed to mark message as read.', e);
  }
};