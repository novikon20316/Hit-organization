'use client';

// components/BackgroundHealthPanels.tsx
// system_admin's System Health page (app/admin/live-transportation): the
// server's scheduled jobs (did each one run on time, did it fail) and the
// last 7 days of notification delivery per channel. Both come from
// GET /api/admin/system-health (server services/systemHealth.ts); refreshed
// every minute while the page is open.

import { useCallback, useEffect, useState } from 'react';
import { apiClient, type DeliveryChannel, type SystemHealthResponse, type SystemJobHealth } from '@/lib/apiClient';

const REFRESH_MS = 60_000;
// A job counts as late once it's gone two intervals plus this grace period
// without starting — one missed tick can just be timer drift.
const LATE_GRACE_MS = 10 * 60_000;

const CHANNEL_LABEL: Record<DeliveryChannel, { he: string; en: string; icon: string }> = {
  email: { he: 'דוא"ל (Brevo)', en: 'Email (Brevo)', icon: '✉️' },
  push: { he: 'התראות לנייד (Expo)', en: 'Push (Expo)', icon: '📱' },
  sms: { he: 'SMS (Twilio)', en: 'SMS (Twilio)', icon: '💬' },
  whatsapp: { he: 'WhatsApp (Twilio)', en: 'WhatsApp (Twilio)', icon: '🟢' },
};
const CHANNELS = Object.keys(CHANNEL_LABEL) as DeliveryChannel[];

type JobState = 'ok' | 'late' | 'failed' | 'never';

function jobState(job: SystemJobHealth, nowMs: number): JobState {
  if (job.lastStartedAtMs == null) return 'never';
  if (job.lastOk === false) return 'failed';
  if (nowMs - job.lastStartedAtMs > job.intervalMs * 2 + LATE_GRACE_MS) return 'late';
  return 'ok';
}

const STATE_LABEL: Record<JobState, { he: string; en: string }> = {
  ok: { he: 'תקין', en: 'OK' },
  late: { he: 'באיחור', en: 'Late' },
  failed: { he: 'נכשל', en: 'Failed' },
  never: { he: 'אין ריצה מתועדת', en: 'No run recorded' },
};

const STATE_ORDER: Record<JobState, number> = { failed: 0, late: 1, never: 2, ok: 3 };

function StateBadge({ state, lang }: { state: JobState; lang: 'he' | 'en' }) {
  const cls =
    state === 'ok' ? 'bg-success-bg text-success'
      : state === 'failed' ? 'bg-danger-bg text-danger'
        : 'bg-admin-surface-container-low text-admin-on-surface-variant';
  const style = state === 'late' ? { backgroundColor: 'var(--warning-bg, #FEF3C7)', color: 'var(--warning, #92400E)' } : undefined;
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`} style={style}>{STATE_LABEL[state][lang]}</span>;
}

function formatAgo(ms: number | null, nowMs: number, lang: 'he' | 'en'): string {
  if (ms == null) return '—';
  const min = Math.max(0, Math.round((nowMs - ms) / 60_000));
  if (min < 1) return lang === 'he' ? 'עכשיו' : 'just now';
  if (min < 60) return lang === 'he' ? `לפני ${min} דק׳` : `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return lang === 'he' ? `לפני ${h} שע׳` : `${h} h ago`;
  return lang === 'he' ? `לפני ${Math.round(h / 24)} ימים` : `${Math.round(h / 24)} days ago`;
}

function formatInterval(ms: number, lang: 'he' | 'en'): string {
  const min = ms / 60_000;
  if (min < 60) return lang === 'he' ? `כל ${min} דק׳` : `every ${min} min`;
  const h = min / 60;
  if (h < 24) return lang === 'he' ? (h === 1 ? 'כל שעה' : `כל ${h} שע׳`) : (h === 1 ? 'hourly' : `every ${h} h`);
  return lang === 'he' ? 'פעם ביום' : 'daily';
}

