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
import { apiClient, type StuckMilestoneRow, type StuckWaitingRole } from '@/lib/apiClient';
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

export default function StuckMilestonesPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(STUCK_VIEW_ROLES);
  const { lang } = useLanguage();

  const [rows, setRows] = useState<StuckMilestoneRow[]>([]);
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
        ? 'אבני דרך שממתינות בשלב אחד יותר מהמגבלה שנקבעה — נדרשת התערבות'
        : 'Milestones waiting on one step longer than their set limit — your action is needed'}
    >
      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{loadError}</p>}
      {notice && <p className="mb-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success" role="status">{notice}</p>}

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
    </DashboardShell>
  );
}
