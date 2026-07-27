// src/services/userImportExport.ts
//
// Shared logic for the System Admin / Coordinator "Import & Export via Excel"
// feature.
//
// IMPORT IS STAFF-ONLY. Students always self-register in the app (see
// mobile/app/(auth)/signup.tsx) — no import path is allowed to create a
// student account. Export is unrestricted (it reports on whatever users
// already exist, students included).
//
// importStaffFromBuffer (see its own section further down) imports the
// real HR "סגל" export column layout.

import * as XLSX from 'xlsx';
import crypto from 'crypto';
import { db, auth } from '../config/firebase.js';
import { sendNotificationEmail } from './emailService.js';
import { APP_LINK_URL_IOS, APP_LINK_URL_ANDROID } from '../config/links.js';

// ── Canonical enums (mirror mobile/firebase/roles.ts — keep in sync) ──────────
export const VALID_ROLES = [
  'student',
  'supervisor',
  'secondary_supervisor',
  'coordinator',
  'faculty_admin',
  'program_head',
  'administrative_secretary',
  'grad_school_head',
  'internal_examiner',
  'system_admin',
];

export const VALID_FACULTIES = [
  'sciences',
  'electrical',
  'industrial',
  'learning_tech',
  'medical_tech',
  'design',
  'data_science',
  'all',
];

export function generateTempPassword(): string {
  const rand = crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
  return `${rand.slice(0, 10)}Aa1!`;
}

/**
 * One-way hash of a temporary password, stored on the user doc as
 * `tempPasswordHash` purely so userController.ts's changePassword can reject
 * "your new password is the same as the temp one you were just issued"
 * without ever storing the temp password itself in plaintext. Not a
 * substitute for Firebase Auth's own password storage — this exists only
 * for that one comparison, so a fast SHA-256 (same convention as
 * loginSecurity.ts's OTP hashing) is a reasonable, sufficient choice here.
 */
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/** Creates the Firebase Auth account + Firestore user doc, and emails the temp password. Shared by every import flow. */
async function createImportedUserAccount(params: {
  email: string;
  displayNameHe: string;
  displayNameEn: string;
  role: string;
  roles: string[];
  facultyId: string;
  degreeType: string | null;
  major: string | null;
  yearOfStudy: number | null;
  studentId: string | null;
  isEligibleForProcess: boolean;
  lang: 'he' | 'en';
  phoneNumber?: string | null;
  extra?: Record<string, any>;
}): Promise<void> {
  const tempPassword = generateTempPassword();
  const authUser = await auth.createUser({
    email: params.email,
    password: tempPassword,
    displayName: params.displayNameHe,
    // Staff accounts are provisioned directly by a trusted system_admin
    // (from an HR export or staff roster with already-confirmed emails),
    // not self-registered — login.tsx's emailVerified gate exists for
    // self-signup students, not these. Without this, every imported
    // account would be locked out on first login with "please verify your
    // email," with no verification email ever having been sent to trigger.
    emailVerified: true,
  });

  await db.collection('users').doc(authUser.uid).set({
    uid: authUser.uid,
    email: params.email,
    displayName:   params.displayNameHe,
    displayNameHe: params.displayNameHe,
    displayNameEn: params.displayNameEn,
    role: params.role,
    roles: params.roles,
    facultyId: params.facultyId,
    additionalRoles: [],
    phoneNumber: params.phoneNumber ?? null,
    degreeType: params.degreeType,
    yearOfStudy: params.yearOfStudy,
    major: params.major,
    studentId: params.studentId,
    isActive: true,
    profileComplete: true,
    hasActiveProject: false,
    language: params.lang,
    expoPushToken: null,
    totp_enabled: false,
    totp_last_verified: null,
    isEligibleForProcess: params.isEligibleForProcess,
    createdViaImport: true,
    mustChangePassword: true, // enforced in-app on first login — see /api/users/change-password
    tempPasswordHash: hashPassword(tempPassword),
    createdAt: new Date().toISOString(),
    ...(params.extra ?? {}),
  });

  try {
    await sendNotificationEmail({
      toEmail: params.email,
      type: 'account_created',
      lang: params.lang,
      data: {
        name: params.displayNameHe,
        email: params.email,
        tempPassword,
        appLinkIos:     APP_LINK_URL_IOS,
        appLinkAndroid: APP_LINK_URL_ANDROID,
      },
    });
  } catch (emailError) {
    console.error(`Welcome email failed for ${params.email}:`, emailError);
  }
}

