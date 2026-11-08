'use client';

// app/supervisor/dashboard/ProjectRemindersPanel.tsx
// Reminders the supervisor schedules for their own project's students (see
// the server's supervisorReminders.ts for the rules: fixed wording plus an
// optional short note, up to 5 waiting per project, dropped automatically if
// the milestone is submitted first, sent at 09:00 on the chosen day).

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, type ScheduledReminder } from '@/lib/apiClient';

const DAY_OPTIONS = [0, 1, 2, 3, 5, 7, 14];
const MAX_NOTE = 200;

export interface ReminderMilestoneOption {
  id: string;
  nameHe: string;
  nameEn: string;
  dueDate: string;
}

function formatDate(iso: string, lang: 'he' | 'en') {
  return new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ProjectRemindersPanel({ projectId, milestones }: { projectId: string; milestones: ReminderMilestoneOption[] }) {
  const { lang } = useLanguage();
  const he = lang === 'he';
  const [reminders, setReminders] = useState<ScheduledReminder[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [milestoneId, setMilestoneId] = useState('');
  const [daysBefore, setDaysBefore] = useState(3);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    apiClient.getProjectReminders(projectId)
      .then((r) => setReminders(r.reminders))
      .catch(() => setReminders([]));
  }, [projectId]);
  useEffect(load, [load]);

  const selectedId = milestoneId || milestones[0]?.id || '';

  const create = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.createProjectReminder(projectId, { milestoneId: selectedId, daysBefore, note: note.trim() || undefined });
      setAdding(false);
      setNote('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'התזמון נכשל' : 'Failed to schedule');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await apiClient.deleteReminder(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'הביטול נכשל' : 'Failed to cancel');
    } finally {
      setBusy(false);
    }
  };

  if (milestones.length === 0 && (reminders?.length ?? 0) === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-supervisor-outline-variant p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-supervisor-on-surface">⏰ {he ? 'תזכורות לסטודנטים' : 'Reminders to students'}</p>
        {!adding && milestones.length > 0 && (reminders?.length ?? 0) < 5 && (
          <button type="button" onClick={() => setAdding(true)} className="text-xs font-medium text-supervisor-primary hover:underline">
            ＋ {he ? 'תזמון תזכורת' : 'Schedule a reminder'}
          </button>
        )}
      </div>

      {reminders && reminders.length > 0 && (
        <ul className="mt-2 grid gap-1">
          {reminders.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2 text-xs text-supervisor-on-surface">
              <span className="min-w-0">
                {he ? r.milestoneNameHe : r.milestoneNameEn} · {formatDate(r.sendAt, lang)}
                {r.note ? <span className="block truncate text-supervisor-on-surface-variant">“{r.note}”</span> : null}
              </span>
              <button type="button" onClick={() => remove(r.id)} disabled={busy} className="shrink-0 text-supervisor-on-surface-variant hover:text-danger disabled:opacity-50">
                {he ? 'ביטול' : 'Cancel'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-3 grid gap-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-supervisor-on-surface-variant">
              {he ? 'אבן דרך' : 'Milestone'}
              <select
                value={selectedId}
                onChange={(e) => setMilestoneId(e.target.value)}
                className="mt-1 w-full rounded-md border border-supervisor-outline-variant bg-supervisor-surface-container-low px-2 py-1.5 text-sm text-supervisor-on-surface"
              >
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>{he ? m.nameHe : m.nameEn} — {formatDate(m.dueDate, lang)}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-supervisor-on-surface-variant">
              {he ? 'מתי' : 'When'}
              <select
                value={daysBefore}
                onChange={(e) => setDaysBefore(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-supervisor-outline-variant bg-supervisor-surface-container-low px-2 py-1.5 text-sm text-supervisor-on-surface"
              >
                {DAY_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d === 0 ? (he ? 'ביום ההגשה' : 'On the due date') : he ? `${d} ימים לפני` : `${d} day${d > 1 ? 's' : ''} before`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="text-xs text-supervisor-on-surface-variant">
            {he ? 'הערה קצרה (לא חובה)' : 'Short note (optional)'}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={MAX_NOTE}
              className="mt-1 w-full rounded-md border border-supervisor-outline-variant bg-supervisor-surface-container-low px-2 py-1.5 text-sm text-supervisor-on-surface"
            />
          </label>
          <p className="text-[11px] text-supervisor-on-surface-variant">
            {he
              ? 'הסטודנטים יקבלו הודעה קבועה עם שם אבן הדרך ומועד ההגשה, בשעה 09:00 ביום שנבחר. אם יגישו לפני כן — התזכורת לא תישלח.'
              : 'Students get a standard message with the milestone and its due date, at 09:00 on the chosen day. If they submit before then, it isn’t sent.'}
          </p>
          {error && <p className="text-xs text-danger" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setAdding(false); setError(''); }} className="rounded-md border border-supervisor-outline-variant px-3 py-1.5 text-xs text-supervisor-on-surface">
              {he ? 'ביטול' : 'Cancel'}
            </button>
            <button type="button" onClick={create} disabled={busy || !selectedId} className="rounded-md bg-supervisor-primary px-3 py-1.5 text-xs font-semibold text-supervisor-on-primary disabled:opacity-60">
              {busy ? '…' : he ? 'תזמן' : 'Schedule'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
