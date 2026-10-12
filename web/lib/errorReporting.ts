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
  return process.env.NEXT_PUBLIC_API_URL || 'https://hit-organization.web.app';
}

// Skip reporting failures ABOUT this endpoint itself — otherwise a total
// outage (this fetch also fails) would try to report that failure, which
// would also fail, forever.
const REPORT_ENDPOINT_PATH = '/api/system/report-error';

// ─── Client-side connectivity filter for transport failures ──────────────────
// A fetch() that rejects ("Failed to fetch") or hits our own timeout is very
// often THIS browser's problem, not the system's: Wi-Fi dropped, the laptop
// slept (every paused timer fires at once on wake, so in-flight requests all
// "time out" together), or a background tab was throttled. Those flooded the
// System Health widget with one card per endpoint the page happened to be
// polling while the server itself was answering everyone else fine. The
// filters below drop the cases we can recognize as local; whatever survives
// is a failure the system_admin can actually do something about.

// How long after the tab becomes visible again / the browser comes back
// online we keep treating failures as fallout from that transition.
const RECOVERY_GRACE_MS = 10_000;
// Failures are held this long before reporting, so a connectivity loss that
// takes down several different endpoints at once can be recognized as one.
const BURST_WINDOW_MS = 3_000;
// A timeout whose wall-clock duration overshot the configured timeout by
// more than this means the timer itself was suspended (sleep), not that the
// server was slow.
const SUSPEND_SLACK_MS = 10_000;

let lastRecoveryAt = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { lastRecoveryAt = Date.now(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') lastRecoveryAt = Date.now();
  });
}

let pendingFailures: Array<{ kind: ErrorReportKind; message: string; route: string }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushPendingFailures(): void {
  const batch = pendingFailures;
  pendingFailures = [];
  flushTimer = null;
  // Several DIFFERENT endpoints failing together = this client lost its
  // connection. One endpoint failing alone while the rest of the page works
  // is the endpoint-specific case worth surfacing.
  if (new Set(batch.map((f) => f.route)).size > 1) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  for (const f of batch) reportClientError(f);
}

/** apiClient's entry point for a fetch() rejection or its own timeout —
 *  NOT for HTTP 5xx responses (those prove the server was reached and are
 *  reported directly via reportClientError). */
export function reportTransportFailure(input: {
  kind: 'api_timeout' | 'network_failure';
  message: string;
  route: string;
  startedAt: number;
  timeoutMs: number;
}): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (navigator.onLine === false) return;
  if (document.visibilityState === 'hidden') return;
  if (now - lastRecoveryAt < RECOVERY_GRACE_MS) return;
  if (input.kind === 'api_timeout' && now - input.startedAt > input.timeoutMs + SUSPEND_SLACK_MS) return;

  pendingFailures.push({ kind: input.kind, message: input.message, route: input.route });
  if (!flushTimer) flushTimer = setTimeout(flushPendingFailures, BURST_WINDOW_MS);
}

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
