// One-off, READ-ONLY: find unread notifications targeting admin_panel_milestones
// to diagnose why a system_admin's Milestones badge doesn't clear.
import { db } from '../config/firebase.js';

async function main() {
  const snap = await db.collection('notifications')
    .where('targetScreen', '==', 'admin_panel_milestones')
    .where('isRead', '==', false)
    .get();

  console.log(`${snap.size} unread notification(s) with targetScreen=admin_panel_milestones`);
  for (const doc of snap.docs) {
    const n = doc.data();
    console.log(doc.id, {
      recipientId: n.recipientId,
      type: n.type,
      isRead: n.isRead,
      targetRole: n.targetRole ?? '(none)',
      createdAt: n.createdAt?.toDate?.()?.toISOString?.(),
    });
    const userSnap = await db.collection('users').doc(n.recipientId).get();
    if (userSnap.exists) {
      const u = userSnap.data()!;
      console.log('  recipient:', { displayName: u.displayName, role: u.role, roles: u.roles });
    } else {
      console.log('  recipient user doc NOT FOUND for', n.recipientId);
    }
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
