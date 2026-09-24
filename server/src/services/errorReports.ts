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

import crypto from 'crypto';
import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { notifyUser } from './notify.js';

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

const KIND_LABEL: Record<ErrorReportKind, { he: string; en: string }> = {
  client_crash:    { he: 'קריסת לקוח', en: 'Client crash' },
  api_timeout:     { he: 'תפוגת זמן בבקשה', en: 'API timeout' },
  network_failure: { he: 'כשל רשת / קבלת נתונים', en: 'Network / data-receiving failure' },
};

export interface ClientErrorInput {
  kind: ErrorReportKind;
  platform: ErrorReportPlatform;
  message: string;
  stack?: string | null;
  route?: string | null;
  userId?: string | null;
  userRole?: string | null;
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

  const { shouldNotify, count } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const nowMs = Date.now();

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
        sampleUserId: input.userId ?? null,
        sampleUserRole: input.userRole ?? null,
        resolvedAt: null,
        resolvedBy: null,
      });
      return { shouldNotify: true, count: 1 };
    }

    const data = snap.data() as FirebaseFirestore.DocumentData;
    const lastMs: number = (data.lastOccurredAt as admin.firestore.Timestamp | undefined)?.toMillis?.() ?? 0;
    const wasResolved = data.status === 'resolved';
    const wentQuiet = nowMs - lastMs > RENOTIFY_WINDOW_MS;
    const nextCount = (typeof data.count === 'number' ? data.count : 0) + 1;

    tx.update(ref, {
      count: nextCount,
      lastOccurredAt: FieldValue.serverTimestamp(),
      status: 'open',
      message: input.message,
      stack: input.stack ?? null,
      route: input.route ?? null,
      sampleUserId: input.userId ?? null,
      sampleUserRole: input.userRole ?? null,
      ...(wasResolved ? { resolvedAt: null, resolvedBy: null } : {}),
    });

    return { shouldNotify: wasResolved || wentQuiet, count: nextCount };
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
export async function resolveErrorReport(id: string, resolvedBy: string): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  const ref = db.collection('errorReports').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: 'not_found' };
  await ref.update({
    status: 'resolved',
    resolvedAt: FieldValue.serverTimestamp(),
    resolvedBy,
  });
  return { ok: true };
}
