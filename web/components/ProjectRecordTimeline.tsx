'use client';

// components/ProjectRecordTimeline.tsx
// Read-only, permanent per-project record — GET /api/project-records/:projectId,
// backed by the projectRecordEntries collection (see
// server/src/services/projectRecords.ts). Replaces GradeHistoryPanel's
// narrower grade/milestone-approval-only view with every milestone
// submission, grade, examiner assignment, message, and lifecycle event on
// the project, in chronological order. Nothing here writes anything, and
// there is deliberately no edit/delete affordance anywhere — not even for
// system_admin, who has no more authority over this data than anyone else
// with read access.

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';

interface RecordEntry {
  id: string;
  type: string;
  actorId: string;
  actorRole: string;
  actorDisplayName: string | null;
  data: Record<string, unknown> | null;
  timestamp: string | null;
}

const ENTRY_LABEL: Record<string, { he: string; en: string; icon: string }> = {
  student_joined_project:  { he: 'סטודנט הצטרף לפרויקט', en: 'Student joined the project', icon: '🎓' },
  milestone_submitted:     { he: 'אבן דרך הוגשה', en: 'Milestone submitted', icon: '📤' },
  milestone_resubmitted:   { he: 'אבן דרך הוגשה מחדש', en: 'Milestone resubmitted', icon: '📤' },
  milestone_approved:      { he: 'אבן דרך אושרה', en: 'Milestone approved', icon: '✅' },
  milestone_rejected:      { he: 'אבן דרך נדחתה', en: 'Milestone rejected', icon: '↩️' },
  grade_submitted:         { he: 'ציון הוזן', en: 'Grade submitted', icon: '📊' },
  grade_changed:           { he: 'ציון עודכן', en: 'Grade changed', icon: '📊' },
  final_grade_approved:    { he: 'ציון סופי אושר', en: 'Final grade approved', icon: '🏁' },
  examiner_assigned:       { he: 'בוחן/ת שובץ/ה', en: 'Examiner assigned', icon: '🧑‍⚖️' },
  examiner_removed:        { he: 'בוחן/ת הוסר/ה', en: 'Examiner removed', icon: '🧑‍⚖️' },
  message_sent:            { he: 'הודעה נשלחה', en: 'Message sent', icon: '💬' },
  defense_date_resolved:   { he: 'תאריך הגנה נקבע', en: 'Defense date resolved', icon: '📅' },
  project_status_changed:  { he: 'סטטוס הפרויקט השתנה', en: 'Project status changed', icon: '🔄' },
};

function formatDate(iso: string | null, lang: 'he' | 'en'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function describeEntry(entry: RecordEntry, lang: 'he' | 'en'): string {
  const d = entry.data ?? {};
  switch (entry.type) {
    case 'grade_submitted':
    case 'grade_changed':
      return typeof d.score === 'number' ? `${lang === 'he' ? 'ציון' : 'Score'}: ${d.score}` : '';
    case 'final_grade_approved':
      return typeof d.finalGrade === 'number' ? `${lang === 'he' ? 'ציון סופי' : 'Final grade'}: ${d.finalGrade}` : '';
    case 'examiner_assigned': {
      const internal = Array.isArray(d.internalUids) ? d.internalUids.length : 0;
      const external = Array.isArray(d.externalNotified) ? (d.externalNotified as Array<{ name: string }>).map((e) => e.name) : [];
      const parts = [
        internal > 0 ? `${internal} ${lang === 'he' ? 'פנימיים' : 'internal'}` : null,
        external.length > 0 ? external.join(', ') : null,
      ].filter(Boolean);
      return parts.join(' · ');
    }
    case 'message_sent':
      return typeof d.preview === 'string' ? `"${d.preview}"` : '';
    case 'milestone_rejected':
      return typeof d.reason === 'string' ? d.reason : '';
    case 'project_status_changed':
      return typeof d.newStatus === 'string' ? d.newStatus : '';
    default: {
      const name = d.milestoneName as { he?: string; en?: string } | undefined;
      return name ? (lang === 'he' ? name.he ?? '' : name.en ?? '') : '';
    }
  }
}

export function ProjectRecordTimeline({ projectId }: { projectId: string }) {
  const { lang } = useLanguage();
  const [entries, setEntries] = useState<RecordEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    apiClient.getProjectRecord(projectId)
      .then((res) => {
        if (cancelled) return;
        setEntries(res.entries as unknown as RecordEntry[]);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load project record:', err);
        setError(lang === 'he' ? 'טעינת רישום הפרויקט נכשלה' : 'Failed to load the project record');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, lang]);

  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface p-5">
      <p className="text-base font-semibold text-ink">📜 {lang === 'he' ? 'רישום הפרויקט' : 'Project Record'}</p>
      <p className="mt-1 text-xs text-muted">
        {lang === 'he'
          ? 'רישום קבוע לצפייה בלבד — לא ניתן לעריכה או מחיקה על ידי אף משתמש.'
          : 'A permanent, read-only record — cannot be edited or deleted by any user.'}
      </p>

      {loading && <p className="mt-2 text-sm text-muted" role="status" aria-live="polite">{lang === 'he' ? 'טוען…' : 'Loading…'}</p>}
      {error && <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      {!loading && !error && (entries?.length ?? 0) === 0 && (
        <p className="mt-2 text-sm text-muted">
          {lang === 'he' ? 'אין עדיין רישומים לפרויקט זה.' : 'No records for this project yet.'}
        </p>
      )}

      {!loading && !error && (entries?.length ?? 0) > 0 && (
        <ol className="mt-3 grid gap-2">
          {entries!.map((entry) => {
            const label = ENTRY_LABEL[entry.type];
            const description = describeEntry(entry, lang);
            return (
              <li key={entry.id} className="rounded-md bg-paper px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-ink">
                    {label ? `${label.icon} ${lang === 'he' ? label.he : label.en}` : entry.type}
                  </span>
                  <span className="text-xs text-muted whitespace-nowrap">{formatDate(entry.timestamp, lang)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {entry.actorDisplayName ?? entry.actorRole}
                  {description ? ` — ${description}` : ''}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
