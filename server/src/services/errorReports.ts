// src/services/errorReports.ts
//
// system_admin alerting for client-side crashes/timeouts/network failures —
// see mobile/components/ErrorBoundary.tsx, web/app/error.tsx + global-error.tsx,
// and both platforms' apiClient.ts (timeout/network/5xx handling). Reports land
// here via POST /api/system/report-error (routes/systemErrorRoutes.ts),
// unauthenticated by necessity (a crash can happen before login).
//
// Aggregation: one Firestore doc per (kind, platform, normalized message,
// route) fingerprint — a doc ID, not a query, so no composite index is
// needed. Repeat occurrences within RENOTIFY_WINDOW_MS just bump `count` and
// `lastOccurredAt` on the SAME doc without re-alerting; a burst of the same
// bug hitting 50 users collapses into one admin notification instead of 50.
// A fingerprint that's gone quiet for longer than the window (or that an
// admin already marked resolved) re-alerts on its next occurrence, so a
// recurring-but-intermittent bug doesn't go silent after the first ping.
//
// Burst confirmation for network_failure/api_timeout: these two kinds are
// inherently flaky (one dropped connection, one deploy-window restart) and
// a LONE occurrence proves nothing — alerting on it is a false alarm, not a
// real failure. So for these kinds, the first occurrence is recorded (and
// still visible in the System Health widget) but not emailed; only a SECOND
// occurrence landing within BURST_CONFIRM_WINDOW_MS of the first confirms
// it's recurring rather than a one-off blip, and that's what triggers the
// actual admin notification (see `notifiedAt`). client_crash is exempt —
// a JS exception is already a real bug on its first occurrence.

import crypto from 'crypto';
import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { notifyUser } from './notify.js';
import { resolveRouteHandler, parseStackFrames } from './codeLocator.js';
import { pathKeyFor, incidentDocId } from './serverIncidents.js';

const FieldValue = admin.firestore.FieldValue;

export type ErrorReportKind = 'client_crash' | 'api_timeout' | 'network_failure';
export type ErrorReportPlatform = 'web' | 'mobile';

const VALID_KINDS: ErrorReportKind[] = ['client_crash', 'api_timeout', 'network_failure'];
const VALID_PLATFORMS: ErrorReportPlatform[] = ['web', 'mobile'];

export function isValidErrorReportKind(v: unknown): v is ErrorReportKind {
  return typeof v === 'string' && (VALID_KINDS as string[]).includes(v);
}
export function isValidErrorReportPlatform(v: unknown): v is ErrorReportPlatform {
  return typeof v === 'string' && (VALID_PLATFORMS as string[]).includes(v);
}

// A resurfacing error re-alerts admins after this much silence, even if
// never explicitly resolved — keeps a rare-but-recurring bug from going
// permanently quiet after its first notification.
const RENOTIFY_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// A second occurrence within this window of the first confirms a
// network_failure/api_timeout fingerprint is recurring, not a one-off blip.
const BURST_CONFIRM_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

const DEBOUNCED_KINDS: ErrorReportKind[] = ['network_failure', 'api_timeout'];

const KIND_LABEL: Record<ErrorReportKind, { he: string; en: string }> = {
  client_crash:    { he: 'קריסת לקוח', en: 'Client crash' },
  api_timeout:     { he: 'תפוגת זמן בבקשה', en: 'API timeout' },
  network_failure: { he: 'כשל רשת / קבלת נתונים', en: 'Network / data-receiving failure' },
};

/** Optional per-occurrence diagnostics the client attaches (all fields are
 *  best-effort — older app builds send none of them). Shown in the System
 *  Health detail window so a system_admin can tell "one user's flaky Wi-Fi"
 *  from "this endpoint is broken for everyone". */
export interface ErrorReportContext {
  /** Screen the user was on (vs `route`, which for API failures is the endpoint). */
  page?: string | null;
  method?: string | null;
  httpStatus?: number | null;
  durationMs?: number | null;
  timeoutMs?: number | null;
  appVersion?: string | null;
  os?: string | null;
  userAgent?: string | null;
}

