// src/services/studentRoster.ts
//
// A pre-registration allowlist: system_admin / coordinators upload a roster
// of {studentId, facultyId, degreeType} tuples — the institution's official
// enrolled-students list — BEFORE students self-register. Signup then checks
// the entered ID + chosen degree against this roster (see
// userController.ts's verifyStudentEligibility / syncData) so nobody can
// register as a student "just because" — only IDs the faculty has actually
// vouched for can complete registration.
//
// Re-uploading the same roster is idempotent (deterministic doc ID per
// studentId+facultyId+degreeType, upserted) — a coordinator can re-upload an
// updated list without creating duplicates. An entry that's already been
// used to register an account is never overwritten by a later re-upload.

import * as XLSX from 'xlsx';
import { db } from '../config/firebase.js';
import { VALID_FACULTIES } from './userImportExport.js';

export type RosterDegreeType = 'bachelors' | 'masters';

function normalizeDegreeType(raw: string | undefined): RosterDegreeType | null {
  const v = (raw || '').trim().toLowerCase();
  if (['bachelors', 'bachelor', 'bsc', 'תואר ראשון', 'ראשון'].includes(v)) return 'bachelors';
  if (['masters', 'master', 'msc', 'תואר שני', 'שני'].includes(v)) return 'masters';
  return null;
}

function normalizeStudentId(raw: string | undefined): string {
  return (raw || '').replace(/\D/g, '').trim();
}

/** Deterministic doc ID so re-uploading the same roster upserts instead of duplicating. */
function rosterDocId(studentId: string, facultyId: string, degreeType: RosterDegreeType): string {
  return `${facultyId}_${degreeType}_${studentId}`;
}

export interface RosterImportRowResult {
  row: number;
  studentId: string;
  status: 'imported' | 'skipped' | 'failed';
  reason?: string;
}

export interface RosterImportSummary {
  totalRows: number;
  imported: number;
  skipped: number;
  failed: number;
  details: RosterImportRowResult[];
}

// Expected columns: StudentId | FullName | DegreeType | Major | FacultyId
// FacultyId may be omitted when restrictFacultyId is set (coordinator upload).
export async function importApprovedStudentsFromBuffer(
  buffer: Buffer,
  opts: { restrictFacultyId?: string; uploadedBy: string },
): Promise<RosterImportSummary> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const rows: Record<string, any>[] = sheetName
    ? XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]!, { defval: '' })
    : [];

  const details: RosterImportRowResult[] = [];
  let batch = db.batch();
  let batchCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2; // header occupies row 1
    const raw: Record<string, string> = {};
    for (const [key, value] of Object.entries(rows[i] ?? {})) {
      raw[key.toString().trim().toLowerCase()] = value == null ? '' : String(value).trim();
    }

    const studentId = normalizeStudentId(raw.studentid);

    try {
      if (!/^\d{9}$/.test(studentId)) {
        details.push({ row: rowNumber, studentId, status: 'failed', reason: 'StudentId must be exactly 9 digits' });
        continue;
      }

      const degreeType = normalizeDegreeType(raw.degreetype);
      if (!degreeType) {
        details.push({ row: rowNumber, studentId, status: 'failed', reason: `Invalid DegreeType: "${raw.degreetype}"` });
        continue;
      }

      const facultyId = (raw.facultyid || opts.restrictFacultyId || '').toLowerCase();
      if (!facultyId || !VALID_FACULTIES.includes(facultyId)) {
        details.push({ row: rowNumber, studentId, status: 'failed', reason: `Invalid FacultyId: "${raw.facultyid}"` });
        continue;
      }
      if (opts.restrictFacultyId && facultyId !== opts.restrictFacultyId) {
        details.push({
          row: rowNumber, studentId, status: 'skipped',
          reason: `Row belongs to faculty "${facultyId}", not your faculty "${opts.restrictFacultyId}"`,
        });
        continue;
      }

      const docId = rosterDocId(studentId, facultyId, degreeType);
      const docRef = db.collection('approvedStudents').doc(docId);
      const existing = await docRef.get();
      if (existing.exists && existing.data()?.used) {
        details.push({ row: rowNumber, studentId, status: 'skipped', reason: 'Already used by a registered account — not overwritten' });
        continue;
      }

      batch.set(docRef, {
        studentId,
        facultyId,
        degreeType,
        major: (raw.major || '').toLowerCase() || null,
        fullName: raw.fullname || '',
        used: false,
        usedByUid: null,
        usedAt: null,
        uploadedBy: opts.uploadedBy,
        uploadedAt: new Date().toISOString(),
      }, { merge: true });
      batchCount++;
      details.push({ row: rowNumber, studentId, status: 'imported' });

      // Firestore batches cap at 500 writes.
      if (batchCount >= 450) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    } catch (error: any) {
      details.push({ row: rowNumber, studentId, status: 'failed', reason: error.message || 'Unknown error' });
    }
  }

  if (batchCount > 0) await batch.commit();

  return {
    totalRows: rows.length,
    imported: details.filter((d) => d.status === 'imported').length,
    skipped: details.filter((d) => d.status === 'skipped').length,
    failed: details.filter((d) => d.status === 'failed').length,
    details,
  };
}

export interface RosterEntry {
  id: string;
  studentId: string;
  facultyId: string;
  degreeType: RosterDegreeType;
  major: string | null;
  fullName: string;
  used: boolean;
  usedByUid: string | null;
  usedAt: string | null;
  uploadedBy: string;
  uploadedAt: string;
}

