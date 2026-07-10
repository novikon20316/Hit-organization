
import {Response} from 'express';
import {AuthenticatedRequest} from '../middleware/auth.js';
import {db} from '../config/firebase.js';

const MAINTENANCE_DOC = db.collection('system').doc('maintenance');

// ─── GET /api/system/maintenance-status ──────────────────────────────────────
// PUBLIC — no auth required. Called by the app before routing any user.
// Auto-expires maintenance when endsAt has passed.
//
export const getMaintenanceStatus = async (req: AuthenticatedRequest, res: Response) => {
    try {
    const snap = await MAINTENANCE_DOC.get();
 
    if (!snap.exists) {
      return res.json({ isActive: false, title: '', endsAt: null });
    }
 
    const data = snap.data();
    if(!data) {
      return res.json({ isActive: false, title: '', endsAt: null });
    }
 
    // Auto-expire: if endsAt has passed, flip isActive to false
    if (data.isActive && data.endsAt) {
      const endsAtMs = data.endsAt.toDate?.()?.getTime?.() ?? new Date(data.endsAt).getTime();
      if (Date.now() > endsAtMs) {
        await MAINTENANCE_DOC.update({ isActive: false });
        return res.json({ isActive: false, title: '', endsAt: null });
      }
    }
 
    return res.json({
      isActive: data.isActive ?? false,
      title:    data.title    ?? '',
      endsAt:   data.endsAt?.toDate?.()?.toISOString?.() ?? null,
    });
  } catch (err) {
    console.error('GET /system/maintenance-status error:', err);
    // Fail open — don't block users if the DB is unreachable
    return res.json({ isActive: false, title: '', endsAt: null });
  }
};


// ─── POST /api/admin/system/maintenance ──────────────────────────────────────
// Requires system_admin. Activates maintenance and schedules the broadcast.
//
// Body:
//   title            string   — user-facing message title
//   shutdownAt       number   — ms epoch when the app goes offline
//   maintenanceDurMs number   — how long (ms) maintenance will last
//   broadcastEnabled boolean  — whether to send a push broadcast
//
export const updateMaintenanceStatus = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        title,
        shutdownAt,
        maintenanceDurMs,
        broadcastEnabled = true,
      } = req.body;
      const uid = req.user?.uid;

      if(!uid) return res.status(401).json({ message: 'Unauthorized' });
 
      if (!title?.trim())        return res.status(400).json({ message: 'title is required' });
      if (!shutdownAt)           return res.status(400).json({ message: 'shutdownAt is required' });
      if (!maintenanceDurMs)     return res.status(400).json({ message: 'maintenanceDurMs is required' });
 
      const shutdownTs  = new Date(shutdownAt);
      const endsAt      = new Date(shutdownAt + maintenanceDurMs);
 
      // broadcastAt = shutdownAt - warnMs is already baked into shutdownAt by the
      // frontend (shutdownAt = Date.now() + warnMs). If you want separate control,
      // pass broadcastAt explicitly instead.
      const broadcastAt = shutdownTs; // fire the broadcast exactly at shutdown
 
      await MAINTENANCE_DOC.set({
        isActive:         true,
        title:            title.trim(),
        shutdownAt:       shutdownTs,
        endsAt,
        broadcastAt,
        broadcastEnabled,
        broadcastSent:    false,
        createdBy:        uid,
        createdAt:        new Date(),
      });
 
      // ── Optional: schedule a job to auto-deactivate when endsAt passes ──────
      // If you have a task scheduler (Bull, Agenda, Cloud Tasks, etc.) you can
      // enqueue a job here. Without one, the GET endpoint below handles it by
      // comparing endsAt to now at read time — no cron needed.
 
      return res.json({ ok: true });
    } catch (err) {
      console.error('POST /admin/system/maintenance error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
};

 
// ─── DELETE /api/admin/system/maintenance ─────────────────────────────────────
// Requires system_admin. Immediately ends maintenance.
//
export const deleteMaintenanceStatus = async (req: AuthenticatedRequest, res: Response) => {
    try {
      await MAINTENANCE_DOC.update({ isActive: false });
      return res.json({ ok: true });
    } catch (err) {
      console.error('DELETE /admin/system/maintenance error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
};