'use client';

// app/examinor/home/ExaminerEvaluationModal.tsx
// One examiner's half of the three-rubric final-grade workflow (see
// workflowTemplates.ts's finalGradeComponents) — 'project' scores the written
// project/thesis, 'defense' scores the oral defense performance; each
// examiner submits both, independently, mirroring GradeExaminerModal.tsx's
// dynamic-rubric pattern but posting to submitExaminerEvaluation instead of
// submitMilestoneGrade (this milestone's overall grade is an aggregate of
// three graders' rubrics, not just this examiner's).

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import { examinerSignatureStyle } from '@/lib/examinerSignature';
import type { AssignedMilestone, GradingComponentSpec } from './types';

interface ExaminerEvaluationModalProps {
  milestone: AssignedMilestone;
  kind: 'project' | 'defense';
  onClose: () => void;
  onSubmitted: () => void;
}

export function ExaminerEvaluationModal({ milestone: m, kind, onClose, onSubmitted }: ExaminerEvaluationModalProps) {
  const { lang, t } = useLanguage();
  const { userData } = useAuth();
  const rubric: GradingComponentSpec[] = kind === 'project'
    ? m.finalGradeComponents?.examinerProjectEvaluation.components ?? []
    : m.finalGradeComponents?.examinerDefenseEvaluation.components ?? [];

  // Project_examiner.docx's digitized paper form — header fields, mandatory
  // every-field validation, and a signature — is exclusive to data_science's
  // 'project' evaluation (the written thesis). The oral-defense rubric
  // ('defense', from a different paper form, Project_defence_slides.docx) and
  // every other faculty's 'project' evaluation keep today's exact behavior.
  const isDataScienceDocument = m.facultyId === 'data_science' && kind === 'project';

  const [scores, setScores] = useState<Record<string, string>>(() => Object.fromEntries(rubric.map((c) => [c.key, ''])));
  const [comment, setComment] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Shown instead of auto-closing, only for the data_science document flow —
  // the signature represents this specific, already-submitted evaluation, so
  // it renders in a post-submit confirmation state, not the editable form.
  const [submittedAt, setSubmittedAt] = useState<Date | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);

  const total = Math.round(rubric.reduce((sum, c) => sum + ((Number(scores[c.key]) || 0) / c.maxScore) * c.weight, 0));

  const handleSubmit = async () => {
    setError('');

    if (isDataScienceDocument) {
      for (const c of rubric) {
        const raw = scores[c.key];
        const v = raw === '' ? NaN : Number(raw);
        if (raw === '' || isNaN(v) || v < 0 || v > c.maxScore) {
          const label = lang === 'he' ? c.labelHe : c.labelEn;
          setError(lang === 'he' ? `יש להזין ציון עבור "${label}" בטווח 0–${c.maxScore}` : `Enter a score for "${label}" in the range 0–${c.maxScore}`);
          return;
        }
      }
      if (!comment.trim()) {
        setError(lang === 'he' ? 'יש למלא הערכה מילולית והערות' : 'A written evaluation and comments are required');
        return;
      }
    }

    setSubmitting(true);
    try {
      await apiClient.submitExaminerEvaluation(m.id, {
        kind,
        scores: Object.fromEntries(rubric.map((c) => [c.key, Number(scores[c.key]) || 0])),
        comment,
      }, file ? [file] : undefined);
      if (isDataScienceDocument) {
        setSubmittedAt(new Date());
      } else {
        onSubmitted();
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שליחת ההערכה נכשלה' : 'Failed to submit the evaluation');
    } finally {
      setSubmitting(false);
    }
  };

  const examinerName = (lang === 'he' ? userData?.displayNameHe : userData?.displayNameEn) || userData?.displayName || '';
  const signature = examinerSignatureStyle(examinerName, m.facultyId, 'internal', m.major);

  if (submittedAt) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          className="w-full max-w-lg rounded-examinor bg-examinor-surface-container-lowest p-6 text-center shadow-lg outline-none"
        >
          <h2 className="text-lg font-semibold text-examinor-on-surface">✅ {lang === 'he' ? 'ההערכה נשלחה' : 'Evaluation submitted'}</h2>
          <div className="mt-5 rounded-lg border border-examinor-outline-variant bg-examinor-surface-container-low p-4">
            <p className="text-xs text-examinor-on-surface-variant">{lang === 'he' ? 'שם הבוחן' : 'Examiner name'}</p>
            <p className="mt-0.5 text-sm font-semibold text-examinor-on-surface">{examinerName}</p>
            <p className="mt-3 text-xs text-examinor-on-surface-variant">{lang === 'he' ? 'תאריך' : 'Date'}</p>
            <p className="mt-0.5 text-sm text-examinor-on-surface">{submittedAt.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}</p>
            <p className="mt-3 text-xs text-examinor-on-surface-variant">{lang === 'he' ? 'חתימה' : 'Signature'}</p>
            <p className="mt-1 text-2xl" style={{ fontFamily: signature.fontFamily, color: signature.color }}>{examinerName}</p>
          </div>
          <button
            type="button"
            onClick={() => { onSubmitted(); onClose(); }}
            className="mt-5 w-full rounded-lg bg-examinor-primary py-2.5 text-sm font-semibold text-examinor-on-primary hover:opacity-90"
          >
            {lang === 'he' ? 'סגור' : 'Close'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-examinor bg-examinor-surface-container-lowest p-6 shadow-lg outline-none"
      >
        <h2 className="text-lg font-semibold text-examinor-on-surface">
          {kind === 'project'
            ? (lang === 'he' ? '📄 הערכת בוחן — עבודת הגמר' : '📄 Examiner Evaluation — The Project')
            : (lang === 'he' ? '🛡 הערכת בוחן — בחינת ההגנה' : '🛡 Examiner Evaluation — The Defense Exam')}
        </h2>

        <div className="mt-3 rounded-lg bg-examinor-surface-container-low p-3">
          <p className="text-sm font-semibold text-examinor-on-surface">{lang === 'he' ? m.projectTitleHe : m.projectTitleEn}</p>
          <p className="mt-0.5 text-xs text-examinor-on-surface-variant">👤 {m.studentNames.join(', ')}</p>
          {isDataScienceDocument && (
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-examinor-outline-variant/60 pt-2 text-xs text-examinor-on-surface-variant">
              <span>{lang === 'he' ? 'שנה"ל:' : 'Academic year:'} <b className="text-examinor-on-surface">{m.academicYearHebrew ?? '—'}</b></span>
              <span>
                {lang === 'he' ? 'תאריך תחילת פרויקט:' : 'Project start date:'}{' '}
                <b className="text-examinor-on-surface">{m.projectStartDate ? new Date(m.projectStartDate).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US') : '—'}</b>
              </span>
              <span>
                {lang === 'he' ? 'תאריך ההגנה:' : 'Defense date:'}{' '}
                <b className="text-examinor-on-surface">{m.defenseDate ? new Date(m.defenseDate).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US') : '—'}</b>
              </span>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-3">
          {rubric.map((c) => (
            <label key={c.key} className="block">
              <span className="mb-1.5 block text-sm font-medium text-examinor-on-surface">
                {lang === 'he' ? c.labelHe : c.labelEn} (0–{c.maxScore})
              </span>
              <input
                type="number"
                min={0}
                max={c.maxScore}
                value={scores[c.key]}
                onChange={(e) => setScores({ ...scores, [c.key]: e.target.value })}
                className="w-full rounded-lg border border-examinor-outline-variant bg-examinor-surface-container-low px-3 py-2 text-sm text-examinor-on-surface focus:border-examinor-primary focus:bg-examinor-surface-container-lowest focus:outline-none"
              />
            </label>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-examinor-on-surface">
            {lang === 'he' ? 'הערכה מילולית והערות' : 'Written evaluation and comments'}{isDataScienceDocument ? ' *' : ''}
          </span>
          <textarea
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full rounded-lg border border-examinor-outline-variant bg-examinor-surface-container-low px-3 py-2 text-sm text-examinor-on-surface focus:border-examinor-primary focus:bg-examinor-surface-container-lowest focus:outline-none"
          />
        </label>

        <div className="mt-4 flex items-center justify-between rounded-lg bg-examinor-surface-container-low px-3 py-2">
          <span className="text-sm font-semibold text-examinor-on-surface">{lang === 'he' ? 'סה"כ' : 'Total'}</span>
          <span className="text-sm font-bold" style={{ color: total >= 60 ? 'var(--success)' : 'var(--danger)' }}>
            {total} / 100
          </span>
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-examinor-on-surface">
            {lang === 'he' ? 'קובץ מצורף (אופציונלי)' : 'Attached file (optional)'}
          </span>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full rounded-lg border border-examinor-outline-variant bg-examinor-surface-container-low px-3 py-2 text-sm text-examinor-on-surface" />
        </label>

        {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-examinor-outline-variant px-3.5 py-2.5 text-sm font-medium text-examinor-on-surface hover:bg-examinor-surface-container-low">
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 rounded-lg bg-examinor-primary py-2.5 text-sm font-semibold text-examinor-on-primary hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? '…' : t('submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
