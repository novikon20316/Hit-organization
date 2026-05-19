import { Router, Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest, verifyToken } from '../middleware/auth.js';
import axios from 'axios';

const router = Router();

/**
 * @route   POST /api/notifications/trigger
 * @desc    Dispatches internal notifications and Expo Push notifications
 */
router.post('/trigger', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { recipientUid, title, body, data } = req.body;

    if (!recipientUid || !title || !body) {
      return res.status(400).json({ error: 'Missing routing targets or payload contents.' });
    }

    // 1. Persist the log statement to Firestore for the internal inbox feed
    await db.collection('users').doc(recipientUid).collection('notifications').add({
      title, // Fully supports Hebrew notification messages 
      body,
      data: data || {},
      read: false,
      createdAt: new Date().toISOString()
    });

    // 2. Query target user's Expo Push Token to dispatch to their physical device
    const userDoc = await db.collection('users').doc(recipientUid).get();
    const expoPushToken = userDoc.data()?.expoPushToken;

    if (expoPushToken && expoPushToken.startsWith('ExponentPushToken')) {
      // Send message payloads through Expo's centralized push service API gateway
      await axios.post('https://exp.host/--/api/v2/push/send', {
        to: expoPushToken,
        sound: 'default',
        title,
        body,
        data: data || {},
      }, {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. TODO: Insert your transactional mail service driver (Nodemailer, SendGrid) to send backup email 

    return res.status(200).json({ success: true, message: 'Alert sequences successfully initialized.' });
  } catch (error: any) {
    console.error('Notification dispatcher failure:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;