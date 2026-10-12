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
import { AppState, Platform } from 'react-native';

export type ErrorReportKind = 'client_crash' | 'api_timeout' | 'network_failure';

// Mirrors apiClient.ts's own getBaseUrl — duplicated rather than imported,
// to keep this module import-cycle-free from apiClient.ts.
function getBaseUrl(): string {
  const configuredApiUrl = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  if (configuredApiUrl) return configuredApiUrl;
  return Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://127.0.0.1:5000';
}

const REPORT_ENDPOINT_PATH = '/api/system/report-error';

// ─── Device-side connectivity filter for transport failures ──────────────────
// Mirrors web/lib/errorReporting.ts. A request that never got a reply (or
// hit axios's own timeout) is very often THIS device's problem, not the
// system's: signal dropped, the OS suspended the app in the background, or
// the phone slept mid-request and every pending timer fired at once on
// resume. Those flooded System Health with one card per endpoint while the
// server was answering everyone else fine. There's no NetInfo dependency
// here, so "offline" is recognized indirectly — by the app having just come
// back to the foreground, or by several endpoints failing together.

// How long after the app returns to the foreground we keep treating
// failures as fallout from the suspension.
const RECOVERY_GRACE_MS = 10_000;
// Failures are held this long before reporting, so a connectivity loss that
// takes down several different endpoints at once can be recognized as one.
const BURST_WINDOW_MS = 3_000;
// A timeout whose wall-clock duration overshot the configured timeout by
// more than this means the timer itself was suspended, not that the server
// was slow.
const SUSPEND_SLACK_MS = 10_000;

let lastRecoveryAt = 0;
AppState.addEventListener('change', (state) => {
  if (state === 'active') lastRecoveryAt = Date.now();
});

let pendingFailures: Array<{ kind: ErrorReportKind; message: string; route: string | null }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushPendingFailures(): void {
  const batch = pendingFailures;
  pendingFailures = [];
  flushTimer = null;
  // Several DIFFERENT endpoints failing together = this device lost its
  // connection. One endpoint failing alone while the rest of the app works
  // is the endpoint-specific case worth surfacing.
  if (new Set(batch.map((f) => f.route)).size > 1) return;
  for (const f of batch) reportClientError(f);
}

/** apiClient's entry point for a request that got no response or hit its
 *  own timeout — NOT for HTTP 5xx responses (those prove the server was
 *  reached and are reported directly via reportClientError). */
export function reportTransportFailure(input: {
  kind: 'api_timeout' | 'network_failure';
  message: string;
  route: string | null;
  startedAt: number | undefined;
  timeoutMs: number;
}): void {
  const now = Date.now();
  if (AppState.currentState !== 'active') return;
  if (now - lastRecoveryAt < RECOVERY_GRACE_MS) return;
  if (input.kind === 'api_timeout' && input.startedAt !== undefined && now - input.startedAt > input.timeoutMs + SUSPEND_SLACK_MS) return;

  pendingFailures.push({ kind: input.kind, message: input.message, route: input.route });
  if (!flushTimer) flushTimer = setTimeout(flushPendingFailures, BURST_WINDOW_MS);
}

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
