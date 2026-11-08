// src/services/systemHealth.ts
//
// Two things system_admin's System Health page (web
// app/admin/live-transportation, mobile app/admin/overview.tsx) can't see
// anywhere else:
//
// 1. Background jobs. Every sweep in index.ts (deadline reminders, the
//    stuck-milestone escalation, account purges, …) runs on an in-process
//    setInterval inside the Cloud Run container, and until now nothing
//    recorded whether a run happened, failed, or stopped happening (e.g. CPU
//    throttled between requests, a crash loop, an exception every run).
//    runTrackedJob wraps each one and writes its latest outcome to
//    systemJobRuns/{jobId} — one small write per run.
//
// 2. Notification delivery. notifyUser (services/notify.ts) already stores a
//    per-channel outcome on each notification; recordDeliveryOutcomes adds
//    the same outcomes to a per-day counter doc (notificationDeliveryStats/
//    {YYYY-MM-DD}, Israel time) so failure rates can be read without
//    scanning every notification. "sent" means the provider accepted the
//    message (Brevo / Expo / Twilio), not that it reached the inbox or phone.
//
// Both collections are server-only: Firestore rules have no match for them,
// so client reads/writes are denied; the page reads them through
// GET /api/admin/system-health (system_admin only). Nothing here stores
// message content or recipients — error texts are scrubbed of addresses and
// phone numbers before they're kept.

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../config/firebase.js';

dayjs.extend(utc);
dayjs.extend(timezone);
const TZ = 'Asia/Jerusalem';

const JOBS_COLLECTION = 'systemJobRuns';
const DELIVERY_COLLECTION = 'notificationDeliveryStats';

const ONE_MINUTE_MS = 60 * 1000;
const FIVE_MIN_MS = 5 * ONE_MINUTE_MS;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/** Every scheduled job index.ts runs — the page lists all of them, so one
 *  that never recorded a run shows up as missing instead of just absent. */
export const SYSTEM_JOBS = {
  purgeDueAccounts:                     { intervalMs: ONE_HOUR_MS, he: 'מחיקת חשבונות שהגיע מועדם', en: 'Purge accounts due for deletion' },
  flagGraduatedStudents:                { intervalMs: ONE_DAY_MS,  he: 'סימון בוגרים', en: 'Flag graduated students' },
  advancePastFixedMilestoneDates:       { intervalMs: ONE_DAY_MS,  he: 'גלגול מועדים קבועים לשנה הבאה', en: 'Roll fixed milestone dates forward' },
  sendMilestoneDeadlineReminders:       { intervalMs: ONE_HOUR_MS, he: 'תזכורות מועדי אבני דרך', en: 'Milestone deadline reminders' },
  sendExaminerDeadlineReminders:        { intervalMs: ONE_HOUR_MS, he: 'תזכורות לבוחנים', en: 'Examiner deadline reminders' },
  sendSeminarOutcomeReminders:          { intervalMs: ONE_HOUR_MS, he: 'תזכורות תוצאות סמינר', en: 'Seminar outcome reminders' },
  sweepStuckMilestones:                 { intervalMs: ONE_HOUR_MS, he: 'סריקת אבני דרך תקועות', en: 'Stuck-milestone sweep' },
  sendSupervisorPendingReviewReminders: { intervalMs: ONE_HOUR_MS, he: 'תזכורות בדיקה למנחים', en: 'Supervisor review reminders' },
  sendMeetingReminders:                 { intervalMs: FIVE_MIN_MS, he: 'תזכורות פגישות', en: 'Meeting reminders' },
  samplePresenceHistory:                { intervalMs: ONE_MINUTE_MS, he: 'דגימת משתמשים מחוברים', en: 'Online-users sample' },
  prunePresenceHistory:                 { intervalMs: ONE_DAY_MS,  he: 'ניקוי היסטוריית חיבור', en: 'Prune presence history' },
  pruneAuditLog:                        { intervalMs: ONE_HOUR_MS, he: 'ניקוי יומן פעולות', en: 'Prune audit log' },
  sendScheduledReminders:               { intervalMs: ONE_HOUR_MS, he: 'תזכורות שתזמנו מנחים', en: 'Supervisor-scheduled reminders' },
  sendEmailDigests:                     { intervalMs: ONE_HOUR_MS, he: 'שליחת סיכום יומי בדוא"ל', en: 'Daily email digest' },
} as const;

export type SystemJobId = keyof typeof SYSTEM_JOBS;

/** Error text safe to keep: email addresses, phone numbers and long digit
 *  runs (IDs) removed, length capped. */
function scrubError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
    .replace(/\+?\d[\d\s-]{6,}\d/g, '[number]')
    .slice(0, 200);
}

/** Runs `job` and records the outcome. Never throws — a job's own failure is
 *  logged and recorded, and a failed health write is only logged. */
