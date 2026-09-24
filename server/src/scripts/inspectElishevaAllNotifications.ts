// src/scripts/inspectElishevaAllNotifications.ts
//
// One-off, READ-ONLY: list EVERY notification (read or unread) for
// אלישבע בנש"ק דוקוב, not just the unread ones inspectElishevaPendingItems.ts
// checked — to find older notifications (like the Aug 23 "בחירת מנחה"
// milestone_submitted one she's now re-testing from her history) whose
// targetScreen/targetRole predate the taskRoleCandidates fix and were never
// caught by the earlier unread-only patch.
//
// Usage (from server/):
//   npx tsx src/scripts/inspectElishevaAllNotifications.ts

import { db } from '../config/firebase.js';

const UID = 'IG7F4dy3iWR0Oe42493uhsyahak1';

async function main() {
  const snap = await db.collection('notifications')
    .where('recipientId', '==', UID)
    .orderBy('createdAt', 'desc')
    .get();

  console.log(`${snap.size} total notification(s) for this account`);
  for (const doc of snap.docs) {
    const n = doc.data();
    console.log(doc.id, {
      type: n.type,
      titleHe: n.titleHe,
      isRead: n.isRead,
      targetScreen: n.targetScreen ?? '(none)',
      targetRole: n.targetRole ?? '(none)',
      relatedProjectId: n.relatedProjectId ?? null,
      relatedMilestoneId: n.relatedMilestoneId ?? null,
      createdAt: n.createdAt?.toDate?.()?.toISOString?.(),
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
