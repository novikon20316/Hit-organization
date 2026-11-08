// src/api/connectivity.ts
//
// "Can this device reach the server right now?" — drives the offline banner
// (components/OfflineBanner.tsx) and lets apiClient.ts hold a safe retry
// until the connection is back. JS-only on purpose (no native NetInfo
// module), so it ships in an over-the-air update: apiClient.ts reports every
// request's outcome here, and while offline a cheap probe of the public
// GET /api/app-version runs every few seconds until it answers.

import { AppState } from 'react-native';

type Listener = (offline: boolean) => void;

const PROBE_INTERVAL_MS = 5_000;
const PROBE_TIMEOUT_MS = 4_000;

let offline = false;
let baseUrl = '';
let probeTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<Listener>();
let waiters: Array<() => void> = [];

export function configureConnectivity(serverUrl: string): void {
  baseUrl = serverUrl;
}

export function isOffline(): boolean {
  return offline;
}

export function subscribeConnectivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function setOffline(next: boolean) {
  if (offline === next) return;
  offline = next;
  listeners.forEach((l) => l(next));
  if (next) {
    if (!probeTimer) probeTimer = setInterval(() => { void probe(); }, PROBE_INTERVAL_MS);
  } else {
    if (probeTimer) { clearInterval(probeTimer); probeTimer = null; }
    const ready = waiters;
    waiters = [];
    ready.forEach((resolve) => resolve());
  }
}

/** Any HTTP answer at all means the server is reachable. */
export function markOnline(): void {
  setOffline(false);
}

/** A request got no answer: confirm with a probe before showing the banner,
 *  so one slow request doesn't flash it. Resolves true if reachable. */
export function checkConnection(): Promise<boolean> {
  return probe();
}

async function probe(): Promise<boolean> {
  if (!baseUrl) return !offline;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(`${baseUrl}/api/app-version`, { method: 'GET', signal: controller.signal });
    setOffline(false);
    return true;
  } catch {
    setOffline(true);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolves once the server is reachable again, or after `maxWaitMs`. */
export function waitForConnection(maxWaitMs: number): Promise<void> {
  if (!offline) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiters = waiters.filter((w) => w !== done);
      resolve();
    }, maxWaitMs);
    const done = () => { clearTimeout(timer); resolve(); };
    waiters.push(done);
  });
}

// Coming back to the app is the most common moment the network changed.
AppState.addEventListener('change', (state) => {
  if (state === 'active' && offline) void probe();
});
