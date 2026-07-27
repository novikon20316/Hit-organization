import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import {
  resolvePlatform,
  readMaintenanceStatus,
  setMaintenanceStatus,
  clearMaintenanceStatus,
} from '../services/maintenanceStatus.js';

// ─── GET /api/system/maintenance-status?platform=web|mobile ─────────────────
// Requires auth (verifyToken) — called right after login/2FA once the
// client already has a token, not before. See maintenanceStatus.ts for the
// per-platform doc split and middleware/auth.ts's verifyToken for the
// actual per-request enforcement (this endpoint only self-reports; it
// doesn't gate anything by itself).
export const getMaintenanceStatus = async (req: AuthenticatedRequest, res: Response) => {
  const platform = resolvePlatform(req.query.platform);
  return res.json(await readMaintenanceStatus(platform));
};

// ─── POST /api/admin/system/maintenance ──────────────────────────────────────
// Requires system_admin. Activates maintenance for one platform (body.platform,
// 'web' | 'mobile' — defaults to 'mobile' for older callers that predate the
// platform split) and schedules the broadcast.
//
// Body:
//   platform         'web' | 'mobile'
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
      if (req.user?.role !== 'system_admin') {
        return res.status(403).json({ message: 'Access denied: system_admin only.' });
      }

      if (!title?.trim())        return res.status(400).json({ message: 'title is required' });
      if (!shutdownAt)           return res.status(400).json({ message: 'shutdownAt is required' });
      if (!maintenanceDurMs)     return res.status(400).json({ message: 'maintenanceDurMs is required' });

      const platform = resolvePlatform(req.body.platform);
      const shutdownTs = new Date(shutdownAt);
      const endsAt      = new Date(shutdownAt + maintenanceDurMs);

      await setMaintenanceStatus(platform, {
        title: title.trim(),
        shutdownAt: shutdownTs,
        endsAt,
        broadcastEnabled,
        createdBy: uid,
      });

      // ── Optional: schedule a job to auto-deactivate when endsAt passes ──────
      // If you have a task scheduler (Bull, Agenda, Cloud Tasks, etc.) you can
      // enqueue a job here. Without one, the GET endpoint below handles it by
      // comparing endsAt to now at read time — no cron needed.

      return res.json({ ok: true, platform });
    } catch (err) {
      console.error('POST /admin/system/maintenance error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
};


// ─── DELETE /api/admin/system/maintenance ─────────────────────────────────────
// Requires system_admin. Immediately ends maintenance for one platform
// (body.platform, same default as above).
export const deleteMaintenanceStatus = async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'system_admin') {
      return res.status(403).json({ message: 'Access denied: system_admin only.' });
    }
    try {
      const platform = resolvePlatform(req.body?.platform);
      await clearMaintenanceStatus(platform);
      return res.json({ ok: true, platform });
    } catch (err) {
      console.error('DELETE /admin/system/maintenance error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
};
