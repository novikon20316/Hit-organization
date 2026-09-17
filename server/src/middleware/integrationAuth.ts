// src/middleware/integrationAuth.ts
//
// Server-to-server auth for the integration routes (see routes/integrations.ts)
// that a different system - administrative-coordinator, a separate HIT app
// with its own Firebase project - calls to pull a student's project
// milestones/grades into its own coordinator dashboard. That caller has no
// Firebase Auth account here, so verifyToken doesn't apply; a shared secret
// is the whole trust boundary instead. Comparison is timing-safe
// (crypto.timingSafeEqual) since a naive === leaks the secret's
// prefix length/content through response-time differences.

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function verifyIntegrationKey(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.INTEGRATION_API_KEY;
  if (!expected) {
    console.error('INTEGRATION_API_KEY is not set — refusing all integration requests.');
    return res.status(503).json({ message: 'Integration is not configured.' });
  }

  const provided = req.headers['x-integration-key'];
  if (typeof provided !== 'string' || !provided) {
    return res.status(401).json({ message: 'Missing integration key.' });
  }

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  const matches =
    expectedBuf.length === providedBuf.length &&
    crypto.timingSafeEqual(expectedBuf, providedBuf);

  if (!matches) {
    return res.status(403).json({ message: 'Invalid integration key.' });
  }

  return next();
}
