// app/reports/downloadExport.ts
// Ported from mobile/src/api/reports.ts's exportReport — same endpoint,
// same auth header, but triggers a browser file download instead of the
// native share sheet.

import { auth } from '@/lib/firebase';
import { getApiBaseUrl } from '@/lib/apiClient';

export async function downloadReportExport(reportType: string, filters: Record<string, string | number | boolean | undefined>): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Not signed in.');
  const token = await currentUser.getIdToken();

  const url = new URL(`${getApiBaseUrl()}/api/reports/${reportType}/export`);
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Export failed — HTTP ${res.status}`);

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `${reportType}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
