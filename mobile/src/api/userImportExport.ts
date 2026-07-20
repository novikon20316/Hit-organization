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

export type ImportProgressStage = 'uploading' | 'processing';
export type ImportProgressCallback = (stage: ImportProgressStage, uploadPercent?: number) => void;

/**
 * Opens the native file picker for an .xlsx/.xls file and uploads it to
 * `path`. Returns null if the user cancels.
 *
 * Each row does a real Auth lookup + account creation + Firestore write +
 * an awaited SMTP email send — for a handful of rows that can genuinely
 * take well past the client's normal API timeout, so this uses a much
 * longer one instead of the default 15s (previously: a slow-but-successful
 * import would abort client-side, show a false "failed" alert, and the
 * caller would have no way to tell it actually went through on the server).
 * `onProgress` reports the upload phase (0-100%) and then a plain
 * "processing" stage while the server works through each row, since there's
 * no percentage available for that part.
 */
async function pickAndUploadExcel(path: string, onProgress?: ImportProgressCallback): Promise<ImportSummary | null> {
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
    timeout: 120000,
    onUploadProgress: (e: any) => {
      if (!onProgress) return;
      const percent = e.total ? Math.round((e.loaded / e.total) * 100) : undefined;
      onProgress(percent !== undefined && percent < 100 ? 'uploading' : 'processing', percent);
    },
  });

  return response.data.summary as ImportSummary;
}

/**
 * Opens the native file picker for an .xlsx file and uploads it to the
 * generic users-import endpoint for the given scope. Returns null if the
 * user cancels.
 */
export async function pickAndImportUsers(scope: ImportExportScope, onProgress?: ImportProgressCallback): Promise<ImportSummary | null> {
  return pickAndUploadExcel(IMPORT_PATH[scope], onProgress);
}

/**
 * Opens the native file picker for the college's HR "סגל" staff export and
 * uploads it to the staff-import endpoint for the given scope. Returns null
 * if the user cancels.
 */
export async function pickAndImportStaff(scope: ImportExportScope, onProgress?: ImportProgressCallback): Promise<ImportSummary | null> {
  return pickAndUploadExcel(STAFF_IMPORT_PATH[scope], onProgress);
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
