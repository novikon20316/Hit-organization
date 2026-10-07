// src/services/projectRecordNumber.ts
//
// Assigns each project a permanent, human-readable record number
// (FACULTYCODE-000123) the first time it's created — never reassigned,
// never reused even if the project is later archived/erased. Numbering is
// per-faculty: each faculty has its own running counter starting at 1, kept
// in counters/projectRecord_{facultyId} and incremented inside the same
// Firestore transaction that reads it, which is the only way Firestore
// supports an atomic "give me the next number" with no native auto-increment.
//
// See controllers/adminController.ts's createAdminProject and
// controllers/supervisorController.ts's createSupervisorProject for the two
// call sites, and scripts/backfillProjectRecordNumbers.ts for assigning one
// to every project that predates this feature.

import { db } from '../config/firebase.js';

// Short, stable prefix per faculty — mirrors config/majors.ts's
// MAJORS_BY_FACULTY key set. A facultyId with no explicit code (should never
// happen for the 7 real faculties) falls back to its own uppercased slug
// rather than throwing, so this never blocks project creation.
const FACULTY_CODES: Record<string, string> = {
  sciences: 'SCI',
  electrical: 'ELEC',
  industrial: 'IND',
  learning_tech: 'LRNT',
  medical_tech: 'MEDT',
  design: 'DES',
  data_science: 'DS',
};

export function facultyRecordCode(facultyId: string): string {
  return FACULTY_CODES[facultyId] ?? (facultyId.slice(0, 4).toUpperCase() || 'GEN');
}

function formatRecordNumber(facultyId: string, n: number): string {
  return `${facultyRecordCode(facultyId)}-${String(n).padStart(6, '0')}`;
}

/** Atomically takes the next number for this faculty and formats it — call
 *  exactly once per project, at creation time, and persist the result on
 *  the project doc's own `recordNumber` field (never recompute it later). */
export async function assignProjectRecordNumber(facultyId: string): Promise<string> {
  const counterRef = db.collection('counters').doc(`projectRecord_${facultyId}`);
  const next = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const current: number = snap.exists ? (snap.data()!.value ?? 0) : 0;
    const value = current + 1;
    tx.set(counterRef, { value }, { merge: true });
    return value;
  });
  return formatRecordNumber(facultyId, next);
}
