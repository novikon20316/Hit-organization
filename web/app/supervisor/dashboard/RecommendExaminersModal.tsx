'use client';

// app/supervisor/dashboard/RecommendExaminersModal.tsx
// Always scoped to one specific project now — opened either right after
// project creation, or via a project card's own "Recommend Examiners"
// button (see page.tsx) — never a generic "pick any of your projects"
// picker anymore, so that step (and its state) is gone.
import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import type { ExaminerUser } from '@/app/coordinator/home/types';

export interface RecommendExaminersTarget {
  id: string;
  titleHe: string;
  titleEn: string;
}

interface RecommendedExaminerDraft {
  type: 'internal' | 'external';
  internalUserId?: string;
  name: string;
  email: string;
  institution: string;
  expertise: string;
  priority: 1 | 2 | 3;
}

interface RecommendExaminersModalProps {
  project: RecommendExaminersTarget;
  internalExaminers: ExaminerUser[];
  onClose: () => void;
  onSubmitted: () => void;
}

export function RecommendExaminersModal({ project, internalExaminers, onClose, onSubmitted }: RecommendExaminersModalProps) {
  const { lang } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);
  const [examiners, setExaminers] = useState<RecommendedExaminerDraft[]>([]);
  const [extName, setExtName] = useState('');
  const [extEmail, setExtEmail] = useState('');
  const [extInstitution, setExtInstitution] = useState('');
  const [extExpertise, setExtExpertise] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const nextPriority = (): 1 | 2 | 3 => Math.min(examiners.length + 1, 3) as 1 | 2 | 3;

  const addInternal = (u: ExaminerUser) => {
    if (examiners.some((e) => e.internalUserId === u.id)) return;
    setExaminers((prev) => [
      ...prev,
      { type: 'internal', internalUserId: u.id, name: u.displayName, email: u.email ?? '', institution: 'HIT', expertise: '', priority: nextPriority() },
    ]);
  };

  const addExternal = () => {
    if (!extName.trim() || !extEmail.trim()) {
      setError(lang === 'he' ? 'שם ואימייל הם שדות חובה' : 'Name and email are required');
      return;
    }
    setExaminers((prev) => [
      ...prev,
      { type: 'external', name: extName.trim(), email: extEmail.trim(), institution: extInstitution.trim(), expertise: extExpertise.trim(), priority: nextPriority() },
    ]);
    setExtName('');
    setExtEmail('');
    setExtInstitution('');
    setExtExpertise('');
    setError('');
  };

  const handleSubmit = async () => {
    if (examiners.length === 0) {
      setError(lang === 'he' ? 'יש להוסיף לפחות בוחן אחד' : 'Please add at least one examiner');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await apiClient.createExaminerRecommendation({
        projectId: project.id,
        projectTitleHe: project.titleHe,
        projectTitleEn: project.titleEn,
        recommendedExaminers: examiners,
      });
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שגיאה בשליחת ההמלצה' : 'Failed to submit recommendation');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg outline-none"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'המלצת בוחנים' : 'Examiner Recommendation'}</h2>
            <p className="mt-0.5 text-sm text-muted">{lang === 'he' ? project.titleHe : project.titleEn}</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>

        {examiners.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-sm font-medium text-ink">{lang === 'he' ? 'בוחנים שנוספו:' : 'Added Examiners:'}</p>
            <div className="grid gap-1.5">
              {examiners.map((ex, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-line bg-paper px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold text-ink">{ex.name}</p>
                    <p className="text-xs text-muted">
                      {ex.type === 'internal' ? (lang === 'he' ? 'בוחן פנימי' : 'Internal') : `${lang === 'he' ? 'בוחן חיצוני' : 'External'} · ${ex.institution}`}
                      {' · '}
                      {lang === 'he' ? 'עדיפות' : 'Priority'} {ex.priority}
                    </p>
                  </div>
                  <button type="button" onClick={() => setExaminers((prev) => prev.filter((_, idx) => idx !== i))} className="px-2 text-danger">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mb-1.5 mt-4 text-sm font-medium text-ink">{lang === 'he' ? 'חפש בוחן פנימי' : 'Search Internal Examiner'}</p>
        <div className="grid gap-1.5">
          {internalExaminers.map((u) => {
            const added = examiners.some((e) => e.internalUserId === u.id);
            return (
              <button
                key={u.id}
                type="button"
                disabled={added}
                onClick={() => addInternal(u)}
                className={`rounded-lg border px-3 py-2 text-start text-sm ${added ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink'}`}
              >
                {added ? '✓ ' : ''}
                {u.displayName} · {u.email}
              </button>
            );
          })}
        </div>

        <p className="mb-1.5 mt-4 text-sm font-medium text-ink">{lang === 'he' ? 'הוסף בוחן חיצוני' : 'Add External Examiner'}</p>
        <div className="grid gap-2">
          <input placeholder={lang === 'he' ? 'שם מלא' : 'Full Name'} value={extName} onChange={(e) => setExtName(e.target.value)} className={inputCls} />
          <input placeholder={lang === 'he' ? 'דוא"ל' : 'Email'} dir="ltr" value={extEmail} onChange={(e) => setExtEmail(e.target.value)} className={inputCls} />
          <input
            placeholder={lang === 'he' ? 'מוסד / אוניברסיטה' : 'Institution / University'}
            value={extInstitution}
            onChange={(e) => setExtInstitution(e.target.value)}
            className={inputCls}
          />
          <input
            placeholder={lang === 'he' ? 'תחום מומחיות' : 'Area of Expertise'}
            value={extExpertise}
            onChange={(e) => setExtExpertise(e.target.value)}
            className={inputCls}
          />
          <button type="button" onClick={addExternal} className="rounded-lg border border-accent px-3 py-2 text-sm font-semibold text-accent hover:bg-[#FBF3E3]">
            + {lang === 'he' ? 'הוסף בוחן חיצוני' : 'Add External Examiner'}
          </button>
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
        >
          {submitting ? '…' : lang === 'he' ? 'שלח המלצה לרכז' : 'Send Recommendation to Coordinator'}
        </button>
      </div>
    </div>
  );
}
