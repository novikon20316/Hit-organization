// One-off: clears the 3 stuck admin_panel_milestones notifications found by
// inspectAdminMilestoneBadge.ts. Server-side query/write already verified
// correct in isolation (testMarkReadQuery.ts) — this just applies it to all
// 3 recipients found, not just the one test account.
import { db } from '../config/firebase.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  const snap = await db.collection('notifications')
    .where('targetScreen', '==', 'admin_panel_milestones')
    .where('isRead', '==', false)
    .get();

  console.log(`${snap.size} unread doc(s) found`);
  if (snap.empty) return;

  if (APPLY) {
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.update(db.collection('notifications').doc(doc.id), { isRead: true }));
    await batch.commit();
    console.log('Marked all as read:', snap.docs.map((d) => d.id));
  } else {
    console.log('Dry run — would mark as read:', snap.docs.map((d) => d.id));
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