export async function runTrackedJob(jobId: SystemJobId, job: () => Promise<unknown>): Promise<void> {
  const startedAt = Date.now();
  let error: unknown = null;
  try {
    await job();
  } catch (err) {
    error = err;
    console.error(`${jobId} sweep failed:`, err);
  }
  const finishedAt = Date.now();
  const outcome = error == null
    ? { lastOk: true, lastSuccessAt: Timestamp.fromMillis(finishedAt) }
    : { lastOk: false, lastFailureAt: Timestamp.fromMillis(finishedAt), lastError: scrubError(error), failures: FieldValue.increment(1) };
  await db.collection(JOBS_COLLECTION).doc(jobId).set({
    lastStartedAt: Timestamp.fromMillis(startedAt),
    lastFinishedAt: Timestamp.fromMillis(finishedAt),
    lastDurationMs: finishedAt - startedAt,
    runs: FieldValue.increment(1),
    revision: process.env.K_REVISION ?? null,
    ...outcome,
  }, { merge: true }).catch((err) => console.error(`runTrackedJob: failed to record ${jobId}:`, err));
}

export const DELIVERY_CHANNELS = ['email', 'push', 'sms', 'whatsapp'] as const;
export type DeliveryChannel = typeof DELIVERY_CHANNELS[number];

/** Adds one notification's per-channel outcomes (notify.ts's `statuses`:
 *  emailDelivery: 'sent' | 'failed' | 'skipped' | 'invalid_number', plus
 *  `<channel>DeliveryError` on failure) to today's counters. Best-effort. */
export async function recordDeliveryOutcomes(statuses: Record<string, string>): Promise<void> {
  const update: Record<string, unknown> = {};
  for (const channel of DELIVERY_CHANNELS) {
    const status = statuses[`${channel}Delivery`];
    if (!status) continue;
    update[channel] = { [status]: FieldValue.increment(1) };
    const error = statuses[`${channel}DeliveryError`];
    if (status === 'failed' && error) {
      update[`lastError_${channel}`] = { message: scrubError(error), at: FieldValue.serverTimestamp() };
    }
  }
  if (Object.keys(update).length === 0) return;
  const day = dayjs().tz(TZ).format('YYYY-MM-DD');
  await db.collection(DELIVERY_COLLECTION).doc(day).set({ day, ...update }, { merge: true })
    .catch((err) => console.error('recordDeliveryOutcomes failed:', err));
}

const toMs = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : null);

export interface SystemJobHealth {
  id: SystemJobId;
  labelHe: string;
  labelEn: string;
  intervalMs: number;
  lastStartedAtMs: number | null;
  lastFinishedAtMs: number | null;
  lastSuccessAtMs: number | null;
  lastFailureAtMs: number | null;
  lastOk: boolean | null;
  lastError: string | null;
  lastDurationMs: number | null;
  runs: number;
  failures: number;
}

export interface DeliveryDay {
  day: string;
  channels: Record<DeliveryChannel, Record<string, number>>;
  lastErrors: Partial<Record<DeliveryChannel, { message: string; atMs: number | null }>>;
}

export async function getSystemHealth(days = 7): Promise<{ jobs: SystemJobHealth[]; delivery: DeliveryDay[]; nowMs: number }> {
  const dayKeys = Array.from({ length: days }, (_, i) => dayjs().tz(TZ).subtract(i, 'day').format('YYYY-MM-DD'));
  const [jobsSnap, deliverySnaps] = await Promise.all([
    db.collection(JOBS_COLLECTION).get(),
    db.getAll(...dayKeys.map((d) => db.collection(DELIVERY_COLLECTION).doc(d))),
  ]);
  const jobDocs = new Map(jobsSnap.docs.map((d) => [d.id, d.data()]));

  const jobs = (Object.keys(SYSTEM_JOBS) as SystemJobId[]).map((id): SystemJobHealth => {
    const def = SYSTEM_JOBS[id];
    const d = jobDocs.get(id) ?? {};
    return {
      id,
      labelHe: def.he,
      labelEn: def.en,
      intervalMs: def.intervalMs,
      lastStartedAtMs: toMs(d.lastStartedAt),
      lastFinishedAtMs: toMs(d.lastFinishedAt),
      lastSuccessAtMs: toMs(d.lastSuccessAt),
      lastFailureAtMs: toMs(d.lastFailureAt),
      lastOk: typeof d.lastOk === 'boolean' ? d.lastOk : null,
      lastError: typeof d.lastError === 'string' ? d.lastError : null,
      lastDurationMs: typeof d.lastDurationMs === 'number' ? d.lastDurationMs : null,
      runs: typeof d.runs === 'number' ? d.runs : 0,
      failures: typeof d.failures === 'number' ? d.failures : 0,
    };
  });

  const delivery = deliverySnaps.map((snap, i): DeliveryDay => {
    const d = snap.data() ?? {};
    const channels = {} as DeliveryDay['channels'];
    const lastErrors: DeliveryDay['lastErrors'] = {};
    for (const channel of DELIVERY_CHANNELS) {
      const counts = (d[channel] ?? {}) as Record<string, unknown>;
      channels[channel] = Object.fromEntries(Object.entries(counts).filter(([, n]) => typeof n === 'number')) as Record<string, number>;
      const err = d[`lastError_${channel}`];
      if (err?.message) lastErrors[channel] = { message: String(err.message), atMs: toMs(err.at) };
    }
    return { day: dayKeys[i]!, channels, lastErrors };
  });

  return { jobs, delivery, nowMs: Date.now() };
}
