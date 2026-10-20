'use client';

// app/relay-tasks/page.tsx
// Top-level route (mirrors /committees) — a relay task's recipient can be
// any staff role (supervisor, coordinator, administrative_secretary,
// program_head — see server's decisionRelay.ts), not one specific role's
// dashboard tree. Lists every open relay task assigned to the caller: a
// committee chairman routed a decision to them instead of the student (CS-
// enabled only, for now), and they're responsible for passing the outcome
// on to the student themselves. An administrative coordinator recipient
// gets a dropdown instead of the single button — she can also send the
// decision back to the committee or the supervisor if something's wrong.

import { useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, type RelayTask, type RelayTaskAction } from '@/lib/apiClient';
import { STAFF_ROLES } from '@/lib/roles';

export default function RelayTasksPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(STAFF_ROLES);
  const { lang } = useLanguage();

  const [tasks, setTasks] = useState<RelayTask[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const res = await apiClient.getMyRelayTasks();
      setTasks(res.tasks);
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

  const handleResolve = async (id: string, action: RelayTaskAction = 'student', comment = '') => {
    setResolvingId(id);
    try {
      await apiClient.resolveRelayTask(id, action, comment);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'הפעולה נכשלה' : 'Action failed');
    } finally {
      setResolvingId(null);
    }
  };

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  return (
    <DashboardShell
      title={lang === 'he' ? 'החלטות להעברה' : 'Decisions to Relay'}
      subtitle={lang === 'he' ? 'החלטות ועדה שעלייך להעביר לסטודנט/ית' : "Committee decisions you're responsible for passing on to the student"}
    >
      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{loadError}</p>}

      {loadingData ? (
        <p className="text-sm text-muted">…</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-muted">{lang === 'he' ? '✅ אין החלטות ממתינות להעברה' : '✅ No decisions waiting to be relayed'}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {tasks.map((t) => (
            <div key={t.id} className="rounded-lg border border-line bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-ink">{lang === 'he' ? t.projectTitleHe : t.projectTitleEn}</p>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ backgroundColor: t.decision === 'approve' ? 'var(--success-bg)' : 'var(--danger-bg)', color: t.decision === 'approve' ? 'var(--success)' : 'var(--danger)' }}
                >
                  {t.decision === 'approve' ? (lang === 'he' ? '✓ אושר' : '✓ Approved') : (lang === 'he' ? '✗ נדחה' : '✗ Rejected')}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">{lang === 'he' ? t.milestoneNameHe : t.milestoneNameEn}</p>
              {t.comment && <p className="mt-1 text-xs text-ink">{t.comment}</p>}
              <p className="mt-1 text-xs text-muted">
                {lang === 'he' ? `הוחלט על ידי ${t.decidedByName}` : `Decided by ${t.decidedByName}`}
              </p>
              {t.recipientRole === 'administrative_secretary' ? (
                <RelayActionPicker task={t} busy={resolvingId === t.id} onSubmit={(action, comment) => handleResolve(t.id, action, comment)} />
              ) : (
                <button
                  type="button"
                  onClick={() => handleResolve(t.id)}
                  disabled={resolvingId === t.id}
                  className="mt-2 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
                >
                  {resolvingId === t.id ? '…' : lang === 'he' ? 'עברתי לסטודנט/ית ✓' : "I've informed the student ✓"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}

function RelayActionPicker({ task, busy, onSubmit }: {
  task: RelayTask;
  busy: boolean;
  onSubmit: (action: RelayTaskAction, comment: string) => void;
}) {
  const { lang } = useLanguage();
  const he = lang === 'he';
  const [action, setAction] = useState<RelayTaskAction>('student');
  const [comment, setComment] = useState('');
  const needsReason = action !== 'student';

  const options: Array<{ value: RelayTaskAction; label: string; disabled?: boolean }> = [
    { value: 'student', label: he ? 'העברה לסטודנט/ית' : 'Pass on to the student' },
    { value: 'committee', label: he ? 'החזרה לוועדה (לדיון חוזר)' : 'Return to the committee (reconsider)', disabled: !task.canReturnToCommittee },
    { value: 'supervisor', label: he ? 'החזרה למנחה (לבדיקה חוזרת)' : 'Return to the supervisor (re-check)', disabled: !task.canReturnToSupervisor },
  ];

  return (
    <div className="mt-2 space-y-2">
      <select
        value={action}
        onChange={(e) => setAction(e.target.value as RelayTaskAction)}
        disabled={busy}
        aria-label={he ? 'מה לעשות עם ההחלטה' : 'What to do with this decision'}
        className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
        ))}
      </select>
      {needsReason && (
        <textarea
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={he ? 'סיבת ההחזרה (חובה)' : 'Reason for sending it back (required)'}
          className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink"
        />
      )}
      <button
        type="button"
        onClick={() => onSubmit(action, comment.trim())}
        disabled={busy || (needsReason && !comment.trim())}
        className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
      >
        {busy ? '…' : action === 'student' ? (he ? 'שליחה לסטודנט/ית ✓' : 'Send to the student ✓') : (he ? 'החזרה' : 'Send back')}
      </button>
    </div>
  );
}
