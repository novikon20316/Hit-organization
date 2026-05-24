import { Response } from 'express';
import admin from 'firebase-admin';
import { AuthenticatedRequest } from '../middleware/auth.js';

const db = admin.firestore();

/**
 * GET /api/notifications/inbox
 * Fetches notifications and returns an unread count specific to the authorized user token.
 */
export const getNotificationInboxSummary = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user?.uid;

    if (!uid) {
      return res.status(401).json({ message: 'Unauthorized access: Missing token context.' });
    }

    console.log(`📡 Fetching notification inbox badge counts for user: ${uid}`);

    // Query Firestore only for notifications matching this user's recipientId
    const snapshot = await db.collection('notifications')
      .where('recipientId', '==', uid)
      .where('isRead', '==', false)
      .get();

    // Return the specific key 'unreadCount' your frontend is checking!
    return res.status(200).json({
      unreadCount: snapshot.size, // .size is ultra-fast and avoids serializing a heavy array
    });

  } catch (error: any) {
    console.error('getNotificationInboxSummary error:', error);
    return res.status(500).json({ message: 'Internal server error calculating navigation badges.' });
  }
};

/**
 * POST /api/notifications/trigger
 * Securely archives an in-app notification context and dispatches a hardware push token to Expo.
 */
export const triggerNotificationDispatch = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { recipientUid, title, body, data } = req.body;

    if (!recipientUid || !title || !body) {
      return res.status(400).json({ error: 'Missing notification dispatch telemetry.' });
    }

    // 1. Write transactional log directly to database using server-side SDK
    const notifRef = db.collection('notifications').doc();
    await notifRef.set({
      recipientId: recipientUid,
      titleHe: title,
      titleEn: title,
      bodyHe: body,
      bodyEn: body,
      isRead: false,
      createdAt: new Date().toISOString(),
      relatedProjectId: data?.projectId || null,
      type: data?.type || 'general', // Explicitly storing the incoming type if available
      chatId: data?.chatId || null   // Supporting messaging channels
    });

    // 2. Extract targeted physical device push registration token securely on backend
    const userDoc = await db.collection('users').doc(recipientUid).get();
    const userData = userDoc.data();
    const pushToken = userData?.expoPushToken;

    if (pushToken && pushToken.startsWith('ExponentPushToken')) {
      // 3. Dispatch directly to Expo API backend securely from Node environment
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: pushToken,
          title,
          body,
          data: data || {},
          sound: 'default'
        })
      });
      console.log(`📲 Server-Side Push successfully routed to UID: ${recipientUid}`);
    }

    return res.status(200).json({ success: true, message: 'Notification securely archived and dispatched.' });
  } catch (error: any) {
    console.error('Server notification dispatcher exception:', error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/notifications/feed
 * Natively returns all feed notification objects for the authorized user's feed
 */
export const getUserNotificationFeed = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user?.uid;

    if (!uid) {
      return res.status(401).json({ error: 'Unauthorized user credentials' });
    }

    console.log(`📡 Compiling feed items for UID: ${uid}`);

    // Query Firestore for documents matching this user, sorted by newest first
    const snapshot = await db.collection('notifications')
      .where('recipientId', '==', uid)
      .orderBy('createdAt', 'desc')
      .get();

    const feedItems = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Return the clean data feed array back to the mobile phone
    return res.status(200).json(feedItems);
  } catch (error: any) {
    console.error('getUserNotificationFeed Error:', error);
    return res.status(500).json({ error: 'Failed compiling feed items on server side.' });
  }
};


/**
 * POST or PATCH /api/notifications/mark-all-read
 * Natively batch-updates all unread notifications to read for the authenticated user context.
 */
export const markAllNotificationsAsRead = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user?.uid;

    if (!uid) {
      return res.status(401).json({ error: 'Unauthorized user context.' });
    }

    console.log(`📡 Marking all notifications as read for UID: ${uid}`);

    // Fetch only the unread notifications for this specific user
    const unreadSnap = await db.collection('notifications')
      .where('recipientId', '==', uid)
      .where('isRead', '==', false)
      .get();

    if (unreadSnap.empty) {
      return res.status(200).json({ success: true, message: 'No unread notifications found.' });
    }

    // Initialize a Firestore batch to update multiple items cleanly in a single request
    const batch = db.batch();

    unreadSnap.docs.forEach((doc) => {
      const docRef = db.collection('notifications').doc(doc.id);
      batch.update(docRef, { isRead: true });
    });

    // Commit the batch writes to the database
    await batch.commit();

    return res.status(200).json({ 
      success: true, 
      message: `Successfully marked ${unreadSnap.size} notifications as read.` 
    });
  } catch (error: any) {
    console.error('markAllNotificationsAsRead Error:', error);
    return res.status(500).json({ error: 'Failed to update user notification logs.' });
  }
};

// PATCH /api/notifications/:notificationId/read
export const ReadMessage = async (req: AuthenticatedRequest, res: Response) => {
  const { notificationId } = req.params;
  if(!notificationId || typeof notificationId !== 'string'){
    return res.status(500).json(
      {
        message: "Error. Wrong notification ID" 
      }
    )
  }
  try {
    await db.collection('notifications').doc(notificationId).update({ isRead: true });
    return res.status(200).json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
};

/**
 * 1. GET /api/notifications/badge-count
 * Returns a lightweight unread notification count for the nav badge.
 * Called by app/tabs/Facultytemplatemanager.tsx (and any tab that shows a badge).
 */
export const getNotificationBadgeCount = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;

  if (!uid) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  try {
    const snap = await db.collection('notifications')
      .where('recipientId', '==', uid)
      .where('isRead', '==', false)
      .get();

    return res.status(200).json({ unreadCount: snap.size });
  } catch (error) {
    console.error('getNotificationBadgeCount error:', error);
    return res.status(500).json({ message: 'Failed to fetch badge count.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
/**
 * 2. PATCH /api/notifications/:notificationId/read
 * Marks a single notification as read.
 * Called by apiClient.markNotificationRead(notif.id) in app/tabs/notifications.tsx.
 */
export const markNotificationRead = async (req: AuthenticatedRequest, res: Response) => {
  const uid                    = req.user?.uid;
  const { notificationId }     = req.params;

  if (!notificationId || typeof notificationId !== 'string') {
    return res.status(400).json({ message: 'Invalid notificationId.' });
  }

  try {
    const notifRef  = db.collection('notifications').doc(notificationId);
    const notifSnap = await notifRef.get();

    if (!notifSnap.exists) {
      return res.status(404).json({ message: 'Notification not found.' });
    }

    // Only the recipient may mark their own notification as read
    if (notifSnap.data()?.recipientId !== uid) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    await notifRef.update({ isRead: true, readAt: new Date().toISOString() });

    return res.status(200).json({ success: true, message: 'Notification marked as read.' });
  } catch (error) {
    console.error('markNotificationRead error:', error);
    return res.status(500).json({ message: 'Failed to mark notification as read.' });
  }
};