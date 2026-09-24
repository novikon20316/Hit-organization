// src/scripts/patchElishevaApplicationNotification.ts
//
// One-off: her `application_received` notification (doc iDAqX4ysdh147FPo4fG0,
// found by inspectElishevaPendingItems.ts) was written before the
// taskRoleCandidates fix (applicationController.ts) existed, so it has no
// targetScreen/targetRole — its "Go to relevant screen" link falls back to a
// generic dashboard home instead of /supervisor/dashboard?tab=applications.
// New notifications from this flow will be correct going forward; this
// patches the one already sitting in her bell so she doesn't have to wait
// for a fresh one to verify the fix.
//
// SAFE BY DEFAULT: dry run (report only) unless you pass --apply.
// Usage (from server/):
//   npx tsx src/scripts/patchElishevaApplicationNotification.ts             # dry run
//   npx tsx src/scripts/patchElishevaApplicationNotification.ts --apply     # actually writes

import { db } from '../config/firebase.js';

const APPLY = process.argv.includes('--apply');
const NOTIFICATION_ID = 'iDAqX4ysdh147FPo4fG0';

async function main() {
  const ref = db.collection('notifications').doc(NOTIFICATION_ID);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log('Notification not found:', NOTIFICATION_ID);
    return;
  }
  const data = snap.data()!;
  console.log('Current doc:', {
    type: data.type,
    recipientId: data.recipientId,
    targetScreen: data.targetScreen ?? '(none)',
    targetRole: data.targetRole ?? '(none)',
  });

  if (data.type !== 'application_received') {
    console.log('Unexpected type — aborting without writing.');
    return;
  }

  const patch = { targetScreen: 'supervisor_applications', targetRole: 'supervisor' };
  console.log(APPLY ? 'Applying patch:' : 'Would apply patch (dry run):', patch);
  if (APPLY) {
    await ref.update(patch);
    console.log('Patched.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