// Firestore serves multiple equality (==) filters off the automatic
// single-field indexes — no composite index needed as long as nothing here
// adds a range/orderBy clause alongside them.
export async function listApprovedStudents(filter: {
  facultyId?: string;
  degreeType?: RosterDegreeType;
  used?: boolean;
} = {}): Promise<RosterEntry[]> {
  let query: FirebaseFirestore.Query = db.collection('approvedStudents');
  if (filter.facultyId) query = query.where('facultyId', '==', filter.facultyId);
  if (filter.degreeType) query = query.where('degreeType', '==', filter.degreeType);
  if (filter.used !== undefined) query = query.where('used', '==', filter.used);
  const snap = await query.get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RosterEntry, 'id'>) }));
}

export interface RosterEntryUpdate {
  fullName?: string;
  major?: string | null;
  /** Setting this back to false re-opens the ID for a fresh registration —
   *  e.g. after an admin deletes a mistakenly-created account, since
   *  markRosterEntryUsed's lock would otherwise never be lifted. */
  used?: boolean;
  facultyId?: string;
  degreeType?: RosterDegreeType;
  studentId?: string;
}

/**
 * studentId + facultyId + degreeType together form the roster doc's ID
 * (see rosterDocId), so changing any of them means moving the entry to a
 * new doc rather than updating the existing one in place.
 */
export async function updateApprovedStudentEntry(docId: string, updates: RosterEntryUpdate): Promise<void> {
  const ref = db.collection('approvedStudents').doc(docId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Roster entry not found.');
  const current = snap.data() as Omit<RosterEntry, 'id'>;

  const nextStudentId = updates.studentId !== undefined ? normalizeStudentId(updates.studentId) : current.studentId;
  const nextFacultyId = updates.facultyId !== undefined ? updates.facultyId.toLowerCase() : current.facultyId;
  const nextDegreeType = updates.degreeType !== undefined ? updates.degreeType : current.degreeType;
  const idChanged = nextStudentId !== current.studentId || nextFacultyId !== current.facultyId || nextDegreeType !== current.degreeType;

  const patch: Record<string, unknown> = {};
  if (updates.fullName !== undefined) patch.fullName = updates.fullName;
  if (updates.major !== undefined) patch.major = updates.major ? updates.major.toLowerCase() : null;
  if (updates.used !== undefined) {
    patch.used = updates.used;
    if (!updates.used) {
      patch.usedByUid = null;
      patch.usedAt = null;
    }
  }

  if (!idChanged) {
    if (Object.keys(patch).length) await ref.update(patch);
    return;
  }

  if (!/^\d{9}$/.test(nextStudentId)) throw new Error('Student ID must be exactly 9 digits.');
  if (!VALID_FACULTIES.includes(nextFacultyId)) throw new Error(`Invalid faculty: "${nextFacultyId}"`);
  const newDocId = rosterDocId(nextStudentId, nextFacultyId, nextDegreeType);
  const newRef = db.collection('approvedStudents').doc(newDocId);
  const existing = await newRef.get();
  if (existing.exists) throw new Error('Another roster entry already exists with this student ID, faculty, and degree.');

  await db.runTransaction(async (tx) => {
    tx.set(newRef, { ...current, ...patch, studentId: nextStudentId, facultyId: nextFacultyId, degreeType: nextDegreeType });
    tx.delete(ref);
  });
}

export async function deleteApprovedStudentEntry(docId: string): Promise<void> {
  await db.collection('approvedStudents').doc(docId).delete();
}

export interface EligibilityCheckResult {
  eligible: boolean;
  reason?: string;
}

/**
 * Checked twice: once by the public verify-eligibility endpoint (fail-fast,
 * before the Firebase Auth account is even created) and again, authoritatively,
 * by syncData right before the Firestore profile is written.
 */
export async function checkStudentEligibility(
  studentId: string,
  facultyId: string,
  degreeType: string,
  major?: string | null,
): Promise<EligibilityCheckResult> {
  const normalizedId = normalizeStudentId(studentId);
  const normalizedDegree = normalizeDegreeType(degreeType);
  if (!/^\d{9}$/.test(normalizedId)) return { eligible: false, reason: 'Invalid ID number.' };
  if (!normalizedDegree) return { eligible: false, reason: 'Invalid degree type.' };
  if (!facultyId) return { eligible: false, reason: 'Missing faculty.' };

  const docId = rosterDocId(normalizedId, facultyId, normalizedDegree);
  const snap = await db.collection('approvedStudents').doc(docId).get();
  if (!snap.exists) {
    return {
      eligible: false,
      reason: 'We could not find your ID on the approved students list for this faculty and degree. Contact your faculty coordinator.',
    };
  }
  const data = snap.data()!;
  if (data.used) {
    return { eligible: false, reason: 'This ID has already been used to register an account.' };
  }
  if (data.major && major && data.major !== major.toLowerCase()) {
    return { eligible: false, reason: 'Your program does not match the approved students list. Contact your faculty coordinator.' };
  }
  return { eligible: true };
}

/** Locks the roster entry so the same ID can't be reused by a second registration. */
export async function markRosterEntryUsed(
  studentId: string,
  facultyId: string,
  degreeType: string,
  uid: string,
): Promise<void> {
  const normalizedId = normalizeStudentId(studentId);
  const normalizedDegree = normalizeDegreeType(degreeType);
  if (!normalizedDegree || !facultyId) return;
  const docId = rosterDocId(normalizedId, facultyId, normalizedDegree);
  await db.collection('approvedStudents').doc(docId).update({
    used: true,
    usedByUid: uid,
    usedAt: new Date().toISOString(),
  });
}
