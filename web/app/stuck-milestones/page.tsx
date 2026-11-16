'use client';

// app/stuck-milestones/page.tsx
// Top-level route (mirrors /relay-tasks) — shared by the administrative
// coordinator, program head and grad school head (plus system_admin), so it
// can't live under one role's dashboard tree. Lists every milestone in the
// caller's scope that has sat on one link of its chain longer than the
// system_admin-set limit, and lets them nudge whoever it's waiting on. See
// server's services/stuckMilestones.ts.

import { useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, type DueSoonMilestoneRow, type StuckMilestoneRow, type StuckWaitingRole } from '@/lib/apiClient';
import { underADayLeftLabel } from '@/lib/timeLeft';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import type { AppRole } from '@/lib/roles';

const STUCK_VIEW_ROLES: AppRole[] = ['administrative_secretary', 'program_head', 'grad_school_head', 'system_admin'];

const WAITING_ROLE_LABEL: Record<StuckWaitingRole, { he: string; en: string }> = {
  student: { he: 'הסטודנט/ית', en: 'Student' },
  supervisor: { he: 'מנחה', en: 'Supervisor' },
  examiner: { he: 'בוחנים', en: 'Examiners' },
  coordinator: { he: 'רכז/ת', en: 'Coordinator' },
  faculty_admin: { he: 'מנהל/ת פקולטה', en: 'Faculty admin' },
  administrative_secretary: { he: 'רכזת מנהלית', en: 'Administrative coordinator' },
  grad_school_head: { he: 'ראש בית הספר לתארים מתקדמים', en: 'Head of graduate school' },
  school_head: { he: 'ראש בית הספר', en: 'School head' },
  program_head: { he: 'ראש התוכנית', en: 'Program head' },
  division_head: { he: 'ראש המחלקה', en: 'Division head' },
  dean: { he: 'דיקן', en: 'Dean' },
  committee: { he: 'ועדה', en: 'Committee' },
};

const REMINDER_COOLDOWN_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "3 days and 5 hours left" — or hours + minutes once under a day. */
function dueLeftLabel(dueIso: string, lang: string, now: number): string {
  const under = underADayLeftLabel(dueIso, lang, now);
  if (under) return under;
  const left = new Date(dueIso).getTime() - now;
  const days = Math.floor(left / DAY_MS);
  const hours = Math.floor((left % DAY_MS) / (60 * 60 * 1000));
  if (lang === 'he') {
    const d = days === 1 ? 'יום אחד' : `${days} ימים`;
    return hours > 0 ? `נותרו ${d} ו-${hours === 1 ? 'שעה אחת' : `${hours} שעות`}` : `נותרו ${d}`;
  }
  const d = `${days} day${days === 1 ? '' : 's'}`;
  return hours > 0 ? `${d} and ${hours} hour${hours === 1 ? '' : 's'} left` : `${d} left`;
}

