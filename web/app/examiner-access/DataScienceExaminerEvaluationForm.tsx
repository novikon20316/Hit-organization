'use client';

// app/examiner-access/DataScienceExaminerEvaluationForm.tsx
// External-examiner equivalent of web/app/examinor/home/ExaminerEvaluationModal.tsx's
// data_science document flow — Project_examiner.docx digitized for an examiner
// with no app account. A sibling of OpinionForm.tsx, not a branch inside it:
// this milestone's two-rubric (project/defense) shape, per-rubric submission,
// and mandatory-everything validation are different enough from OpinionForm's
// single-rubric + recommendation flow that keeping them separate guarantees
// OpinionForm stays byte-for-byte unchanged for every other faculty's tokens.
// Only rendered by page.tsx when tokenDoc.facultyId === 'data_science' AND
// tokenDoc.finalGradeComponents is set.

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { examinerSignatureStyle } from '@/lib/examinerSignature';
import type { ExaminerTokenDoc } from '@/lib/examinerTokens';

interface DataScienceExaminerEvaluationFormProps {
  token: string;
  tokenDoc: ExaminerTokenDoc;
  onSubmitted: () => void;
}

interface RubricField {
  key: string;
  labelHe: string;
  labelEn: string;
  maxScore: number;
}

function RubricSection({
  title, rubric, mandatory, done, onSubmit,
}: {
  title: string;
  rubric: RubricField[];
  mandatory: boolean;
  done: boolean;
  onSubmit: (scores: Record<string, number>, comment: string) => Promise<void>;
}) {
  const { lang } = useLanguage();
  const [scores, setScores] = useState<Record<string, string>>(() => Object.fromEntries(rubric.map((c) => [c.key, ''])));
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const total = Math.round(rubric.reduce((sum, c) => sum + ((Number(scores[c.key]) || 0) / c.maxScore) * c.maxScore, 0));

  if (done) {
    return (
      <div className="mt-4 rounded-[var(--radius)] border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="mt-2 text-sm font-semibold text-success">✅ {lang === 'he' ? 'הוגש' : 'Submitted'}</p>
      </div>
    );
  }

  const handleSubmit = async () => {
    setError('');
    for (const c of rubric) {
      const raw = scores[c.key];
      const v = raw === '' ? NaN : Number(raw);
      if (raw === '' || isNaN(v) || v < 0 || v > c.maxScore) {
        const label = lang === 'he' ? c.labelHe : c.labelEn;
        setError(lang === 'he' ? `יש להזין ציון עבור "${label}" בטווח 0–${c.maxScore}` : `Enter a score for "${label}" in the range 0–${c.maxScore}`);
        return;
      }
    }
    if (mandatory && !comment.trim()) {
      setError(lang === 'he' ? 'יש למלא הערכה מילולית והערות' : 'A written evaluation and comments are required');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(Object.fromEntries(rubric.map((c) => [c.key, Number(scores[c.key]) || 0])), comment);
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שליחת ההערכה נכשלה' : 'Failed to submit the evaluation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-4 rounded-[var(--radius)] border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-3 grid gap-3">
        {rubric.map((c) => (
          <label key={c.key} className="block">
            <span className="mb-1 block text-sm font-medium text-ink">
              {lang === 'he' ? c.labelHe : c.labelEn} (0–{c.maxScore})
            </span>
            <input
              type="number"
              min={0}
              max={c.maxScore}
              value={scores[c.key]}
              onChange={(e) => setScores({ ...scores, [c.key]: e.target.value })}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-lg bg-paper px-3 py-2">
        <span className="text-sm font-semibold text-ink">{lang === 'he' ? 'סה"כ' : 'Total'}</span>
        <span className="text-sm font-bold text-ink">{total} / 100</span>
      </div>
      <label className="mt-3 block">
        <span className="mb-1 block text-sm font-medium text-ink">
          {lang === 'he' ? 'הערכה מילולית והערות' : 'Written evaluation and comments'}{mandatory ? ' *' : ''}
        </span>
        <textarea
          rows={4}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
        />
      </label>
      {!!error && <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-3 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
      >
        {submitting ? '…' : lang === 'he' ? 'שלח' : 'Submit'}
      </button>
    </div>
  );
}

export function DataScienceExaminerEvaluationForm({ token, tokenDoc, onSubmitted }: DataScienceExaminerEvaluationFormProps) {
  const { lang } = useLanguage();
  const opinion = (tokenDoc.opinion ?? {}) as { project?: unknown; defense?: unknown };
  const [projectDone, setProjectDone] = useState(!!opinion.project);
  const [defenseDone, setDefenseDone] = useState(!!opinion.defense);

  // The server (submitExternalExaminerEvaluation) enforces this regardless —
  // this is purely so a premature attempt sees a clear explanation instead
  // of a raw 403. tokenDoc.defenseDate is a one-time snapshot from when the
  // examiner was assigned, taken before date-matching resolves a real date
  // and never updated afterward, so it can't be trusted here — re-fetch the
  // live agreed date via the same status endpoint DefenseDateSection uses.
  const [dateLoaded, setDateLoaded] = useState(false);
  const [agreedDate, setAgreedDate] = useState<string | null>(null);
  // A failed fetch here fails closed (isOpen stays false, matching the
  // server's own "reject unless proven open" default) — safe, but silently
  // indistinguishable from "no date agreed yet" even when a date genuinely
  // has been set and the form should be usable. Surface it separately so
  // that case is retryable instead of looking like normal not-yet-agreed
  // copy — same fix as DefenseDateSection.tsx's identical gap.
  const [loadError, setLoadError] = useState(false);

  const loadDate = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await apiClient.getExaminerAccessDefenseDateStatus(token);
      setAgreedDate(res.matchedDate ?? null);
    } catch (e) {
      console.error('examiner-evaluation: defense-date status load error', e);
      setLoadError(true);
    } finally {
      setDateLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot load on mount; loadDate()'s setState calls happen after its awaited network call resolves, not synchronously in this effect
    loadDate();
  }, [loadDate]);

  const components = tokenDoc.finalGradeComponents;
  if (!components) return null;

  const isOpen = !!agreedDate && new Date() >= new Date(`${agreedDate}T00:00:00`);
  if (!dateLoaded) return null;

  if (loadError) {
    return (
      <div className="mt-5 rounded-[var(--radius)] border border-line bg-surface p-4 text-sm">
        <p className="text-danger" role="alert">
          {lang === 'he' ? 'טעינת סטטוס מועד ההגנה נכשלה.' : 'Failed to load defense-date status.'}
        </p>
        <button
          type="button"
          onClick={loadDate}
          className="mt-2 rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper"
        >
          {lang === 'he' ? 'נסה שוב' : 'Retry'}
        </button>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <div className="mt-5 rounded-[var(--radius)] border border-line bg-surface p-4 text-sm text-muted">
        {agreedDate
          ? (lang === 'he'
              ? `טופס ההערכה ייפתח ביום ההגנה שנקבע — ${new Date(agreedDate).toLocaleDateString('he-IL')}.`
              : `The evaluation form opens on the agreed defense date — ${new Date(agreedDate).toLocaleDateString('en-GB')}.`)
          : (lang === 'he'
              ? 'טופס ההערכה ייפתח לאחר שייקבע מועד הגנה מוסכם.'
              : 'The evaluation form opens once a defense date has been agreed and set.')}
      </div>
    );
  }

  const submit = async (kind: 'project' | 'defense', scores: Record<string, number>, comment: string) => {
    await apiClient.submitExaminerAccessEvaluation(token, { kind, scores, comment });
    if (kind === 'project') setProjectDone(true); else setDefenseDone(true);
    if ((kind === 'project' && defenseDone) || (kind === 'defense' && projectDone)) onSubmitted();
  };

  const signature = examinerSignatureStyle(tokenDoc.examinerName, tokenDoc.facultyId ?? 'data_science', 'external', tokenDoc.major ?? null);

  return (
    <div className="mt-5">
      <div className="rounded-[var(--radius)] border border-line bg-surface p-4">
        <h2 className="text-base font-semibold text-ink">📄 {lang === 'he' ? 'טופס הערכת בוחן — עבודת הגמר' : 'Examiner Evaluation Form — The Final Project'}</h2>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted">
          <span>{lang === 'he' ? 'שנה"ל:' : 'Academic year:'} <b className="text-ink">{tokenDoc.academicYearHebrew ?? '—'}</b></span>
          <span>
            {lang === 'he' ? 'תאריך תחילת פרויקט:' : 'Project start date:'}{' '}
            <b className="text-ink">{tokenDoc.projectStartDate ? new Date(tokenDoc.projectStartDate).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US') : '—'}</b>
          </span>
          <span>
            {lang === 'he' ? 'תאריך ההגנה:' : 'Defense date:'}{' '}
            <b className="text-ink">{tokenDoc.defenseDate ? new Date(tokenDoc.defenseDate).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US') : '—'}</b>
          </span>
        </div>
      </div>

      <RubricSection
        title={lang === 'he' ? '📄 הערכת בוחן — עבודת הגמר' : '📄 Examiner Evaluation — The Project'}
        rubric={components.examinerProjectEvaluation.components}
        mandatory
        done={projectDone}
        onSubmit={(scores, comment) => submit('project', scores, comment)}
      />
      <RubricSection
        title={lang === 'he' ? '🛡 הערכת בוחן — בחינת ההגנה' : '🛡 Examiner Evaluation — The Defense Exam'}
        rubric={components.examinerDefenseEvaluation.components}
        mandatory={false}
        done={defenseDone}
        onSubmit={(scores, comment) => submit('defense', scores, comment)}
      />

      {projectDone && defenseDone && (
        <div className="mt-4 rounded-lg border border-line bg-paper p-4">
          <p className="text-xs text-muted">{lang === 'he' ? 'שם הבוחן' : 'Examiner name'}</p>
          <p className="mt-0.5 text-sm font-semibold text-ink">{tokenDoc.examinerName}</p>
          <p className="mt-3 text-xs text-muted">{lang === 'he' ? 'תאריך' : 'Date'}</p>
          <p className="mt-0.5 text-sm text-ink">{new Date().toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}</p>
          <p className="mt-3 text-xs text-muted">{lang === 'he' ? 'חתימה' : 'Signature'}</p>
          <p className="mt-1 text-2xl" style={{ fontFamily: signature.fontFamily, color: signature.color }}>{tokenDoc.examinerName}</p>
        </div>
      )}
    </div>
  );
}