export interface ClientErrorInput {
  kind: ErrorReportKind;
  platform: ErrorReportPlatform;
  message: string;
  stack?: string | null;
  route?: string | null;
  userId?: string | null;
  userRole?: string | null;
  context?: ErrorReportContext | null;
}

// Last N occurrences kept on the aggregate doc, newest first — enough to see
// a pattern (same user? same page? right after a deploy?) without letting
// the doc grow unbounded.
const MAX_RECENT_OCCURRENCES = 15;
// Distinct signed-in users who hit this fingerprint (capped).
const MAX_AFFECTED_USERS = 50;

function buildOccurrence(input: ClientErrorInput): Record<string, unknown> {
  const c = input.context ?? {};
  return {
    at: admin.firestore.Timestamp.now(),
    userId: input.userId ?? null,
    page: c.page ?? null,
    method: c.method ?? null,
    httpStatus: c.httpStatus ?? null,
    durationMs: c.durationMs ?? null,
    timeoutMs: c.timeoutMs ?? null,
    appVersion: c.appVersion ?? null,
    os: c.os ?? null,
    userAgent: c.userAgent ?? null,
    // Which api revision was live when this was reported — lines failures
    // up against deploys without digging through Cloud Build history.
    serverRevision: process.env.K_REVISION ?? null,
  };
}

// Strips obviously-variable substrings (ids, numbers, timestamps) before
// hashing, so two occurrences of "the same bug" with a different user id or
// milestone id embedded in the message still collapse into one fingerprint
// instead of spawning a fresh doc (and a fresh alert) per victim.
function normalizeMessage(message: string): string {
  return message
    .replace(/[0-9a-fA-F]{8,}/g, '#')   // hex ids / long numeric ids
    .replace(/\d+/g, '#')
    .trim()
    .slice(0, 300);
}

function fingerprintFor(input: Pick<ClientErrorInput, 'kind' | 'platform' | 'message' | 'route'>): string {
  const key = [input.kind, input.platform, normalizeMessage(input.message), input.route ?? ''].join('|');
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 24);
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Records one client-reported error, aggregating it into the fingerprint's
 * existing open doc when there is one and it's still within the re-notify
 * window — otherwise creates/reopens the doc and alerts every system_admin.
 * Never throws — a failure here must never cascade into a second error on
 * top of whatever the client was already reporting; the caller logs and
 * still responds 200 regardless of the outcome.
 */
