// src/scripts/migrateFacultyIds.ts
//
// One-off migration: remaps facultyId values written under the old,
// now-retired taxonomy (computer_science / electrical / software / industrial /
// mechanical / learning_technology / all) onto the canonical one
// (sciences / electrical / industrial / learning_tech / medical_tech / design / all)
// — see mobile/firebase/roles.ts VALID_FACULTY_IDS for the canonical list.
//
// SAFE BY DEFAULT: runs as a dry run (report only, no writes) unless you pass
// --apply. Always run without --apply first and read the report.
//
// Usage (from server/):
//   npx tsx src/scripts/migrateFacultyIds.ts             # dry run
//   npx tsx src/scripts/migrateFacultyIds.ts --apply     # actually writes
//
// 'software' and 'mechanical' are NOT remapped — there was no confirmed
// mapping for them at the time this script was written (they may be missing
// faculties, or programs under an existing faculty). Any doc with one of
// these values is reported under "flagged" and left untouched. Decide their
// mapping, add it to FACULTY_ID_MAP below, and re-run.

import { db } from '../config/firebase.js';

const APPLY = process.argv.includes('--apply');

// Old taxonomy value → canonical value. Only include values with a CONFIRMED
// 1:1 mapping — anything else should go in FLAGGED_VALUES instead of being
// guessed here.
const FACULTY_ID_MAP: Record<string, string> = {
  computer_science: 'sciences',
  learning_technology: 'learning_tech',
  // 'electrical', 'industrial', and 'all' are unchanged between taxonomies.
};

// Old values with no confirmed mapping yet — reported, never written.
const FLAGGED_VALUES = new Set(['software', 'mechanical']);

const CANONICAL_VALUES = new Set([
  'sciences', 'electrical', 'industrial', 'learning_tech', 'medical_tech', 'design', 'data_science', 'all',
]);

// Roles that should always end up with facultyId 'all' — mirrors
// CROSS_FACULTY_ROLES in mobile/firebase/roles.ts.
const CROSS_FACULTY_ROLES = new Set([
  'system_admin', 'administrative_secretary', 'grad_school_head', 'internal_examiner',
]);

interface CollectionPlan {
  name: string;
  // Field to read/write the faculty value from.
  field: string;
}

const COLLECTIONS: CollectionPlan[] = [
  { name: 'users', field: 'facultyId' },
  { name: 'projects', field: 'facultyId' },
  { name: 'milestones', field: 'facultyId' },
  { name: 'examinerRecommendations', field: 'facultyId' },
];

interface Report {
  collection: string;
  remapped: Array<{ id: string; from: string; to: string }>;
  flagged: Array<{ id: string; value: string }>;
  missingFixedToAll: Array<{ id: string; role?: string }>;
  missingUnresolved: Array<{ id: string; role?: string }>;
  unknown: Array<{ id: string; value: string }>;
  alreadyCanonical: number;
}

async function migrateCollection(plan: CollectionPlan): Promise<Report> {
  const report: Report = {
    collection: plan.name,
    remapped: [],
    flagged: [],
    missingFixedToAll: [],
    missingUnresolved: [],
    unknown: [],
    alreadyCanonical: 0,
  };

  const snap = await db.collection(plan.name).get();

  // Firestore batches cap at 500 writes.
  let batch = db.batch();
  let opsInBatch = 0;
  const commits: Promise<unknown>[] = [];

  const flushIfNeeded = async () => {
    if (opsInBatch >= 450) {
      commits.push(batch.commit());
      batch = db.batch();
      opsInBatch = 0;
    }
  };

  for (const doc of snap.docs) {
    const data = doc.data();
    const value = data[plan.field];
    const role = plan.name === 'users' ? data.role : undefined;

    if (value === undefined || value === null || value === '') {
      if (plan.name === 'users' && role && CROSS_FACULTY_ROLES.has(role)) {
        report.missingFixedToAll.push({ id: doc.id, role });
        if (APPLY) {
          batch.update(doc.ref, { [plan.field]: 'all' });
          opsInBatch++;
          await flushIfNeeded();
        }
      } else {
        report.missingUnresolved.push({ id: doc.id, role });
      }
      continue;
    }

    if (CANONICAL_VALUES.has(value)) {
      report.alreadyCanonical++;
      continue;
    }

    if (FLAGGED_VALUES.has(value)) {
      report.flagged.push({ id: doc.id, value });
      continue;
    }

    const mapped = FACULTY_ID_MAP[value];
    if (mapped) {
      report.remapped.push({ id: doc.id, from: value, to: mapped });
      if (APPLY) {
        batch.update(doc.ref, { [plan.field]: mapped });
        opsInBatch++;
        await flushIfNeeded();
      }
      continue;
    }

    report.unknown.push({ id: doc.id, value });
  }

  if (opsInBatch > 0) {
    commits.push(batch.commit());
  }
  await Promise.all(commits);

  return report;
}

async function main() {
  console.log(APPLY ? '🚀 APPLY mode — writing changes to Firestore' : '🔎 DRY RUN — no writes will be made (pass --apply to write)');
  console.log('');

  const reports: Report[] = [];
  for (const plan of COLLECTIONS) {
    reports.push(await migrateCollection(plan));
  }

  for (const r of reports) {
    console.log(`\n── ${r.collection} ──`);
    console.log(`  already canonical: ${r.alreadyCanonical}`);
    console.log(`  remapped:          ${r.remapped.length}`);
    r.remapped.forEach((x) => console.log(`    ${x.id}: "${x.from}" → "${x.to}"`));
    console.log(`  missing → 'all' (cross-faculty role): ${r.missingFixedToAll.length}`);
    r.missingFixedToAll.forEach((x) => console.log(`    ${x.id} (role=${x.role})`));
    console.log(`  missing, unresolved (needs manual fix): ${r.missingUnresolved.length}`);
    r.missingUnresolved.forEach((x) => console.log(`    ${x.id}${x.role ? ` (role=${x.role})` : ''}`));
    console.log(`  flagged (software/mechanical — needs a mapping decision): ${r.flagged.length}`);
    r.flagged.forEach((x) => console.log(`    ${x.id}: "${x.value}"`));
    console.log(`  unknown value (not in any known taxonomy): ${r.unknown.length}`);
    r.unknown.forEach((x) => console.log(`    ${x.id}: "${x.value}"`));
  }

  if (!APPLY) {
    console.log('\nThis was a dry run — nothing was written. Re-run with --apply once the report looks right.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
