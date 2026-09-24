// src/scripts/inspectElishevaPendingItems.ts
//
// One-off, READ-ONLY diagnostic: find the coordinator+supervisor account
// named "אלישבע" (Sciences / computer_science), print her role/roles/
// coordinatorScopes fields, then look at her unread notifications and the
// milestone/project docs each one points to — to confirm whether the two
// "pending" notifications she reported are genuinely supervisor-tier
// submissions (routing[0].role === 'supervisor', supervisorId === her uid)
// rather than coordinator-tier ones, and to see what targetScreen (if any)
// got stored on each notification doc.
//
// No writes. Usage (from server/):
//   npx tsx src/scripts/inspectElishevaPendingItems.ts

import { db } from '../config/firebase.js';

async function main() {
  const usersSnap = await db.collection('users').where('displayName', '>=', 'אלישבע').where('displayName', '<=', 'אלישבע').get();
  const candidates = usersSnap.docs.length
    ? usersSnap.docs
    : (await db.collection('users').get()).docs.filter((d) => (d.data().displayName ?? '').includes('אלישבע'));

  if (candidates.length === 0) {
    console.log('No user found with displayName containing "אלישבע". Try matching by email instead.');
    return;
  }

  for (const userDoc of candidates) {
    const u = userDoc.data();
    console.log('\n=== User', userDoc.id, '===');
    console.log({
      displayName: u.displayName,
      email: u.email,
      role: u.role,
      roles: u.roles,
      facultyId: u.facultyId,
      major: u.major,
      coordinatorScopes: u.coordinatorScopes,
    });

    const notifSnap = await db.collection('notifications')
      .where('recipientId', '==', userDoc.id)
      .where('isRead', '==', false)
      .get();

    console.log(`-- ${notifSnap.size} unread notification(s) --`);
    for (const nDoc of notifSnap.docs) {
      const n = nDoc.data();
      console.log('\nnotification', nDoc.id, {
        type: n.type,
        titleHe: n.titleHe,
        targetScreen: n.targetScreen ?? '(none)',
        relatedProjectId: n.relatedProjectId,
        relatedMilestoneId: n.relatedMilestoneId,
        createdAt: n.createdAt?.toDate?.()?.toISOString?.(),
      });

      if (n.relatedMilestoneId) {
        const mSnap = await db.collection('milestones').doc(n.relatedMilestoneId).get();
        if (mSnap.exists) {
          const m = mSnap.data()!;
          console.log('  milestone:', {
            type: m.type,
            status: m.status,
            facultyId: m.facultyId,
            projectId: m.projectId,
            routing: m.routing,
            currentStageIndex: m.currentStageIndex,
          });
        } else {
          console.log('  milestone doc not found:', n.relatedMilestoneId);
        }
      }

      if (n.relatedProjectId) {
        const pSnap = await db.collection('projects').doc(n.relatedProjectId).get();
        if (pSnap.exists) {
          const p = pSnap.data()!;
          console.log('  project:', {
            titleHe: p.titleHe,
            facultyId: p.facultyId,
            major: p.major,
            supervisorId: p.supervisorId,
            isSupervisorHer: p.supervisorId === userDoc.id,
          });
        } else {
          console.log('  project doc not found:', n.relatedProjectId);
        }
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