export async function recordClientError(input: ClientErrorInput): Promise<void> {
  const fingerprint = fingerprintFor(input);
  const ref = db.collection('errorReports').doc(fingerprint);

  const debounced = DEBOUNCED_KINDS.includes(input.kind);

  const { shouldNotify, count } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const nowMs = Date.now();
    const occurrence = buildOccurrence(input);

    if (!snap.exists) {
      tx.set(ref, {
        fingerprint,
        kind: input.kind,
        platform: input.platform,
        message: input.message,
        stack: input.stack ?? null,
        route: input.route ?? null,
        status: 'open',
        count: 1,
        firstOccurredAt: FieldValue.serverTimestamp(),
        lastOccurredAt: FieldValue.serverTimestamp(),
        // null = "seen but not yet confirmed as a real, recurring failure"
        // for a debounced kind; non-debounced kinds are confirmed on sight.
        notifiedAt: debounced ? null : FieldValue.serverTimestamp(),
        sampleUserId: input.userId ?? null,
        sampleUserRole: input.userRole ?? null,
        resolvedAt: null,
        resolvedBy: null,
        // firstOccurredAt is reset by the burst-confirm logic below; this
        // one never moves, so the detail window can say "first seen ever".
        createdAt: FieldValue.serverTimestamp(),
        recentOccurrences: [occurrence],
        affectedUserIds: input.userId ? [input.userId] : [],
        reopenCount: 0,
      });
      return { shouldNotify: !debounced, count: 1 };
    }

    const data = snap.data() as FirebaseFirestore.DocumentData;
    const lastMs: number = (data.lastOccurredAt as admin.firestore.Timestamp | undefined)?.toMillis?.() ?? 0;
    const firstMs: number = (data.firstOccurredAt as admin.firestore.Timestamp | undefined)?.toMillis?.() ?? nowMs;
    const neverConfirmed = debounced && !data.notifiedAt;
    const wasResolved = data.status === 'resolved';
    const wentQuiet = nowMs - lastMs > RENOTIFY_WINDOW_MS;
    const nextCount = (typeof data.count === 'number' ? data.count : 0) + 1;

    const updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
      count: nextCount,
      lastOccurredAt: FieldValue.serverTimestamp(),
      status: 'open',
      message: input.message,
      stack: input.stack ?? null,
      route: input.route ?? null,
      sampleUserId: input.userId ?? null,
      sampleUserRole: input.userRole ?? null,
      recentOccurrences: [occurrence, ...(Array.isArray(data.recentOccurrences) ? data.recentOccurrences : [])].slice(0, MAX_RECENT_OCCURRENCES),
      // Came back after a system_admin marked it fixed — the previous fix
      // didn't hold. Keeps the last resolution (who/when/note) visible as
      // lastResolved* rather than wiping it with the reopen.
      ...(wasResolved
        ? {
            resolvedAt: null,
            resolvedBy: null,
            reopenCount: FieldValue.increment(1),
            lastResolvedAt: data.resolvedAt ?? null,
            lastResolvedBy: data.resolvedBy ?? null,
            lastResolutionNote: data.resolutionNote ?? null,
            resolutionNote: null,
          }
        : {}),
    };
    if (input.userId) {
      const existing: string[] = Array.isArray(data.affectedUserIds) ? data.affectedUserIds : [];
      if (!existing.includes(input.userId) && existing.length < MAX_AFFECTED_USERS) {
        updates.affectedUserIds = [...existing, input.userId];
      }
    }

    let shouldNotify: boolean;
    if (neverConfirmed) {
      const withinBurst = nowMs - firstMs <= BURST_CONFIRM_WINDOW_MS;
      if (withinBurst) {
        // Second hit while the first is still fresh — confirmed recurring.
        updates.notifiedAt = FieldValue.serverTimestamp();
        shouldNotify = true;
      } else {
        // The lone first occurrence is stale — this looks like a fresh,
        // isolated blip rather than a continuation. Restart the burst
        // window instead of alerting on an unconfirmed single event.
        updates.firstOccurredAt = FieldValue.serverTimestamp();
        shouldNotify = false;
      }
    } else {
      shouldNotify = wasResolved || wentQuiet;
    }

    tx.update(ref, updates);
    return { shouldNotify, count: nextCount };
  });

  if (shouldNotify) {
    await notifySystemAdminsOfError({ ...input, count }).catch((err) => {
      console.error('recordClientError: failed to notify system_admins:', err);
    });
  }
}

async function notifySystemAdminsOfError(
  input: ClientErrorInput & { count: number }
): Promise<void> {
  const [byRole, byRolesArray] = await Promise.all([
    db.collection('users').where('role', '==', 'system_admin').get(),
    db.collection('users').where('roles', 'array-contains', 'system_admin').get(),
  ]);
  const adminIds = new Set<string>();
  byRole.docs.forEach((d) => adminIds.add(d.id));
  byRolesArray.docs.forEach((d) => adminIds.add(d.id));
  if (adminIds.size === 0) return;

  const kindLabel = KIND_LABEL[input.kind];
  const platformLabel = input.platform === 'web' ? 'Web' : 'Mobile';
  const nowStr = formatDateTime(Date.now());
  const messageTrimmed = input.message.length > 200 ? `${input.message.slice(0, 200)}…` : input.message;

  const bodyHe =
    `${platformLabel} • ${kindLabel.he}\n${messageTrimmed}` +
    (input.route ? `\nמסך: ${input.route}` : '') +
    (input.count > 1 ? `\nמספר הופעות: ${input.count}` : '');
  const bodyEn =
    `${platformLabel} • ${kindLabel.en}\n${messageTrimmed}` +
    (input.route ? `\nScreen: ${input.route}` : '') +
    (input.count > 1 ? `\nOccurrences: ${input.count}` : '');

  await Promise.all(
    Array.from(adminIds).map((recipientId) =>
      notifyUser({
        recipientId,
        type: 'system_error_admin_alert',
        titleHe: `⚠️ תקלת מערכת (${platformLabel})`,
        titleEn: `⚠️ System error (${platformLabel})`,
        bodyHe,
        bodyEn,
        taskKind: 'system_error',
        channels: { inApp: true, email: true, push: true, sms: false, whatsapp: false },
        emailData: {
          kindLabel: kindLabel.en,
          platformLabel,
          message: messageTrimmed,
          route: input.route ?? '',
          count: String(input.count),
          lastSeen: nowStr,
        },
      }).catch((err) => console.error(`notifySystemAdminsOfError: failed for ${recipientId}:`, err))
    )
  );
}

