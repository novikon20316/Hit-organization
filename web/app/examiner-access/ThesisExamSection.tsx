'use client';

// app/examiner-access/ThesisExamSection.tsx
// An outside examiner's part in the CS M.Sc. thesis exam (server's
// services/thesisExam.ts), by access token: pick 5 dates with free hours,
// see the agreed exam time, and fill the "טופס מבחן תיזה" after the exam.

import { useCallback, useMemo, useState } from 'react';
import { apiClient, type ThesisExamCard } from '@/lib/apiClient';
import { THESIS_EXAM_STATUS_LABEL, formatExamSlot } from '@/lib/thesisExam';
import { AvailabilityPicker } from '@/components/thesisExam/AvailabilityPicker';
import { ThesisExamFormPanel, type ThesisExamFormSource } from '@/components/thesisExam/ThesisExamFormPanel';

export function ThesisExamSection({ token, exam: initial, lang }: { token: string; exam: ThesisExamCard; lang: 'he' | 'en' }) {
  const he = lang === 'he';
  const [exam, setExam] = useState(initial);
  const reload = useCallback(async () => {
    const res = await apiClient.getExternalThesisExam(token).catch(() => null);
    if (res?.exam) setExam(res.exam);
  }, [token]);

  const formSource = useMemo<ThesisExamFormSource>(() => ({
    load: () => apiClient.getExternalThesisExamForm(token),
    submit: (body) => apiClient.submitExternalThesisExamForm(token, body),
  }), [token]);

  return (
    <div className="mt-5 rounded-[var(--radius)] border border-line bg-surface p-4 text-start shadow-sm">
      <h2 className="text-base font-semibold text-ink">{he ? 'בחינת התזה' : 'The thesis exam'}</h2>
      <p className="mt-1 text-sm text-muted">{THESIS_EXAM_STATUS_LABEL[exam.status][lang]}</p>

      {exam.schedule && (
        <p className="mt-3 rounded-md bg-success-bg px-3 py-2 text-sm font-semibold text-success">🗓️ {formatExamSlot(exam.schedule, lang)}</p>
      )}

      {exam.status === 'exam_availability' && exam.actions.includes('availability') && exam.window && (
        <AvailabilityPicker
          lang={lang}
          window={exam.window}
          count={exam.rules.datesPerParticipant}
          initial={exam.myAvailability}
          onSubmit={async (entries) => { await apiClient.submitExternalThesisExamAvailability(token, entries); await reload(); }}
        />
      )}
      {(exam.status === 'exam_date_coordinator' || exam.status === 'exam_date_review' || exam.status === 'exam_date_final_review') && (
        <p className="mt-3 text-sm text-muted">{he ? 'נמצא מועד משותף — הוא ממתין לאישור. תישלח אליך הודעה עם המועד הסופי.' : "A common time was found and is awaiting approval. You'll be emailed the final time."}</p>
      )}

      {exam.actions.includes('form') && (
        <div className="mt-4 border-t border-line pt-4">
          <ThesisExamFormPanel source={formSource} lang={lang} onSubmitted={reload} />
        </div>
      )}
    </div>
  );
}