// ── Placeholder column template (one row per user) ─────────────────────────────
export const IMPORT_TEMPLATE_HEADERS = [
  'Email',
  'FullNameHe',
  'FullNameEn',
  'Role',
  'FacultyId',
  'DegreeType',
  'Major',
  'YearOfStudy',
  'StudentId',
];

// MEDIUM FIX: an .xlsx is a zip — a file well under the 10MB upload cap
// (uploadExcelFileMiddleware) can decompress to a much larger in-memory
// row count during XLSX.read, spiking memory in this single-process server
// for every concurrent request. sheetRows caps how many rows SheetJS
// materializes per sheet, so parsing stops early instead of building an
// unbounded in-memory structure. 5000 comfortably covers this system's
// real scale (a university department's roster/staff list, not millions
// of rows) — real imports here are in the hundreds at most.
export const MAX_IMPORT_ROWS = 5000;

export function parseWorkbookRows(buffer: Buffer): Record<string, any>[] {
  const workbook  = XLSX.read(buffer, { type: 'buffer', sheetRows: MAX_IMPORT_ROWS + 1 });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

export interface ImportRowResult {
  row: number;
  email: string;
  status: 'created' | 'skipped' | 'failed';
  reason?: string;
}

export interface ImportSummary {
  totalRows: number;
  created: number;
  skipped: number;
  failed: number;
  details: ImportRowResult[];
}

/** Builds an .xlsx buffer from Firestore user docs, using the same column layout as import. */
export function buildUsersExportBuffer(users: any[]): Buffer {
  const rows = users.map((u) => ({
    Email:       u.email ?? '',
    FullNameHe:  u.displayNameHe ?? u.displayName ?? '',
    FullNameEn:  u.displayNameEn ?? '',
    Role:        u.role ?? '',
    FacultyId:   u.facultyId ?? '',
    DegreeType:  u.degreeType ?? '',
    Major:       u.major ?? '',
    YearOfStudy: u.yearOfStudy ?? '',
    StudentId:   u.studentId ?? '',
    IsActive:    u.isActive ? 'TRUE' : 'FALSE',
  }));

  const headers  = [...IMPORT_TEMPLATE_HEADERS, 'IsActive'];
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  worksheet['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Users');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAFF ("סגל") IMPORT — real HR export column layout, not the placeholder above.
//
// Source columns (Hebrew, as exported by the college's HR system):
//   שם משפחה | שם פרטי | תואר איש סגל | שם תואר מורה | מס.זהות | מס.עובד |
//   תאריך התחלת עבודה | טלפון | טלפון נייד | כתובת | דוא"ל | דוא"ל נוסף |
//   ישוב | סוג | שם באנגלית | יחידת אם | סטטוס | דרגה | תיאור דרגה |
//   תיאור קבוצת שיוך | סה"כ שעות למעסיק 1 | סוג השכלה / תעסוקה |
//   תואר אקדמי | תואר | תיאור סוג איש סגל | סמסטר
//
// The same staff member repeats once per (semester × degree) row — only the
// first row per מס.זהות (ID number) is imported; later rows for the same
// person are skipped as duplicates. Every imported row becomes a
// 'supervisor' + 'internal_examiner' account; any further roles (coordinator,
// faculty_admin, etc.) are granted manually afterwards by system_admin.
// ─────────────────────────────────────────────────────────────────────────────

// Free-text home-unit name (יחידת אם) → FacultyId. Only units we're certain
// about are listed — anything else fails the row rather than guessing.
const STAFF_UNIT_TO_FACULTY: Record<string, string> = {
  'הנדסת חשמל ואלקטרוניקה': 'electrical',
};

/** 9-digit placeholder ID for rows the HR export left blank — real Israeli ID numbers are 9 digits. */
function generatePlaceholderIdNumber(taken: Set<string>): string {
  let candidate: string;
  do {
    candidate = String(Math.floor(100000000 + Math.random() * 900000000));
  } while (taken.has(candidate));
  return candidate;
}

function resolveStaffFaculty(rawUnit: string): { facultyId: string | null; inactive: boolean; cleanUnit: string } {
  const trimmed  = (rawUnit || '').trim();
  const inactive = trimmed.startsWith('לא פעיל');
  const cleanUnit = trimmed.replace(/^לא פעיל\s*-\s*/, '').trim();
  const facultyId = STAFF_UNIT_TO_FACULTY[cleanUnit] ?? null;
  return { facultyId, inactive, cleanUnit };
}

/**
 * Imports staff ("סגל") from an uploaded HR-export Excel buffer.
 * When `restrictFacultyId` is set (coordinator import), rows for other
 * faculties are skipped — not failed — and reported individually.
 */
export async function importStaffFromBuffer(
  buffer: Buffer,
  opts: { restrictFacultyId?: string; lang?: 'he' | 'en' } = {}
): Promise<ImportSummary> {
  const rows    = parseWorkbookRows(buffer);
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`File has more than ${MAX_IMPORT_ROWS} rows — split it into smaller files and import separately.`);
  }
  const details: ImportRowResult[] = [];
  const lang    = opts.lang ?? 'he';
  const seenIds = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2; // header occupies row 1
    const raw      = rows[i] ?? {};
    const rawId    = String(raw['מס.זהות'] ?? '').trim();
    const email    = String(raw['דוא"ל'] ?? '').trim().toLowerCase();

    try {
      // Real HR exports always carry this — but a hand-built test file
      // (or a genuinely incomplete HR record) might not. Rather than fail
      // the row, mint a placeholder 9-digit ID so import can proceed; it's
      // only ever used as a dedup key and stored on the profile, never
      // validated as a real ID elsewhere.
      const idNumber = rawId || generatePlaceholderIdNumber(seenIds);

      if (seenIds.has(idNumber)) {
        details.push({ row: rowNumber, email, status: 'skipped', reason: 'Duplicate row for this staff member in file' });
        continue;
      }
      seenIds.add(idNumber);

      if (!email || !email.includes('@')) {
        details.push({ row: rowNumber, email, status: 'failed', reason: 'Missing or invalid email (דוא"ל)' });
        continue;
      }

      const rawUnit = String(raw['יחידת אם'] ?? '').trim();
      const { facultyId, inactive, cleanUnit } = resolveStaffFaculty(rawUnit);

      if (inactive) {
        details.push({ row: rowNumber, email, status: 'skipped', reason: `Staff member inactive at "${cleanUnit}"` });
        continue;
      }
      if (!facultyId) {
        details.push({ row: rowNumber, email, status: 'failed', reason: `Unrecognized home unit "${rawUnit}" — add a mapping in STAFF_UNIT_TO_FACULTY` });
        continue;
      }

      if (opts.restrictFacultyId && facultyId !== opts.restrictFacultyId) {
        details.push({
          row: rowNumber,
          email,
          status: 'skipped',
          reason: `Row belongs to faculty "${facultyId}", not your faculty "${opts.restrictFacultyId}"`,
        });
        continue;
      }

      const existingAuthUser = await auth.getUserByEmail(email).catch(() => null);
      if (existingAuthUser) {
        details.push({ row: rowNumber, email, status: 'skipped', reason: 'A user with this email already exists' });
        continue;
      }

      const lastName       = String(raw['שם משפחה'] ?? '').trim();
      const firstName      = String(raw['שם פרטי'] ?? '').trim();
      const emailLocalPart = email.split('@')[0] ?? email;
      const displayNameHe  = `${firstName} ${lastName}`.trim() || emailLocalPart;
      const displayNameEn  = String(raw['שם באנגלית'] ?? '').trim() || displayNameHe;
      // Mobile preferred (more likely to reach them for in-app message
      // notifications) — falls back to the landline/other phone column.
      const phoneNumber    = String(raw['טלפון נייד'] ?? '').trim() || String(raw['טלפון'] ?? '').trim() || null;

      await createImportedUserAccount({
        email, displayNameHe, displayNameEn, phoneNumber,
        role: 'supervisor', roles: ['supervisor', 'internal_examiner'], facultyId,
        degreeType: null, major: null, yearOfStudy: null, studentId: null,
        isEligibleForProcess: false, lang,
        extra: { staffIdNumber: idNumber },
      });

      details.push({ row: rowNumber, email, status: 'created' });
    } catch (error: any) {
      console.error(`Staff import row ${rowNumber} failed:`, error);
      details.push({ row: rowNumber, email, status: 'failed', reason: error.message || 'Unknown error' });
    }
  }

  return {
    totalRows: rows.length,
    created:   details.filter((d) => d.status === 'created').length,
    skipped:   details.filter((d) => d.status === 'skipped').length,
    failed:    details.filter((d) => d.status === 'failed').length,
    details,
  };
}
