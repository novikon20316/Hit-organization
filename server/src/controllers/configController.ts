import admin from 'firebase-admin';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';

const db = admin.firestore();

/**
 * GET /api/config/system/defenseWindowDays
 * FIX: route was documented as /api/admin/defense-window-days but the frontend
 *      calls /api/config/system/defenseWindowDays — register this handler on
 *      the correct path in config.ts (not adminRoutes.ts).
 *
 *      In your config.ts route file use:
 *        router.get('/system/defenseWindowDays', defenseWindowsDays);
 *
 *      Remove any registration of this handler from adminRoutes.ts.
 */
export const defenseWindowsDays = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const windowDaysDocRef = db.collection('system').doc('defenseWindowDays');
    const docSnapshot = await windowDaysDocRef.get();

    if (!docSnapshot.exists) {
      console.log('ℹ️ defenseWindowDays document not found. Falling back to default: 30');
      return res.status(200).json({ defenseDays: 30 });
    }

    const data = docSnapshot.data();
    const configuredDays = data?.days ?? 30;

    return res.status(200).json({ defenseDays: configuredDays });

  } catch (error: any) {
    console.error('❌ defenseWindowsDays extraction exception:', error);
    return res.status(500).json({ error: 'Failed to extract system configuration details.' });
  }
};