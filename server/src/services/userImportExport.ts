// src/services/userImportExport.ts
//
// Shared logic for the System Admin / Coordinator "Import & Export via Excel"
// feature.
//
// IMPORT IS STAFF-ONLY. Students always self-register in the app (see
// mobile/app/(auth)/signup.tsx) — no import path is allowed to create a
// student account; importUsersFromBuffer explicitly rejects any row whose
// Role column is "student". Export is unrestricted (it reports on whatever
// users already exist, students included).
//
// Two import flows share the account-creation core below:
//   - importUsersFromBuffer: generic staff roster. Column layout is a
//     placeholder — swap IMPORT_TEMPLATE_HEADERS and the row mapping once
//     the final spreadsheet design is provided.
//   - importStaffFromBuffer: real HR "סגל" export column layout (see its
//     own section further down).

import * as XLSX from 'xlsx';
import crypto from 'crypto';
import { db, auth } from '../config/firebase.js';
import { sendNotificationEmail } from './emailService.js';

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
  extra?: Record<string, any>;
}): Promise<void> {
  const tempPassword = generateTempPassword();
  const authUser = await auth.createUser({
    email: params.email,
    password: tempPassword,
    displayName: params.displayNameHe,
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
        // TODO: set once the app is published on each store
        appLinkIos:     process.env.APP_LINK_URL_IOS     || '',
        appLinkAndroid: process.env.APP_LINK_URL_ANDROID || '',
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

export function parseWorkbookRows(buffer: Buffer): Record<string, any>[] {
  const workbook  = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

function normalizeRow(raw: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    out[key.toString().trim().toLowerCase()] = value == null ? '' : String(value).trim();
  }
  return out;
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

/**
 * Imports staff from an uploaded Excel buffer. Any row with Role "student"
 * fails with a clear reason — students always self-register in the app,
 * never via import.
 * When `restrictFacultyId` is set (coordinator import), rows for other faculties
 * are skipped — not failed — and reported individually.
 */
// Faculty-scoped coordinators may only mint faculty-level operational staff
// through bulk import — never another coordinator/admin/cross-faculty role.
// Without this, a coordinator's Excel import was the same class of
// privilege-escalation bug already fixed for updateUserRoleAdmin/
// updateUserPermissions, just reachable via a spreadsheet cell instead of a
// direct API call.
export const COORDINATOR_IMPORTABLE_ROLES = ['supervisor', 'secondary_supervisor', 'internal_examiner'];

export async function importUsersFromBuffer(
  buffer: Buffer,
  opts: { restrictFacultyId?: string; restrictAssignableRoles?: string[]; lang?: 'he' | 'en' } = {}
): Promise<ImportSummary> {
  const rows    = parseWorkbookRows(buffer);
  const details: ImportRowResult[] = [];
  const lang    = opts.lang ?? 'he';

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2; // header occupies row 1
    const raw   = normalizeRow(rows[i] ?? {});
    const email = (raw.email || '').toLowerCase();

    try {
      if (!email || !email.includes('@')) {
        details.push({ row: rowNumber, email, status: 'failed', reason: 'Missing or invalid email' });
        continue;
      }

      const role = (raw.role || '').toLowerCase();
      if (!VALID_ROLES.includes(role)) {
        details.push({ row: rowNumber, email, status: 'failed', reason: `Invalid role: "${raw.role}"` });
        continue;
      }
      // Students self-register in the app (see mobile/app/(auth)/signup.tsx) —
      // this import (and the staff/"סגל" import) is for crew members only.
      if (role === 'student') {
        details.push({
          row: rowNumber, email, status: 'failed',
          reason: 'Students register themselves in the app — they cannot be imported via file',
        });
        continue;
      }
      if (opts.restrictAssignableRoles && !opts.restrictAssignableRoles.includes(role)) {
        details.push({
          row: rowNumber, email, status: 'failed',
          reason: `Role "${role}" is not assignable via this import — allowed: ${opts.restrictAssignableRoles.join(', ')}`,
        });
        continue;
      }

      // Blank facultyId cell: assume the importing coordinator's own faculty
      // when this import is faculty-restricted; otherwise it must be explicit.
      const facultyId = (raw.facultyid || opts.restrictFacultyId || '').toLowerCase();
      if (!facultyId || !VALID_FACULTIES.includes(facultyId)) {
        details.push({ row: rowNumber, email, status: 'failed', reason: `Invalid facultyId: "${raw.facultyid}"` });
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

      const emailLocalPart = email.split('@')[0] ?? email;
      const displayNameHe  = raw.fullnamehe || raw.fullnameen || emailLocalPart;
      const displayNameEn  = raw.fullnameen || raw.fullnamehe || emailLocalPart;

      // Every importable role here is staff — no degree/major/year/studentId fields apply.
      await createImportedUserAccount({
        email, displayNameHe, displayNameEn,
        role, roles: [role], facultyId,
        degreeType: null, major: null, yearOfStudy: null, studentId: null,
        isEligibleForProcess: false, lang,
      });

      details.push({ row: rowNumber, email, status: 'created' });
    } catch (error: any) {
      console.error(`Import row ${rowNumber} failed:`, error);
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
  const details: ImportRowResult[] = [];
  const lang    = opts.lang ?? 'he';
  const seenIds = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2; // header occupies row 1
    const raw      = rows[i] ?? {};
    const idNumber = String(raw['מס.זהות'] ?? '').trim();
    const email    = String(raw['דוא"ל'] ?? '').trim().toLowerCase();

    try {
      if (!idNumber) {
        details.push({ row: rowNumber, email, status: 'failed', reason: 'Missing ID number (מס.זהות)' });
        continue;
      }

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

      await createImportedUserAccount({
        email, displayNameHe, displayNameEn,
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