export function BackgroundHealthPanels({ lang }: { lang: 'he' | 'en' }) {
  const [data, setData] = useState<SystemHealthResponse | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    apiClient.getSystemHealth()
      .then((res) => { setData(res); setError(''); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const sectionCls = 'rounded-admin-lg border border-admin-outline-variant bg-admin-surface p-4 shadow-sm';

  if (!data) {
    return (
      <section className={sectionCls}>
        <p className="text-sm text-admin-on-surface-variant" role={error ? 'alert' : 'status'}>
          {error || (lang === 'he' ? 'טוען מצב משימות רקע…' : 'Loading background health…')}
        </p>
      </section>
    );
  }

  const jobs = data.jobs
    .map((job) => ({ job, state: jobState(job, data.nowMs) }))
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);
  const problemCount = jobs.filter((j) => j.state === 'failed' || j.state === 'late').length;

  const totals = Object.fromEntries(CHANNELS.map((channel) => {
    const sum: Record<string, number> = {};
    for (const day of data.delivery) {
      for (const [status, n] of Object.entries(day.channels[channel] ?? {})) sum[status] = (sum[status] ?? 0) + n;
    }
    return [channel, sum];
  })) as Record<DeliveryChannel, Record<string, number>>;
  const today = data.delivery[0];
  const lastError = (channel: DeliveryChannel) =>
    data.delivery.map((d) => d.lastErrors[channel]).find((e) => e != null) ?? null;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <section className={sectionCls}>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-admin-primary">{lang === 'he' ? 'משימות רקע בשרת' : 'Background jobs'}</h2>
          <span className={`text-xs font-semibold ${problemCount > 0 ? 'text-danger' : 'text-success'}`}>
            {problemCount > 0
              ? (lang === 'he' ? `${problemCount} דורשות בדיקה` : `${problemCount} need attention`)
              : (lang === 'he' ? 'אין תקלות' : 'No problems')}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="text-admin-on-surface-variant">
              <tr>
                <th className="py-1.5 pe-2 text-start font-medium">{lang === 'he' ? 'משימה' : 'Job'}</th>
                <th className="py-1.5 pe-2 text-start font-medium">{lang === 'he' ? 'מצב' : 'Status'}</th>
                <th className="py-1.5 pe-2 text-start font-medium">{lang === 'he' ? 'ריצה אחרונה' : 'Last run'}</th>
                <th className="py-1.5 text-start font-medium">{lang === 'he' ? 'כשלונות' : 'Failures'}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(({ job, state }) => (
                <tr key={job.id} className="border-t border-admin-outline-variant/60 align-top">
                  <td className="py-2 pe-2">
                    <p className="font-medium text-admin-on-surface">{lang === 'he' ? job.labelHe : job.labelEn}</p>
                    <p className="text-[11px] text-admin-on-surface-variant">{formatInterval(job.intervalMs, lang)}</p>
                    {state === 'failed' && job.lastError && <p className="mt-0.5 break-words text-[11px] text-danger">{job.lastError}</p>}
                  </td>
                  <td className="py-2 pe-2"><StateBadge state={state} lang={lang} /></td>
                  <td className="whitespace-nowrap py-2 pe-2 text-admin-on-surface-variant">
                    {formatAgo(job.lastStartedAtMs, data.nowMs, lang)}
                    {job.lastDurationMs != null && <span className="block text-[11px]">{(job.lastDurationMs / 1000).toFixed(1)}s</span>}
                  </td>
                  <td className="py-2 text-admin-on-surface-variant">{job.failures} / {job.runs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-admin-on-surface-variant">
          {lang === 'he'
            ? '"באיחור" = לא התחילה ריצה במשך יותר מפעמיים מהמרווח הקבוע. הריצות מתועדות מהעדכון הזה והלאה.'
            : '"Late" = no run started for over twice its interval. Runs are recorded from this update onward.'}
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className="mb-3 text-sm font-bold text-admin-primary">{lang === 'he' ? 'מסירת התראות — 7 ימים אחרונים' : 'Notification delivery — last 7 days'}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {CHANNELS.map((channel) => {
            const t = totals[channel];
            const sent = t.sent ?? 0;
            const failed = t.failed ?? 0;
            const attempted = sent + failed;
            const failRate = attempted > 0 ? Math.round((failed / attempted) * 100) : null;
            const err = lastError(channel);
            const todayCounts = today?.channels[channel] ?? {};
            return (
              <div key={channel} className="rounded-admin border border-admin-outline-variant/70 p-3">
                <p className="text-xs font-semibold text-admin-on-surface">{CHANNEL_LABEL[channel].icon} {CHANNEL_LABEL[channel][lang]}</p>
                <p className={`mt-1 text-2xl font-semibold ${failRate != null && failRate >= 10 ? 'text-danger' : 'text-admin-on-surface'}`}>
                  {failRate == null ? '—' : `${failRate}%`}
                  <span className="ms-1 text-[11px] font-normal text-admin-on-surface-variant">{lang === 'he' ? 'כשלונות' : 'failed'}</span>
                </p>
                <p className="text-[11px] text-admin-on-surface-variant">
                  {lang === 'he'
                    ? `נשלחו ${sent} · נכשלו ${failed} · דולגו ${t.skipped ?? 0}${t.invalid_number ? ` · מספר לא תקין ${t.invalid_number}` : ''}`
                    : `Sent ${sent} · Failed ${failed} · Skipped ${t.skipped ?? 0}${t.invalid_number ? ` · Invalid number ${t.invalid_number}` : ''}`}
                </p>
                <p className="text-[11px] text-admin-on-surface-variant">
                  {lang === 'he' ? `היום: ${todayCounts.sent ?? 0} נשלחו, ${todayCounts.failed ?? 0} נכשלו` : `Today: ${todayCounts.sent ?? 0} sent, ${todayCounts.failed ?? 0} failed`}
                </p>
                {err && (
                  <p className="mt-1 break-words text-[11px] text-danger" title={err.message}>
                    {lang === 'he' ? 'שגיאה אחרונה: ' : 'Last error: '}{err.message}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-admin-on-surface-variant">
          {lang === 'he'
            ? '"נשלחו" = הספק (Brevo / Expo / Twilio) קיבל את ההודעה — לא אישור שהגיעה לתיבה או לטלפון. "דולגו" = הערוץ כבוי למשתמש או שאין לו כתובת/מספר. נספר מהעדכון הזה והלאה.'
            : '"Sent" = the provider (Brevo / Expo / Twilio) accepted it — not proof it reached the inbox or phone. "Skipped" = channel off for that user or no address/number. Counted from this update onward.'}
        </p>
      </section>
    </div>
  );
}
