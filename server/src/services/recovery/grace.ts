// src/services/recovery/grace.ts — the 24-hour quiet period after a
// restore with "outage grace" (restore.ts applyOutageGrace). Kept apart from
// restore.ts so systemHealth.ts can check it without pulling in Cloudinary.

import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../../config/firebase.js';

let graceCache: { untilMs: number; checkedAt: number } | null = null;

/** True while reminder/escalation sweeps should stay quiet after a restore. */
export async function inRecoveryGrace(): Promise<boolean> {
  const now = Date.now();
  if (!graceCache || now - graceCache.checkedAt > 5 * 60_000) {
    try {
      const snap = await db.doc('system/recoveryGrace').get();
      const until = snap.data()?.until;
      graceCache = { untilMs: until instanceof Timestamp ? until.toMillis() : 0, checkedAt: now };
    } catch {
      graceCache = { untilMs: 0, checkedAt: now };
    }
  }
  return now < graceCache.untilMs;
}
