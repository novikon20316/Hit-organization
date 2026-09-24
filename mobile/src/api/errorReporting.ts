// src/api/errorReporting.ts
//
// Best-effort crash/timeout/network-failure reporting to system_admin — see
// server/src/services/errorReports.ts for the aggregation/alerting this
// feeds. Called from components/ErrorBoundary.tsx and apiClient.ts's own
// timeout/network/5xx handling.
//
// Deliberately a plain fetch() to the server's own base URL, NOT routed
// through apiClient's axios instance — that instance is exactly what might
// be broken when this fires (reporting a timeout FROM inside apiClient's own
// interceptor via apiClient itself would recurse), and this must never throw
// regardless of what's wrong with connectivity right now.

import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type ErrorReportKind = 'client_crash' | 'api_timeout' | 'network_failure';

// Mirrors apiClient.ts's own getBaseUrl — duplicated rather than imported,
// to keep this module import-cycle-free from apiClient.ts.
function getBaseUrl(): string {
  const configuredApiUrl = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  if (configuredApiUrl) return configuredApiUrl;
  return Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://127.0.0.1:5000';
}

const REPORT_ENDPOINT_PATH = '/api/system/report-error';

export function reportClientError(input: {
  kind: ErrorReportKind;
  message: string;
  stack?: string | null;
  route?: string | null;
}): void {
  if (input.route === REPORT_ENDPOINT_PATH) return;

  try {
    fetch(`${getBaseUrl()}${REPORT_ENDPOINT_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: input.kind,
        platform: 'mobile',
        message: input.message.slice(0, 2000),
        stack: input.stack?.slice(0, 4000) ?? null,
        route: input.route ?? null,
      }),
    }).catch(() => {});
  } catch {
    // fetch itself can throw synchronously in rare environments — swallow,
    // this reporter must never be the thing that breaks the app further.
  }
}
