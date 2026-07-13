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
