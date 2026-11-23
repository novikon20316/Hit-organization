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
import { VALID_FACULTIES, MAX_IMPORT_ROWS } from './userImportExport.js';
import { nameMatchesRoster } from './studentNameMatch.js';
import { deriveProcessType, getActiveMilestonesFor } from './workflowTemplates.js';

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

/** A student already part-way through their project/thesis when the roster
 *  was uploaded — set from the optional InProgress columns. At first signup
 *  (services/importedStudentPlacement.ts) the system creates this project,
 *  enrolls the student with the given start date, and closes the first
 *  `completedMilestones` milestones as done (grade still to be entered by
 *  staff), so the student continues from where they actually are. */
export interface RosterInProgress {
  projectType: 'project' | 'thesis';
  titleHe: string;
  titleEn: string;
  supervisorId: string;
  supervisorEmail: string;
  secondarySupervisorId: string | null;
  secondarySupervisorEmail: string | null;
  /** ISO date-time (noon UTC of the given day). */
  startDate: string;
  completedMilestones: number;
  /** How many milestones the program's workflow template had at upload time
   *  — informational; placement re-resolves the template at signup. */
  milestoneCountAtImport: number;
}

const YES = new Set(['yes', 'y', 'true', '1', 'כן']);
const NO = new Set(['no', 'n', 'false', '0', 'לא', '']);

/** YES/NO cell → boolean, null when unrecognized. Blank counts as NO. */
function parseYesNo(raw: string | undefined): boolean | null {
  const v = (raw || '').trim().toLowerCase();
  if (YES.has(v)) return true;
  if (NO.has(v)) return false;
  return null;
}

function normalizeProjectType(raw: string | undefined): 'project' | 'thesis' | null {
  const v = (raw || '').trim().toLowerCase();
  if (['project', 'final project', 'פרויקט', 'פרוייקט', 'פרויקט גמר'].includes(v)) return 'project';
  if (['thesis', 'תזה', 'תיזה'].includes(v)) return 'thesis';
  return null;
}

/** A start-date cell: a real Excel date (cellDates → Date), or text as
 *  dd/mm/yyyy, dd.mm.yyyy or yyyy-mm-dd. Returned as noon UTC that day so
 *  no timezone shift can move it to the neighbouring day. */