/** system_admin dismissing a resolved error from the "System Health" widget
 *  — re-opens (and re-alerts) on its own if the same fingerprint recurs
 *  after RENOTIFY_WINDOW_MS or immediately, per recordClientError above. */
export async function resolveErrorReport(
  id: string,
  resolvedBy: string,
  note?: string | null
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  const ref = db.collection('errorReports').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: 'not_found' };
  await ref.update({
    status: 'resolved',
    resolvedAt: FieldValue.serverTimestamp(),
    resolvedBy,
    // What was done about it — shown again if the same fingerprint reopens,
    // so the next look starts from "last time we tried X".
    resolutionNote: note ?? null,
  });
  return { ok: true };
}

// ─── Detail view ────────────────────────────────────────────────────────────

function tsMs(v: unknown): number | null {
  const t = v as { toMillis?: () => number } | null | undefined;
  return t?.toMillis ? t.toMillis() : null;
}

// Cloud Logging deep links scoped to the api service and a window around
// the occurrences — the server-side half of every timeout/5xx/failed-fetch
// lives there (request latency, status, container restarts, console.error).
function buildLogLinks(route: string | null, fromMs: number, toMs: number) {
  const project = process.env.GOOGLE_CLOUD_PROJECT || admin.app().options.projectId || 'hit-organization';
  const service = process.env.K_SERVICE || 'api';
  const start = new Date(fromMs - 5 * 60 * 1000).toISOString();
  const end = new Date(toMs + 5 * 60 * 1000).toISOString();
  const base = `resource.type="cloud_run_revision"\nresource.labels.service_name="${service}"`;
  const apiPath = route && route.startsWith('/api/') ? route.split('?')[0] : null;
  const mk = (q: string) =>
    `https://console.cloud.google.com/logs/query;query=${encodeURIComponent(q)};startTime=${start};endTime=${end}?project=${project}`;
  return {
    requestLogs: apiPath ? mk(`${base}\nhttpRequest.requestUrl:"${apiPath}"`) : null,
    serverErrors: mk(`${base}\nseverity>=WARNING`),
  };
}

export interface ErrorReportUserSummary {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
}

/** Everything the System Health detail window shows for one aggregate:
 *  the doc itself (timestamps flattened to ms), the users it hit resolved to
 *  names/roles, and Cloud Logging links for the time window. */
