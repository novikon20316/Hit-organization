// src/controllers/appVersionController.ts — see services/appVersion.ts.
import { Request, Response } from 'express';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { MOBILE_PLATFORMS, readAppVersionPolicy, writeAppVersionPolicy } from '../services/appVersion.js';
import { L } from '../utils/localize.js';

/** GET /api/app-version — PUBLIC (the app checks it before anyone signs in). */
export const getAppVersionPolicy = async (_req: Request, res: Response) => {
  const policy = await readAppVersionPolicy();
  res.set('Cache-Control', 'no-store');
  return res.status(200).json({ ios: policy.ios, android: policy.android });
};

/** GET /api/admin/system/app-version — system_admin. */
export const getAppVersionPolicyAdmin = async (req: AuthenticatedRequest, res: Response) => {
  if (!hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  }
  return res.status(200).json(await readAppVersionPolicy());
};

/** PUT /api/admin/system/app-version — system_admin.
 *  Body: { ios?: { minBuild?: number|null, storeUrl?: string }, android?: {...} } */
export const updateAppVersionPolicy = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || !hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  }
  const updates: Parameters<typeof writeAppVersionPolicy>[0] = {};
  for (const p of MOBILE_PLATFORMS) {
    const raw = req.body?.[p];
    if (raw == null) continue;
    const u: { minBuild?: number | null; storeUrl?: string } = {};
    if (raw.minBuild !== undefined) {
      if (raw.minBuild !== null && !(Number.isInteger(raw.minBuild) && raw.minBuild > 0 && raw.minBuild < 1_000_000)) {
        return res.status(400).json({ message: L(req, 'The minimum build must be a positive whole number, or empty.', 'גרסת המינימום חייבת להיות מספר שלם חיובי, או ריקה.') });
      }
      u.minBuild = raw.minBuild;
    }
    if (raw.storeUrl !== undefined) {
      const url = String(raw.storeUrl).trim();
      if (url && !/^https:\/\/(apps\.apple\.com|play\.google\.com)\//.test(url)) {
        return res.status(400).json({ message: L(req, 'The store link must be an App Store or Google Play https link.', 'קישור החנות חייב להיות קישור https של App Store או Google Play.') });
      }
      u.storeUrl = url;
    }
    updates[p] = u;
  }
  try {
    await writeAppVersionPolicy(updates, req.user.uid);
    return res.status(200).json(await readAppVersionPolicy());
  } catch (error) {
    console.error('updateAppVersionPolicy error:', error);
    return res.status(500).json({ message: L(req, 'Failed to save the app version settings.', 'שמירת הגדרות גרסת האפליקציה נכשלה.') });
  }
};
