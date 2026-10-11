// src/controllers/decisionRelayConfigController.ts
//
// system_admin-only read/write of which majors the committee-chairman
// decision-relay picker (see services/decisionRelay.ts) is enabled for.
// Mirrors maintenanceController.ts's shape exactly.

import { Response } from 'express';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { readDecisionRelayEnabledMajors, setDecisionRelayEnabledMajors } from '../services/decisionRelayConfig.js';
import { L } from '../utils/localize.js';

// GET /api/admin/decision-relay-config
export const getDecisionRelayConfig = async (req: AuthenticatedRequest, res: Response) => {
  if (!hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  }
  const enabledMajors = await readDecisionRelayEnabledMajors();
  return res.status(200).json({ enabledMajors });
};

// POST /api/admin/decision-relay-config — body: { enabledMajors: string[] }
export const updateDecisionRelayConfig = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (!hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  }
  const { enabledMajors } = req.body ?? {};
  if (!Array.isArray(enabledMajors) || !enabledMajors.every((m) => typeof m === 'string')) {
    return res.status(400).json({ message: L(req, 'enabledMajors must be an array of major slugs.', 'enabledMajors חייב להיות מערך של קודי מגמה.') });
  }
  try {
    await setDecisionRelayEnabledMajors(enabledMajors, uid);
    return res.status(200).json({ success: true, enabledMajors });
  } catch (err: any) {
    return res.status(400).json({ message: err.message || L(req, 'Failed to update decision-relay config.', 'עדכון הגדרות העברת ההחלטות נכשל.') });
  }
};
