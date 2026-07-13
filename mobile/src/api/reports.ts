// src/api/reports.ts
//
// The reports suite (see server/src/services/reports.ts). One JSON fetch
// helper + one Excel-export helper, both parameterized by report type and
// filters so Reports.tsx doesn't need one function per report.

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { apiClient, getApiBaseUrl } from './apiClient';
import { auth } from '../firebase/firebase';

export type ReportType =
  | 'full-status' | 'no-advisor' | 'proposal-delay' | 'examiner-tracking'
  | 'missing-closure' | 'stuck-students' | 'statute-exceedance' | 'load' | 'repository';

export interface ReportFilters {
  facultyId?: string;
  startYear?: number;
  degreeType?: string;
  projectType?: string;
  processStatus?: string;
  advisorId?: string;
  examinerId?: string;
  milestoneType?: string;
  overdueOnly?: boolean;
}

function buildQuery(filters: ReportFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function fetchReport(reportType: ReportType, filters: ReportFilters = {}): Promise<any> {
  const res = await apiClient.get(`/api/reports/${reportType}${buildQuery(filters)}`);
  return res.data.data;
}

/** Downloads the report as .xlsx and opens the native share/save sheet. */
export async function exportReport(reportType: ReportType, filters: ReportFilters = {}): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Not signed in.');
  const token = await currentUser.getIdToken();

  const destUri = `${FileSystem.cacheDirectory}${reportType}.xlsx`;
  const result = await FileSystem.downloadAsync(
    `${getApiBaseUrl()}/api/reports/${reportType}/export${buildQuery(filters)}`,
    destUri,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (result.status !== 200) {
    throw new Error(`Export failed — HTTP ${result.status}`);
  }

  await Sharing.shareAsync(result.uri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: `${reportType} report`,
  });
}
