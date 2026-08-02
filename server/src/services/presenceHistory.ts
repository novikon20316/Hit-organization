// src/services/presenceHistory.ts
//
// Feeds the "Live Transportation" admin page's rolling active-users chart
// (web/app/admin/live-transportation/page.tsx) with server-persisted samples
// of the online-user count, so the trend survives page reloads/logouts and
// keeps accumulating even when no admin has the page open. Previously that
// chart was built purely from the page's own React state, wiped on every
// mount.
//
// Sampled on a schedule (see index.ts) — same in-process setInterval pattern
// as services/accountDeletion.ts/notificationScheduler.ts.

import { db } from '../config/firebase.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

// Must match the "active now" window used client-side in
// live-transportation/page.tsx (ONLINE_WINDOW_MS) so the persisted trend and
// the live tile agree on what counts as "online".
const ONLINE_WINDOW_MS = 60_000;
// How long a sample is kept before prunePresenceHistory sweeps it out.
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export async function samplePresenceHistory(): Promise<void> {
  try {
    const cutoff = Timestamp.fromMillis(Date.now() - ONLINE_WINDOW_MS);
    const snap = await db.collection('presence').where('lastSeen', '>=', cutoff).get();

    let web = 0;
    let mobile = 0;
    snap.forEach((d) => {
      if (d.data().platform === 'mobile') mobile += 1;
      else web += 1;
    });

    await db.collection('presenceHistory').add({
      count: web + mobile,
      web,
      mobile,
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('samplePresenceHistory failed:', err);
  }
}

/** Run daily (see index.ts) — keeps the collection from growing unbounded. */
export async function prunePresenceHistory(): Promise<void> {
  try {
    const cutoff = Timestamp.fromMillis(Date.now() - RETENTION_MS);
    const snap = await db.collection('presenceHistory').where('timestamp', '<', cutoff).limit(500).get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (err) {
    console.error('prunePresenceHistory failed:', err);
  }
}
