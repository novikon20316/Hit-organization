// One-time backfill: the first committee stand-in the administrative
// coordinator chose for a project now covers the WHOLE project (see
// committeeController.substituteCommitteeMember). Projects where stand-ins
// were picked per milestone before that rule get the project-level entry
// from their earliest milestone that has one, then every held milestone is
// re-entered, milestones in committee review get the stand-in on their
// lookup index, and open thesis exams rebuild their committee.
//
//   npx tsx src/scripts/backfillProjectCommitteeStandIns.ts          (dry run)
//   npx tsx src/scripts/backfillProjectCommitteeStandIns.ts --apply

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { applyProjectStandInEverywhere } from '../controllers/committeeController.js';

const APPLY = process.argv.includes('--apply');

async function name(uid: string): Promise<string> {
  return (await db.collection('users').doc(uid).get()).data()?.displayName ?? uid;
}

async function main() {
  const withSubs = await db.collection('milestones').where('committeeSubstituteIds', '!=', []).get();
  const byProject = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  for (const d of withSubs.docs) {
    const pid = d.data().projectId as string | undefined;
    if (!pid) continue;
    byProject.set(pid, [...(byProject.get(pid) ?? []), d]);
  }

  for (const [projectId, docs] of byProject) {
    const projectRef = db.collection('projects').doc(projectId);
    const project = (await projectRef.get()).data();
    if (!project) continue;
    const existing: Record<string, string> = project.committeeMemberSubstitutions ?? {};
    const sorted = [...docs].sort((a, b) => (a.data().order ?? 0) - (b.data().order ?? 0));
    const toAdd: Record<string, string> = {};
    for (const d of sorted) {
      for (const [orig, sub] of Object.entries((d.data().committeeMemberSubstitutions ?? {}) as Record<string, string>)) {
        if (!existing[orig] && !toAdd[orig]) toAdd[orig] = sub;
      }
    }
    if (Object.keys(toAdd).length === 0) continue;

    const lines = await Promise.all(Object.entries(toAdd).map(async ([o, s]) => `${await name(o)} -> ${await name(s)}`));
    console.log(`${APPLY ? 'APPLY' : 'DRY'} project ${projectId} "${project.titleHe ?? ''}": ${lines.join(', ')}`);
    if (!APPLY) continue;

    await projectRef.set({ committeeMemberSubstitutions: toAdd }, { merge: true });
    const merged = { ...existing, ...toAdd };
    // Milestones currently in committee review: put the stand-in on the
    // lookup index so it shows in their pending list.
    const all = await db.collection('milestones').where('projectId', '==', projectId).get();
    for (const m of all.docs) {
      const md = m.data();
      if (!md.currentCommitteeId) continue;
      const own: Record<string, string> = md.committeeMemberSubstitutions ?? {};
      const inherited = Object.entries(merged).filter(([o]) => !own[o]);
      if (inherited.length === 0) continue;
      await m.ref.update({
        ...Object.fromEntries(inherited.map(([o, s]) => [`committeeMemberSubstitutions.${o}`, s])),
        committeeSubstituteIds: admin.firestore.FieldValue.arrayUnion(...inherited.map(([, s]) => s)),
      });
      console.log(`  indexed in-review milestone ${m.id}`);
    }
    await applyProjectStandInEverywhere(projectId, null);
    console.log('  held milestones re-entered; open exam committee refreshed');
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
