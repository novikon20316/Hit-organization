// src/api/studentRoster.ts
//
// Pre-registration student roster: system_admin / coordinators upload a list
// of {studentId, facultyId, degreeType} the institution has vouched for
// (see server/src/services/studentRoster.ts), and signup.tsx checks the
// entered ID + chosen degree against it before a student account can be
// created — see verifyStudentEligibility below.

import * as DocumentPicker from 'expo-document-picker';
import { apiClient } from './apiClient';
import type { ImportExportScope } from './userImportExport';

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

const ROSTER_IMPORT_PATH: Record<ImportExportScope, string> = {
  admin:       '/api/admin/student-roster/import',
  coordinator: '/api/coordinator/student-roster/import',
};

const EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

/**
 * Opens the native file picker for an .xlsx/.xls file and uploads it to the
 * student-roster import endpoint for the given scope. Returns null if the
 * user cancels.
 */
export async function pickAndImportStudentRoster(scope: ImportExportScope): Promise<RosterImportSummary | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: EXCEL_MIME_TYPES,
    copyToCacheDirectory: true,
  });

  if (picked.canceled || !picked.assets?.length) return null;
  const file = picked.assets[0];
  if (!file) return null;

  const formData = new FormData();
  formData.append('file', {
    uri:  file.uri,
    name: file.name || 'roster.xlsx',
    type: file.mimeType || EXCEL_MIME_TYPES[0],
  } as any);

  const response = await apiClient.post(ROSTER_IMPORT_PATH[scope], formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return response.data.summary as RosterImportSummary;
}

export interface RosterEntry {
  id: string;
  studentId: string;
  facultyId: string;
  degreeType: 'bachelors' | 'masters';
  major: string | null;
  fullName: string;
  used: boolean;
  usedByUid: string | null;
  usedAt: string | null;
  uploadedBy: string;
  uploadedAt: string;
}

/** GET /api/admin/student-roster — system_admin only. Lets an admin actually
 *  see the pre-registration allowlist coordinators/admin upload, instead of
 *  it only ever being written to and read internally at signup time. */
export async function listStudentRoster(filter?: {
  facultyId?: string;
  degreeType?: 'bachelors' | 'masters';
  used?: boolean;
  q?: string;
}): Promise<RosterEntry[]> {
  const response = await apiClient.get('/api/admin/student-roster', { params: filter });
  return response.data.entries as RosterEntry[];
}

/** PATCH /api/admin/student-roster/:docId — edit a roster entry, or set
 *  `used: false` to re-open an ID for registration (e.g. after deleting a
 *  mistakenly-created account). */
export async function updateStudentRosterEntry(
  docId: string,
  updates: Partial<{ fullName: string; major: string | null; used: boolean; facultyId: string; degreeType: 'bachelors' | 'masters'; studentId: string }>
): Promise<void> {
  await apiClient.patch(`/api/admin/student-roster/${encodeURIComponent(docId)}`, updates);
}

export async function deleteStudentRosterEntry(docId: string): Promise<void> {
  await apiClient.delete(`/api/admin/student-roster/${encodeURIComponent(docId)}`);
}

export interface EligibilityCheckResult {
  eligible: boolean;
  message?: string;
}

/**
 * PUBLIC endpoint — called before any Firebase Auth account exists (see
 * signup.tsx). Fail-fast UX check only; the server re-checks authoritatively
 * before the account is actually created.
 */
export async function verifyStudentEligibility(params: {
  studentId: string;
  facultyId: string;
  degreeType: string;
  major?: string | null;
}): Promise<EligibilityCheckResult> {
  const response = await apiClient.post('/api/users/verify-eligibility', params);
  return response.data as EligibilityCheckResult;
}
