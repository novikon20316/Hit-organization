// src/services/decisionRelayConfig.ts
//
// System_admin-editable list of majors the committee-chairman "send the
// decision back to..." picker is enabled for (see decisionRelay.ts, the
// only consumer). Stored exactly like maintenanceStatus.ts's per-platform
// maintenance flags — a single doc under the `system` collection, read
// fresh on every check (no caching) and failing open to today's known-good
// default rather than throwing, so an unreachable DB never crashes a
// committee decision.

import { db } from '../config/firebase.js';
import { VALID_MAJORS } from '../config/majors.js';

function decisionRelayConfigDocRef() {
  return db.collection('system').doc('decisionRelay');
}

// What was hardcoded before this became admin-editable — kept as the
// fallback so an admin who's never touched the new control sees unchanged
// behavior (computer_science enabled, everything else not).
export const DEFAULT_ENABLED_MAJORS = ['computer_science'];

export async function readDecisionRelayEnabledMajors(): Promise<string[]> {
  try {
    const snap = await decisionRelayConfigDocRef().get();
    if (!snap.exists) return DEFAULT_ENABLED_MAJORS;
    const majors = snap.data()?.enabledMajors;
    return Array.isArray(majors) ? majors : DEFAULT_ENABLED_MAJORS;
  } catch (err) {
    console.error('readDecisionRelayEnabledMajors error:', err);
    return DEFAULT_ENABLED_MAJORS;
  }
}

/** Throws on an unknown major slug — a typo'd/stale value here would
 *  silently fail to enable anything, far worse than a loud 400 at save time. */
export async function setDecisionRelayEnabledMajors(majors: string[], updatedBy: string): Promise<void> {
  const invalid = majors.filter((m) => !VALID_MAJORS.has(m));
  if (invalid.length > 0) {
    throw new Error(`Unknown major slug(s): ${invalid.join(', ')}`);
  }
  await decisionRelayConfigDocRef().set({
    enabledMajors: [...new Set(majors)],
    updatedBy,
    updatedAt: new Date(),
  });
}
