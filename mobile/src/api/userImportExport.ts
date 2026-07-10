// src/api/userImportExport.ts
//
// System Admin: import/export the full user roster.
// Coordinator: import/export scoped to their own faculty only.
// Excel column layout is a placeholder until the final template is provided —
// see server/src/services/userImportExport.ts for the source of truth.

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { apiClient, getApiBaseUrl } from './apiClient';
import { auth } from '../firebase/firebase';

export type ImportExportScope = 'admin' | 'coordinator';

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

const IMPORT_PATH: Record<ImportExportScope, string> = {
  admin:       '/api/admin/users/import',
  coordinator: '/api/coordinator/users/import',
};

const STAFF_IMPORT_PATH: Record<ImportExportScope, string> = {
  admin:       '/api/admin/staff/import',
  coordinator: '/api/coordinator/staff/import',
};

const EXPORT_PATH: Record<ImportExportScope, string> = {
  admin:       '/api/admin/users/export',
  coordinator: '/api/coordinator/users/export',
};

const EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

/** Opens the native file picker for an .xlsx/.xls file and uploads it to `path`. Returns null if the user cancels. */
async function pickAndUploadExcel(path: string): Promise<ImportSummary | null> {
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
    name: file.name || 'import.xlsx',
    type: file.mimeType || EXCEL_MIME_TYPES[0],
  } as any);

  const response = await apiClient.post(path, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return response.data.summary as ImportSummary;
}

/**
 * Opens the native file picker for an .xlsx file and uploads it to the
 * generic users-import endpoint for the given scope. Returns null if the
 * user cancels.
 */
export async function pickAndImportUsers(scope: ImportExportScope): Promise<ImportSummary | null> {
  return pickAndUploadExcel(IMPORT_PATH[scope]);
}

/**
 * Opens the native file picker for the college's HR "סגל" staff export and
 * uploads it to the staff-import endpoint for the given scope. Returns null
 * if the user cancels.
 */
export async function pickAndImportStaff(scope: ImportExportScope): Promise<ImportSummary | null> {
  return pickAndUploadExcel(STAFF_IMPORT_PATH[scope]);
}

/** Downloads the users export as .xlsx and opens the native share/save sheet. */
export async function exportUsers(scope: ImportExportScope): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Not signed in.');
  const token = await currentUser.getIdToken();

  const destUri = `${FileSystem.cacheDirectory}users_export_${scope}.xlsx`;
  const result = await FileSystem.downloadAsync(
    `${getApiBaseUrl()}${EXPORT_PATH[scope]}`,
    destUri,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (result.status !== 200) {
    throw new Error(`Export failed — HTTP ${result.status}`);
  }

  await Sharing.shareAsync(result.uri, {
    mimeType:    EXCEL_MIME_TYPES[0],
    dialogTitle: 'Users Export',
  });
}
