// lib/errorReporting.ts
//
// Best-effort crash/timeout/network-failure reporting to system_admin — see
// server/src/services/errorReports.ts for the aggregation/alerting this
// feeds. Called from app/error.tsx, app/global-error.tsx, and apiClient.ts's
// own timeout/network/5xx handling.
//
// Deliberately NOT routed through apiClient.request() — that function is
// exactly what might be broken when this fires (a network failure calling
// this from inside apiClient's own catch would recurse), and this must never
// throw regardless of what's wrong with connectivity right now. Also avoids
// an import cycle, since apiClient.ts itself calls into this file.

export type ErrorReportKind = 'client_crash' | 'api_timeout' | 'network_failure';

// Same default as apiClient.ts's getBaseUrl — duplicated rather than
// imported, to keep this module import-cycle-free from apiClient.ts.
function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || 'https://hit-organization.onrender.com';
}

// Skip reporting failures ABOUT this endpoint itself — otherwise a total
// outage (this fetch also fails) would try to report that failure, which
// would also fail, forever.
const REPORT_ENDPOINT_PATH = '/api/system/report-error';

export function reportClientError(input: {
  kind: ErrorReportKind;
  message: string;
  stack?: string | null;
  route?: string | null;
}): void {
  if (typeof window === 'undefined') return; // SSR — nothing to report yet
  if (input.route === REPORT_ENDPOINT_PATH) return;

  try {
    fetch(`${getBaseUrl()}${REPORT_ENDPOINT_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: input.kind,
        platform: 'web',
        message: input.message.slice(0, 2000),
        stack: input.stack?.slice(0, 4000) ?? null,
        route: input.route ?? window.location.pathname,
      }),
      // Best-effort only — never let this hold up page unload/navigation.
      keepalive: true,
    }).catch(() => {});
  } catch {
    // fetch itself can throw synchronously in rare environments — swallow,
    // this reporter must never be the thing that breaks the page further.
  }
}
