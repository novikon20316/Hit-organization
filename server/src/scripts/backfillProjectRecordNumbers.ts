// src/scripts/backfillProjectRecordNumbers.ts
//
// One-time backfill: assigns a permanent recordNumber (see
// services/projectRecordNumber.ts) to every project created before that
// feature existed. Processes projects oldest-first WITHIN each faculty, so
// the assigned numbers land in the same chronological order the faculty's
// projects were actually posted in — matching what a fresh project created
// right after this runs would have gotten anyway. Already-numbered
// projects are left untouched (idempotent — safe to re-run).
//
// SAFE BY DEFAULT: dry run (prints what it would assign, writes nothing)
// unless you pass --apply. Always run without --apply first.
//
// Usage (from server/):
//   npx tsx src/scripts/backfillProjectRecordNumbers.ts             # dry run
//   npx tsx src/scripts/backfillProjectRecordNumbers.ts --apply     # actually writes

import { db } from '../config/firebase.js';
import { assignProjectRecordNumber } from '../services/projectRecordNumber.js';

const APPLY = process.argv.includes('--apply');

function toMillis(createdAt: unknown): number {
  if (!createdAt) return 0;
  const asTimestamp = createdAt as { toMillis?: () => number };
  if (typeof asTimestamp.toMillis === 'function') return asTimestamp.toMillis();
  const d = new Date(createdAt as string);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

async function main() {
  const snap = await db.collection('projects').get();
  const missing = snap.docs.filter((doc) => !doc.data().recordNumber);
  console.log(`${snap.size} total projects, ${missing.length} missing a recordNumber.`);
  if (missing.length === 0) return;

  const byFaculty = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  missing.forEach((doc) => {
    const facultyId: string = doc.data().facultyId || 'unknown';
    if (!byFaculty.has(facultyId)) byFaculty.set(facultyId, []);
    byFaculty.get(facultyId)!.push(doc);
  });

  for (const [facultyId, docs] of byFaculty) {
    docs.sort((a, b) => toMillis(a.data().createdAt) - toMillis(b.data().createdAt));
    console.log(`\n${facultyId}: ${docs.length} project(s) to number, oldest first.`);
    for (const doc of docs) {
      const p = doc.data();
      const label = p.titleEn || p.titleHe || doc.id;
      if (!APPLY) {
        console.log(`  [dry run] would assign a record number to ${doc.id} (${label})`);
        continue;
      }
      const recordNumber = await assignProjectRecordNumber(facultyId);
      await doc.ref.update({ recordNumber });
      console.log(`  ${doc.id} (${label}) -> ${recordNumber}`);
    }
  }

  if (!APPLY) console.log('\nDry run only — re-run with --apply to actually write.');
}

main().catch((err) => {
  console.error('backfillProjectRecordNumbers failed:', err);
  process.exit(1);
});