export default function StuckMilestonesPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(STUCK_VIEW_ROLES);
  const { lang } = useLanguage();

  const [rows, setRows] = useState<StuckMilestoneRow[]>([]);
  const [dueSoon, setDueSoon] = useState<DueSoonMilestoneRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  // Reference time for the reminder cooldown, captured when the list loads
  // (render must stay pure — no Date.now() in the JSX below).
  const [loadedAt, setLoadedAt] = useState(0);

  const fetchAll = useCallback(async () => {
    try {
      const res = await apiClient.getStuckMilestones();
      setRows(res.milestones);
      setDueSoon(res.dueSoon ?? []);
      setLoadedAt(Date.now());
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'הטעינה נכשלה' : 'Failed to load');
    } finally {
      setLoadingData(false);
    }
  }, [lang]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    if (isAllowed) fetchAll();
  }, [isAllowed, fetchAll]);

  const handleRemind = async (row: StuckMilestoneRow) => {
    setRemindingId(row.milestoneId);
    setNotice('');
    setLoadError('');
    try {
      const res = await apiClient.remindStuckMilestone(row.milestoneId);
      setNotice(lang === 'he' ? `נשלחה תזכורת ל-${res.reminded} נמענים.` : `Reminder sent to ${res.reminded} recipient(s).`);
      setRows((prev) => prev.map((r) => (r.milestoneId === row.milestoneId ? { ...r, lastManualReminderAt: new Date().toISOString() } : r)));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'שליחת התזכורת נכשלה' : 'Failed to send the reminder');
    } finally {
      setRemindingId(null);
    }
  };

  if (guardLoading || !isAllowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  return (
    <DashboardShell
      title={lang === 'he' ? 'אבני דרך תקועות' : 'Stuck Milestones'}
      subtitle={lang === 'he'
        ? 'אבני דרך שממתינות בשלב אחד יותר מהמגבלה שנקבעה, ואבני דרך שמועד ההגשה שלהן בעוד 7 ימים או פחות'
        : 'Milestones waiting on one step longer than their set limit, and milestones due within 7 days'}
    >
      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{loadError}</p>}
      {notice && <p className="mb-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success" role="status">{notice}</p>}

      {!loadingData && (
        <h2 className="mb-2 text-sm font-semibold text-ink">
          {lang === 'he' ? `⏳ תקועות מעבר למגבלה (${rows.length})` : `⏳ Stuck past their limit (${rows.length})`}
        </h2>
      )}
      {loadingData ? (
        <p className="text-sm text-muted">…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">{lang === 'he' ? '✅ אין אבני דרך תקועות' : '✅ No stuck milestones'}</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((r) => {
            const coolingDown = !!r.lastManualReminderAt && loadedAt - new Date(r.lastManualReminderAt).getTime() < REMINDER_COOLDOWN_MS;
            const waitingLabel = r.waitingRole ? WAITING_ROLE_LABEL[r.waitingRole][lang] : '—';
            const over = r.limitDays != null ? r.daysStuck - r.limitDays : 0;
            return (
              <div key={r.milestoneId} className="rounded-[var(--radius)] border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{lang === 'he' ? r.milestoneNameHe : r.milestoneNameEn}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      📁 {lang === 'he' ? r.projectTitleHe : r.projectTitleEn}
                      {r.facultyId ? ` · ${facultyLabel(r.facultyId as FacultyId, lang)}` : ''}
                    </p>
                    {r.studentNames.length > 0 && (
                      <p className="mt-0.5 text-xs text-muted">🎓 {r.studentNames.join(', ')}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-danger-bg px-2.5 py-1 text-xs font-semibold text-danger">
                    {lang === 'he' ? `${r.daysStuck} ימים` : `${r.daysStuck} days`}
                  </span>
                </div>

                <p className="mt-3 text-sm text-ink">
                  ⏳ {lang === 'he' ? 'ממתין ל:' : 'Waiting on:'} <span className="font-medium">{waitingLabel}</span>
                  {r.waitingNames.length > 0 && <span className="text-muted"> ({r.waitingNames.join(', ')})</span>}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {lang === 'he'
                    ? `מגבלה: ${r.limitDays ?? '—'} ימים · חריגה של ${over} ימים`
                    : `Limit: ${r.limitDays ?? '—'} days · ${over} day(s) over`}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={remindingId === r.milestoneId || coolingDown || r.waitingNames.length === 0}
                    onClick={() => handleRemind(r)}
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-50"
                  >
                    {remindingId === r.milestoneId ? '…' : lang === 'he' ? `🔔 שליחת תזכורת ל${waitingLabel}` : `🔔 Remind ${waitingLabel.toLowerCase()}`}
                  </button>
                  {coolingDown && (
                    <span className="text-xs text-muted">
                      {lang === 'he' ? 'תזכורת נשלחה בשעה האחרונה' : 'Reminder sent within the last hour'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loadingData && (
        <section className="mt-8">
          <h2 className="mb-1 text-sm font-semibold text-ink">
            {lang === 'he' ? `📅 מועד הגשה בעוד 7 ימים או פחות (${dueSoon.length})` : `📅 Due within 7 days (${dueSoon.length})`}
          </h2>
          <p className="mb-3 text-xs text-muted">
            {lang === 'he'
              ? 'אבני דרך שהסטודנט/ית עדיין לא הגיש/ה (או שהוחזרו לתיקון). נשארות כאן עד הרגע האחרון של מועד ההגשה.'
              : 'Milestones the student has not submitted yet (or that were sent back). They stay here until the very last minute of the deadline.'}
          </p>
          {dueSoon.length === 0 ? (
            <p className="text-sm text-muted">{lang === 'he' ? '✅ אין הגשות קרובות' : '✅ Nothing due in the next 7 days'}</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {dueSoon.map((r) => {
                const leftMs = new Date(r.dueDate).getTime() - loadedAt;
                const urgent = leftMs < 2 * DAY_MS;
                return (
                  <div key={r.milestoneId} className="rounded-[var(--radius)] border border-line bg-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{lang === 'he' ? r.milestoneNameHe : r.milestoneNameEn}</p>
                        <p className="mt-0.5 truncate text-xs text-muted">
                          📁 {lang === 'he' ? r.projectTitleHe : r.projectTitleEn}
                          {r.facultyId ? ` · ${facultyLabel(r.facultyId as FacultyId, lang)}` : ''}
                        </p>
                        {r.studentNames.length > 0 && (
                          <p className="mt-0.5 text-xs text-muted">🎓 {r.studentNames.join(', ')}</p>
                        )}
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${urgent ? 'bg-danger-bg text-danger' : 'bg-amber-100 text-amber-900'}`}>
                        {dueLeftLabel(r.dueDate, lang, loadedAt)}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-muted">
                      {lang === 'he' ? 'מועד הגשה: ' : 'Due: '}
                      {new Date(r.dueDate).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', { timeZone: 'Asia/Jerusalem', dateStyle: 'medium', timeStyle: 'short' })}
                      {r.status === 'rejected' && (lang === 'he' ? ' · הוחזרה לתיקון' : ' · Sent back for revision')}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </DashboardShell>
  );
}
