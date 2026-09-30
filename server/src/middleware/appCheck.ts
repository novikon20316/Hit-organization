// src/middleware/appCheck.ts
//
// Verifies the X-Firebase-AppCheck header both web (lib/apiClient.ts) and
// mobile (src/api/apiClient.ts) attach to every request. Controlled by
// APP_CHECK_ENFORCEMENT_MODE so this can ship long before every client
// actually sends a valid token:
//   'off'     (default) — middleware is a no-op.
//   'monitor' — verifies and logs pass/fail/missing, never blocks. Ship in
//               this mode first and watch logs until real client traffic is
//               consistently sending valid tokens.
//   'enforce' — missing/invalid token -> 401, same error-shape convention as
//               verifyToken's own rejections in middleware/auth.ts.
// Deliberately does NOT touch Firestore/Identity Toolkit — those are
// enforced (if/when enabled) by Firebase's own backends via the Console's
// per-API "Enforce" toggle, no code here affects that at all. This
// middleware only protects this Express server's own custom API.

import { Request, Response, NextFunction } from 'express';
import { getAppCheck } from 'firebase-admin/app-check';
import { app } from '../config/firebase.js';

type EnforcementMode = 'off' | 'monitor' | 'enforce';

function currentMode(): EnforcementMode {
  const raw = process.env.APP_CHECK_ENFORCEMENT_MODE;
  return raw === 'monitor' || raw === 'enforce' ? raw : 'off';
}

export const verifyAppCheck = async (req: Request, res: Response, next: NextFunction) => {
  const mode = currentMode();
  if (mode === 'off') return next();

  const token = req.headers['x-firebase-appcheck'];
  const rawToken = Array.isArray(token) ? token[0] : token;

  if (!rawToken) {
    console.warn(`[appCheck] missing token — ${req.method} ${req.originalUrl}`);
    if (mode === 'enforce') return res.status(401).json({ error: 'APP_CHECK_FAILED' });
    return next();
  }

  try {
    await getAppCheck(app).verifyToken(rawToken);
    if (mode === 'monitor') console.log(`[appCheck] verified — ${req.method} ${req.originalUrl}`);
    return next();
  } catch (err: any) {
    console.warn(`[appCheck] verification failed — ${req.method} ${req.originalUrl}:`, err?.message ?? err);
    if (mode === 'enforce') return res.status(401).json({ error: 'APP_CHECK_FAILED' });
    return next();
  }
};