function parseStartDate(value: unknown): Date | null {
  let y: number, m: number, d: number;
  if (value instanceof Date && !isNaN(value.getTime())) {
    y = value.getFullYear(); m = value.getMonth() + 1; d = value.getDate();
  } else {
    const text = String(value ?? '').trim();
    let match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (match) { d = Number(match[1]); m = Number(match[2]); y = Number(match[3]); }
    else if ((match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = Number(match[1]); m = Number(match[2]); d = Number(match[3]); }
    else return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

async function findSupervisorByEmail(email: string): Promise<{ uid: string } | { error: string }> {
  const trimmed = email.trim();
  const lower = trimmed.toLowerCase();
  let snap = await db.collection('users').where('email', '==', lower).limit(1).get();
  if (snap.empty && lower !== trimmed) snap = await db.collection('users').where('email', '==', trimmed).limit(1).get();
  if (snap.empty) return { error: `no user with email "${trimmed}"` };
  const doc = snap.docs[0]!;
  const u = doc.data();
  const roles: string[] = [u.role, ...(Array.isArray(u.roles) ? u.roles : [])].filter(Boolean);
  if (!roles.includes('supervisor') && !roles.includes('secondary_supervisor')) {
    return { error: `"${trimmed}" is not a supervisor in the system` };
  }
  if (u.isActive === false) return { error: `"${trimmed}" is a disabled account` };
  return { uid: doc.id };
}

/** Reads the optional "already in the middle of the project" columns of one
 *  roster row. Returns inProgress:null when InProgress is not YES (every
 *  other in-progress column is then ignored). */
async function parseInProgressColumns(
  raw: Record<string, string>,
  original: Record<string, unknown>,
  ctx: { facultyId: string; degreeType: RosterDegreeType; major: string | null; milestoneCountCache: Map<string, number> },
): Promise<{ inProgress: RosterInProgress | null } | { error: string }> {
  const flag = parseYesNo(raw.inprogress);
  if (flag === null) return { error: `InProgress must be YES or NO (got "${raw.inprogress}")` };
  if (!flag) return { inProgress: null };

  let projectType = normalizeProjectType(raw.projecttype);
  if (ctx.degreeType === 'bachelors') {
    if (projectType === 'thesis') return { error: 'ProjectType "thesis" is not possible for a bachelors degree' };
    projectType = 'project';
  } else if (!projectType) {
    return { error: 'ProjectType is required for an in-progress masters student: project or thesis' };
  }

  const titleHe = (raw.projecttitlehe || '').trim();
  if (!titleHe) return { error: 'ProjectTitleHe is required for an in-progress student' };
  const titleEn = (raw.projecttitleen || '').trim() || titleHe;

  if (!raw.supervisoremail) return { error: 'SupervisorEmail is required for an in-progress student' };
  const sup = await findSupervisorByEmail(raw.supervisoremail);
  if ('error' in sup) return { error: `SupervisorEmail: ${sup.error}` };
  let secondarySupervisorId: string | null = null;
  if (raw.secondarysupervisoremail) {
    const sec = await findSupervisorByEmail(raw.secondarysupervisoremail);
    if ('error' in sec) return { error: `SecondarySupervisorEmail: ${sec.error}` };
    if (sec.uid === sup.uid) return { error: 'SecondarySupervisorEmail is the same person as SupervisorEmail' };
    secondarySupervisorId = sec.uid;
  }

  // The untouched cell value — a real Excel date arrives as a Date object,
  // which the string-normalized `raw` copy would have flattened.
  const startKey = Object.keys(original).find((k) => k.trim().toLowerCase() === 'startdate');
  const startDate = parseStartDate(startKey !== undefined ? original[startKey] : raw.startdate);
  if (!startDate) return { error: `StartDate is missing or not a valid date (got "${raw.startdate ?? ''}") — use dd/mm/yyyy` };
  if (startDate.getTime() > Date.now() + 24 * 60 * 60 * 1000) return { error: 'StartDate is in the future' };

  // How many milestones this student's program has — the same template the
  // enrollment will use (approved for faculty+track+major, else the faculty
  // template, else the 4-milestone default).
  const processType = deriveProcessType(ctx.degreeType, projectType);
  const cacheKey = `${ctx.facultyId}|${ctx.major ?? ''}|${processType}`;
  let milestoneCount = ctx.milestoneCountCache.get(cacheKey);
  if (milestoneCount === undefined) {
    milestoneCount = (await getActiveMilestonesFor(ctx.facultyId, processType, ctx.major)).milestones.length;
    ctx.milestoneCountCache.set(cacheKey, milestoneCount);
  }

  // Milestone1..MilestoneN — YES = already done. Done milestones must be a
  // continuous run from the first one: the workflow is sequential.
  const flags: boolean[] = [];
  for (const key of Object.keys(raw)) {
    const match = key.match(/^milestone\s*(\d+)$/);
    if (!match) continue;
    const idx = Number(match[1]);
    const v = parseYesNo(raw[key]);
    if (v === null) return { error: `Milestone${idx} must be YES or NO (got "${raw[key]}")` };
    if (idx >= 1) flags[idx - 1] = v;
  }
  let completedMilestones = 0;
  while (flags[completedMilestones]) completedMilestones++;
  const lastYes = flags.lastIndexOf(true);
  if (lastYes >= completedMilestones) {
    return { error: `Milestone${lastYes + 1} is YES but Milestone${completedMilestones + 1} is not — done milestones must be continuous from Milestone1` };
  }
  if (completedMilestones > milestoneCount) {
    return { error: `${completedMilestones} milestones marked done, but this program has only ${milestoneCount}` };
  }

  return {
    inProgress: {
      projectType,
      titleHe,
      titleEn,
      supervisorId: sup.uid,
      supervisorEmail: raw.supervisoremail.trim().toLowerCase(),
      secondarySupervisorId,
      secondarySupervisorEmail: raw.secondarysupervisoremail ? raw.secondarysupervisoremail.trim().toLowerCase() : null,
      startDate: startDate.toISOString(),
      completedMilestones,
      milestoneCountAtImport: milestoneCount,
    },
  };
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
// Optional, for students already part-way through: InProgress (YES/NO) and,
// when YES, ProjectType | ProjectTitleHe | ProjectTitleEn | SupervisorEmail |
// SecondarySupervisorEmail | StartDate | Milestone1..MilestoneN (see
// parseInProgressColumns / RosterInProgress).
export async function importApprovedStudentsFromBuffer(
  buffer: Buffer,
  opts: { restrictFacultyId?: string; uploadedBy: string },
): Promise<RosterImportSummary> {
  // Caps in-memory row materialization — see userImportExport.ts's
  // MAX_IMPORT_ROWS comment for why (decompression-bomb protection).
  // cellDates: a StartDate typed as a real Excel date arrives as a Date.
  const workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: MAX_IMPORT_ROWS + 1, cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const rows: Record<string, any>[] = sheetName
    ? XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]!, { defval: '' })
    : [];
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`File has more than ${MAX_IMPORT_ROWS} rows — split it into smaller files and import separately.`);
  }

  const details: RosterImportRowResult[] = [];
  const milestoneCountCache = new Map<string, number>();
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

      // Mandatory: signup matches the student's typed name against it
      // (services/studentNameMatch.ts) — without one, knowing the ID number
      // alone would be enough to register as that student.
      if (!raw.fullname) {
        details.push({ row: rowNumber, studentId, status: 'failed', reason: 'FullName is required' });
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

      const progress = await parseInProgressColumns(raw, rows[i] ?? {}, {
        facultyId, degreeType, major: (raw.major || '').toLowerCase() || null, milestoneCountCache,
      });
      if ('error' in progress) {
        details.push({ row: rowNumber, studentId, status: 'failed', reason: progress.error });
        continue;
      }

      batch.set(docRef, {
        studentId,
        facultyId,
        degreeType,
        major: (raw.major || '').toLowerCase() || null,
        fullName: raw.fullname,
        // null clears an earlier upload's in-progress data for this student.
        inProgress: progress.inProgress,
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
  inProgress?: RosterInProgress | null;
}

/** The roster entry a just-registered student claimed (see syncData). */
export async function getRosterEntry(studentId: string, facultyId: string, degreeType: string): Promise<RosterEntry | null> {
  const normalizedDegree = normalizeDegreeType(degreeType);
  if (!normalizedDegree || !facultyId) return null;
  const docId = rosterDocId(normalizeStudentId(studentId), facultyId, normalizedDegree);
  const snap = await db.collection('approvedStudents').doc(docId).get();
  return snap.exists ? ({ id: snap.id, ...(snap.data() as Omit<RosterEntry, 'id'>) }) : null;
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
  if (updates.fullName !== undefined) {
    const fullName = updates.fullName.trim();
    if (!fullName) throw new Error('Full name is required.');
    patch.fullName = fullName;
  }
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

export interface RosterEntryCreate {
  studentId: string;
  facultyId: string;
  degreeType: RosterDegreeType;
  fullName: string;
  major?: string | null;
}

/** Manual single-entry counterpart to importApprovedStudentsFromBuffer — same
 *  validation and upsert-by-rosterDocId semantics, for adding one approved
 *  student without building an Excel file. */
export async function createApprovedStudentEntry(data: RosterEntryCreate, uploadedBy: string): Promise<RosterEntry> {
  const studentId = normalizeStudentId(data.studentId);
  if (!/^\d{9}$/.test(studentId)) throw new Error('Student ID must be exactly 9 digits.');

  const facultyId = (data.facultyId || '').toLowerCase();
  if (!VALID_FACULTIES.includes(facultyId)) throw new Error(`Invalid faculty: "${data.facultyId}"`);

  if (data.degreeType !== 'bachelors' && data.degreeType !== 'masters') {
    throw new Error('Invalid degree type.');
  }

  const fullName = (data.fullName || '').trim();
  if (!fullName) throw new Error('Full name is required.');

  const docId = rosterDocId(studentId, facultyId, data.degreeType);
  const ref = db.collection('approvedStudents').doc(docId);
  const existing = await ref.get();
  if (existing.exists && existing.data()?.used) {
    throw new Error('This student ID is already registered under this faculty and degree.');
  }

  const entry: Omit<RosterEntry, 'id'> = {
    studentId,
    facultyId,
    degreeType: data.degreeType,
    major: data.major ? data.major.toLowerCase() : null,
    fullName,
    used: false,
    usedByUid: null,
    usedAt: null,
    uploadedBy,
    uploadedAt: new Date().toISOString(),
  };
  await ref.set(entry, { merge: true });
  return { id: docId, ...entry };
}

export interface EligibilityCheckResult {
  eligible: boolean;
  reason?: string;
  /** Set when the ID is on the roster but the typed name doesn't match it. */
  nameMismatch?: boolean;
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
  // syncData passes its transaction so the check and markRosterEntryUsed
  // are atomic — two concurrent signups with the same ID can't both pass.
  tx?: FirebaseFirestore.Transaction,
  // The names the student typed at signup. Only syncData passes these —
  // never the public verify-eligibility pre-check, so that endpoint can't be
  // used as an oracle for guessing a stranger's name from their ID number.
  typedNames?: Array<string | null | undefined>,
): Promise<EligibilityCheckResult> {
  const normalizedId = normalizeStudentId(studentId);
  const normalizedDegree = normalizeDegreeType(degreeType);
  if (!/^\d{9}$/.test(normalizedId)) return { eligible: false, reason: 'Invalid ID number.' };
  if (!normalizedDegree) return { eligible: false, reason: 'Invalid degree type.' };
  if (!facultyId) return { eligible: false, reason: 'Missing faculty.' };

  const docId = rosterDocId(normalizedId, facultyId, normalizedDegree);
  const ref = db.collection('approvedStudents').doc(docId);
  const snap = tx ? await tx.get(ref) : await ref.get();
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
  // Knowing someone's ID number alone must not be enough to register as
  // them — see services/studentNameMatch.ts for how tolerant this is. A
  // roster entry with no name can't be matched, so it's refused rather than
  // let through (the name is mandatory on every upload path now; this covers
  // any older entry).
  const rosterName = typeof data.fullName === 'string' ? data.fullName.trim() : '';
  if (typedNames && !rosterName) {
    return { eligible: false, reason: 'Your entry on the approved students list has no name. Ask your faculty coordinator to add it, then sign up again.' };
  }
  if (typedNames && !nameMatchesRoster(rosterName, typedNames)) {
    return { eligible: false, nameMismatch: true, reason: 'The name you entered does not match the approved students list for this ID number. Check it, or contact your faculty coordinator.' };
  }
  return { eligible: true };
}

/** Locks the roster entry so the same ID can't be reused by a second
 *  registration. Transaction-only — always paired with the
 *  checkStudentEligibility read in the same transaction (see syncData). */
export function markRosterEntryUsed(
  studentId: string,
  facultyId: string,
  degreeType: string,
  uid: string,
  tx: FirebaseFirestore.Transaction,
): void {
  const normalizedId = normalizeStudentId(studentId);
  const normalizedDegree = normalizeDegreeType(degreeType);
  if (!normalizedDegree || !facultyId) return;
  const docId = rosterDocId(normalizedId, facultyId, normalizedDegree);
  tx.update(db.collection('approvedStudents').doc(docId), {
    used: true,
    usedByUid: uid,
    usedAt: new Date().toISOString(),
  });
}