export async function getErrorReportDetail(id: string) {
  const snap = await db.collection('errorReports').doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data() as FirebaseFirestore.DocumentData;

  const occurrences = (Array.isArray(d.recentOccurrences) ? d.recentOccurrences : []).map(
    (o: Record<string, unknown>) => ({ ...o, at: tsMs(o.at) })
  ) as Array<Record<string, unknown> & { at: number | null }>;

  const affectedUserIds: string[] = (Array.isArray(d.affectedUserIds) ? d.affectedUserIds : [])
    .filter((u: unknown): u is string => typeof u === 'string');
  if (typeof d.sampleUserId === 'string' && !affectedUserIds.includes(d.sampleUserId)) {
    affectedUserIds.push(d.sampleUserId);
  }
  const lookupIds = new Set<string>(affectedUserIds);
  for (const k of ['resolvedBy', 'lastResolvedBy']) if (typeof d[k] === 'string') lookupIds.add(d[k]);
  const ids = Array.from(lookupIds).slice(0, 60);
  const userDocs = ids.length ? await db.getAll(...ids.map((u) => db.collection('users').doc(u))) : [];
  const users: Record<string, ErrorReportUserSummary> = {};
  for (const u of userDocs) {
    if (!u.exists) continue;
    const ud = u.data() as FirebaseFirestore.DocumentData;
    const name = (ud.displayName || ud.fullName || [ud.firstName, ud.lastName].filter(Boolean).join(' ') || null) as string | null;
    const role = (Array.isArray(ud.roles) && ud.roles.length ? ud.roles.join(', ') : ud.role) ?? null;
    users[u.id] = { id: u.id, name, email: (ud.email as string) ?? null, role };
  }

  const route = (d.route as string) ?? null;
  const code = route && route.startsWith('/api/') ? await getServerCodeContext(route, occurrences) : null;

  const createdMs = tsMs(d.createdAt) ?? tsMs(d.firstOccurredAt);
  const lastMs = tsMs(d.lastOccurredAt) ?? Date.now();
  const oldestRecent = occurrences.reduce((m, o) => (o.at && o.at < m ? o.at : m), lastMs);

  return {
    id: snap.id,
    kind: d.kind as ErrorReportKind,
    platform: d.platform as ErrorReportPlatform,
    message: (d.message as string) ?? '',
    stack: (d.stack as string) ?? null,
    route: (d.route as string) ?? null,
    status: d.status as 'open' | 'resolved',
    count: typeof d.count === 'number' ? d.count : 1,
    createdAt: createdMs,
    firstOccurredAt: tsMs(d.firstOccurredAt),
    lastOccurredAt: tsMs(d.lastOccurredAt),
    notifiedAt: tsMs(d.notifiedAt),
    reopenCount: typeof d.reopenCount === 'number' ? d.reopenCount : 0,
    resolvedAt: tsMs(d.resolvedAt),
    resolvedBy: (d.resolvedBy as string) ?? null,
    resolutionNote: (d.resolutionNote as string) ?? null,
    lastResolvedAt: tsMs(d.lastResolvedAt),
    lastResolvedBy: (d.lastResolvedBy as string) ?? null,
    lastResolutionNote: (d.lastResolutionNote as string) ?? null,
    affectedUserIds,
    occurrences,
    users,
    links: buildLogLinks((d.route as string) ?? null, oldestRecent, lastMs),
    code,
    currentServerRevision: process.env.K_REVISION ?? null,
    aiAnalysis: d.aiAnalysis?.result
      ? {
          result: d.aiAnalysis.result,
          lang: (d.aiAnalysis.lang as string) ?? null,
          at: tsMs(d.aiAnalysis.at),
          countAtAnalysis: typeof d.aiAnalysis.countAtAnalysis === 'number' ? d.aiAnalysis.countAtAnalysis : null,
        }
      : null,
  };
}

// The server code behind a client-reported /api failure: the controller that
// serves the route (and where it's defined), plus whatever the server itself
// recorded about failed/slow requests to that endpoint — exception, the src
// line it was thrown from, and real handler duration (services/serverIncidents.ts).
async function getServerCodeContext(route: string, occurrences: Array<Record<string, unknown>>) {
  const method = occurrences.find((o) => typeof o.method === 'string')?.method as string | undefined;
  const handler = resolveRouteHandler(route, method ?? 'GET');

  const pathKey = pathKeyFor(route);
  let incidents: {
    count: number;
    lastAt: number | null;
    samples: Array<Record<string, unknown>>;
  } | null = null;
  try {
    const snap = await db.collection('serverIncidents').doc(incidentDocId(pathKey)).get();
    if (snap.exists) {
      const data = snap.data() as FirebaseFirestore.DocumentData;
      const samples = (Array.isArray(data.samples) ? data.samples : []).slice(0, 6).map((smp: Record<string, unknown>) => ({
        at: tsMs(smp.at),
        kind: smp.kind ?? null,
        method: smp.method ?? null,
        path: smp.path ?? null,
        status: smp.status ?? null,
        durationMs: smp.durationMs ?? null,
        message: smp.message ?? null,
        stack: smp.stack ?? null,
        revision: smp.revision ?? null,
        frames: parseStackFrames(smp.stack as string | null, 4),
      }));
      incidents = { count: typeof data.count === 'number' ? data.count : samples.length, lastAt: tsMs(data.lastAt), samples };
    }
  } catch {
    incidents = null;
  }

  return { pathKey, handler, incidents };
}
