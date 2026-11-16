'use client';

// components/thesisExam/ThesisExamOverviewPanel.tsx
// Staff oversight panel on the CS thesis exam ("בחינה") milestone card: who
// the examiners are (internal AND outside — the generic examiner-opinions
// panel only knew outside examiners' access tokens) and, while dates are
// being picked, who has picked their 5 dates and who still owes them.
// Data: GET /api/thesis-exam/:milestoneId/overview (server's
// thesisExamController.getThesisExamOverview). Renders nothing on 403/no exam.

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, type ThesisExamOverview } from '@/lib/apiClient';
import { formatExamDeadline } from '@/lib/thesisExam';

const ROLE_LABEL: Record<string, { he: string; en: string }> = {
  student: { he: 'סטודנט/ית', en: 'Student' },
  supervisor: { he: 'מנחה', en: 'Supervisor' },
  committee: { he: 'חבר/ת ועדה', en: 'Committee' },
  examiner: { he: 'בוחן/ת', en: 'Examiner' },
};

function day(iso: string, he: boolean): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(he ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short' });
}

export function ThesisExamOverviewPanel({ milestoneId }: { milestoneId: string }) {
  const { lang } = useLanguage();
  const he = lang === 'he';
  const [exam, setExam] = useState<ThesisExamOverview | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient.getThesisExamOverview(milestoneId)
      .then((res) => { if (!cancelled) setExam(res.exam); })
      .catch(() => { if (!cancelled) setExam(null); });
    return () => { cancelled = true; };
  }, [milestoneId]);

  if (!exam) return null;
  const pending = exam.participants.filter((p) => !p.submitted);
  const done = exam.participants.filter((p) => p.submitted);
  const roles = (r: string[]) => r.map((x) => ROLE_LABEL[x]?.[lang] ?? x).join(', ');

  return (
    <div className="mt-3 rounded-[var(--radius)] border border-line bg-paper p-3">
      <p className="text-sm font-semibold text-ink">
        🧑‍⚖️ {he ? 'בוחנים' : 'Examiners'}
        <span className="ms-1 text-xs font-normal text-muted">
          ({exam.examiners.length}/{exam.requiredExaminers}{!exam.examinersApproved && exam.examiners.length > 0 ? (he ? ' · ממתין לאישור המינוי' : ' · nomination awaiting approval') : ''})
        </span>
      </p>
      {exam.examiners.length === 0 ? (
        <p className="mt-1 text-xs text-muted">{he ? 'המנחה טרם מינה/תה בוחנים.' : 'The supervisor has not nominated examiners yet.'}</p>
      ) : (
        <div className="mt-2 grid gap-1.5">
          {exam.examiners.map((e, i) => (
            <div key={i} className="rounded-md bg-surface px-3 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">{e.name}</span>
                <span className="text-xs text-muted">
                  {e.type === 'external' ? (he ? 'בוחן/ת חיצוני/ת' : 'Outside examiner') : (he ? 'סגל המוסד' : 'Staff member')}
                  {e.institution ? ` · ${e.institution}` : ''}
                </span>
              </div>
              {(e.email || e.accessEmailSent !== null) && (
                <p className="mt-0.5 text-xs text-muted">
                  {e.email && <a href={`mailto:${e.email}`} className="text-primary hover:underline" dir="ltr">{e.email}</a>}
                  {e.accessEmailSent !== null && (
                    <span>{e.email ? ' · ' : ''}{e.accessEmailSent ? (he ? 'קוד גישה נשלח במייל' : 'Access code emailed') : (he ? '⚠ שליחת קוד הגישה נכשלה' : '⚠ Access code email failed')}</span>
                  )}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {exam.status === 'exam_availability' && exam.participants.length > 0 && (
        <div className="mt-3 border-t border-line pt-2.5">
          <p className="text-xs font-semibold text-ink">
            📅 {he ? 'בחירת 5 מועדים' : 'Picking 5 dates'} — {done.length}/{exam.participants.length} {he ? 'בחרו' : 'picked'}
            {exam.window && (
              <span className="ms-1 font-normal text-muted">
                ({he ? 'עד' : 'until'} {day(exam.window.end, he)}{exam.availabilityRound > 1 ? (he ? ` · סבב ${exam.availabilityRound}` : ` · round ${exam.availabilityRound}`) : ''})
              </span>
            )}
          </p>
          {exam.pickDeadline && !exam.lateEntryDeadline && (
            <p className="mt-1 text-xs text-muted">⏰ {he ? 'מועד אחרון לבחירה' : 'Deadline'}: {formatExamDeadline(exam.pickDeadline, lang)}</p>
          )}
          {exam.lateEntryDeadline && (
            <p className="mt-1 text-xs font-medium text-accent">
              📞 {he ? `המועד עבר — הרכזת האדמיניסטרטיבית משלימה תאריכים עד ${formatExamDeadline(exam.lateEntryDeadline, 'he')}` : `Deadline passed — the administrative coordinator completes dates until ${formatExamDeadline(exam.lateEntryDeadline, 'en')}`}
            </p>
          )}
          {pending.length > 0 && (
            <div className="mt-1.5">
              <p className="text-xs font-medium text-accent">{he ? 'טרם בחרו:' : 'Still to pick:'}</p>
              <ul className="mt-0.5 grid gap-0.5">
                {pending.map((p, i) => (
                  <li key={i} className="text-xs text-ink">⏳ {p.name} <span className="text-muted">({roles(p.roles)})</span></li>
                ))}
              </ul>
            </div>
          )}
          {done.length > 0 && (
            <p className="mt-1.5 text-xs text-muted">✓ {he ? 'בחרו' : 'Picked'}: {done.map((p) => p.name).join(', ')}</p>
          )}
        </div>
      )}
      {exam.status === 'exam_date_coordinator' && (
        <p className="mt-2 text-xs font-medium text-accent">
          {exam.coordinatorTask === 'set_hours' && exam.hoursWindow
            ? (he ? `נמצא מועד משותף: ${exam.hoursWindow.date.split('-').reverse().join('.')} ${exam.hoursWindow.from}–${exam.hoursWindow.to} — הרכזת האדמיניסטרטיבית קובעת את שעות הבחינה` : `Common time found: ${exam.hoursWindow.date} ${exam.hoursWindow.from}–${exam.hoursWindow.to} — the administrative coordinator is setting the hours`)
            : (he ? 'אין מועד משותף לכל המשתתפים — הרכזת האדמיניסטרטיבית קובעת תאריך ושעות' : 'No time common to everyone — the administrative coordinator is setting the date and hours')}
        </p>
      )}
      {exam.excludedNames.length > 0 && exam.status !== 'exam_availability' && (
        <p className="mt-2 text-xs text-muted">{he ? 'המועד נקבע ללא תאריכים של' : 'Time set without dates from'}: {exam.excludedNames.join(', ')}</p>
      )}
    </div>
  );
}
