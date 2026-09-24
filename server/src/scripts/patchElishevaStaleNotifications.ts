// src/scripts/patchElishevaStaleNotifications.ts
//
// One-off: three more of her notifications (found by
// inspectElishevaAllNotifications.ts) predate the taskRoleCandidates fix and
// still have no targetScreen/targetRole, same as the one
// patchElishevaApplicationNotification.ts already fixed. Verified against
// the underlying milestone/project docs first (see this repo's own
// conversation history) — both milestone_submitted ones are chain-driven
// with routing[0] = {role: 'supervisor', action: 'grade'}, and all three
// relatedProjectIds have her as supervisorId, so 'supervisor' is the correct
// targetRole for every one of them.
//
// SAFE BY DEFAULT: dry run (report only) unless you pass --apply.
// Usage (from server/):
//   npx tsx src/scripts/patchElishevaStaleNotifications.ts             # dry run
//   npx tsx src/scripts/patchElishevaStaleNotifications.ts --apply     # actually writes

import { db } from '../config/firebase.js';

const APPLY = process.argv.includes('--apply');

const PATCHES: { id: string; expectedType: string; targetScreen: string; targetRole: string }[] = [
  { id: 'Zk51FTQCCnnSItxn4Bxo', expectedType: 'milestone_submitted', targetScreen: 'supervisor_projects', targetRole: 'supervisor' },
  { id: 'uHH2sCHpZF8fOJUvFXdZ', expectedType: 'milestone_submitted', targetScreen: 'supervisor_projects', targetRole: 'supervisor' },
  { id: 'lZMwmAVaiVqWq8zHG7q5', expectedType: 'application_received', targetScreen: 'supervisor_applications', targetRole: 'supervisor' },
];

async function main() {
  for (const { id, expectedType, targetScreen, targetRole } of PATCHES) {
    const ref = db.collection('notifications').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(id, 'NOT FOUND — skipping');
      continue;
    }
    const data = snap.data()!;
    console.log(id, 'current:', { type: data.type, targetScreen: data.targetScreen ?? '(none)', targetRole: data.targetRole ?? '(none)' });
    if (data.type !== expectedType) {
      console.log(id, `type mismatch (expected ${expectedType}, got ${data.type}) — skipping without writing`);
      continue;
    }
    console.log(id, APPLY ? 'applying patch:' : 'would apply patch (dry run):', { targetScreen, targetRole });
    if (APPLY) {
      await ref.update({ targetScreen, targetRole });
      console.log(id, 'patched.');
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
