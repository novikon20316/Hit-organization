'use client';

// app/administrative_secretary/dashboard/SendExaminerModal.tsx
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { createExaminerToken } from '@/lib/createExaminerToken';
import type { ProjectGroup } from './types';

interface SendExaminerModalProps {
  group: ProjectGroup;
  coordinatorUid: string;
  coordinatorName: string;
  onClose: () => void;
}

export function SendExaminerModal({ group, coordinatorUid, coordinatorName, onClose }: SendExaminerModalProps) {
  const { lang } = useLanguage();
  const [examinerName, setExaminerName] = useState('');
  const [examinerEmail, setExaminerEmail] = useState('');
  const [examinerInstitution, setExaminerInstitution] = useState('');
  const [examinerLanguage, setExaminerLanguage] = useState<'he' | 'en'>('he');
  const [thesisUrl, setThesisUrl] = useState('');
  const [reviewDays, setReviewDays] = useState('30');
  const [sending, setSending] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!examinerName.trim() || !examinerEmail.trim()) {
      setError(lang === 'he' ? 'יש להזין שם ומייל של הבוחן' : 'Please enter examiner name and email');
      return;
    }
    setSending(true);
    setError('');
    try {
      const { link } = await createExaminerToken({
        milestoneId: group.currentMilestone,
        projectId: group.id,
        studentId: group.members[0]?.uid ?? '',
        studentName: group.members.map((m) => m.name).join(', '),
        thesisTitle: group.projectTitle,
        thesisUrl: thesisUrl.trim(),
        examinerName: examinerName.trim(),
        examinerEmail: examinerEmail.trim(),
        examinerInstitution: examinerInstitution.trim(),
        examinerLanguage,
        reviewDays: parseInt(reviewDays, 10) || 30,
        opinionVisible: true,
        opinionAnonymous: false,
        createdByUid: coordinatorUid,
        createdByName: coordinatorName,
      });
      setGeneratedLink(link);
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שגיאה ביצירת הקישור' : 'Failed to create the link');
    } finally {
      setSending(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">📧 {lang === 'he' ? 'שלח בוחן חיצוני' : 'Send External Examiner'}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>

        <div className="mt-3 rounded-lg bg-paper p-3">
          <p className="text-sm font-semibold text-ink">{group.projectTitle}</p>
          <p className="mt-0.5 text-xs text-muted">👥 {group.members.map((m) => m.name).join(', ')}</p>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'שם הבוחן *' : 'Examiner name *'}</span>
            <input value={examinerName} onChange={(e) => setExaminerName(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'דוא"ל *' : 'Email *'}</span>
            <input dir="ltr" value={examinerEmail} onChange={(e) => setExaminerEmail(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'מוסד' : 'Institution'}</span>
            <input value={examinerInstitution} onChange={(e) => setExaminerInstitution(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'קישור לעבודה (URL)' : 'Thesis URL'}</span>
            <input dir="ltr" value={thesisUrl} onChange={(e) => setThesisUrl(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'ימי שיפוט' : 'Review days'}</span>
            <input type="number" value={reviewDays} onChange={(e) => setReviewDays(e.target.value)} className={inputCls} />
          </label>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'שפה מועדפת' : 'Preferred Language'}</span>
            <div className="flex gap-1.5">
              {(['he', 'en'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setExaminerLanguage(l)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                    examinerLanguage === l ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink'
                  }`}
                >
                  {l === 'he' ? 'עברית' : 'English'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {generatedLink && (
          <div className="mt-4 rounded-lg bg-success-bg p-3">
            <p className="text-xs font-semibold text-success">🔗 {lang === 'he' ? 'קישור הבוחן:' : 'Examiner link:'}</p>
            <p className="mt-1 select-all break-all text-xs text-ink" dir="ltr">
              {generatedLink}
            </p>
          </div>
        )}

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
        >
          {sending ? '…' : generatedLink ? (lang === 'he' ? 'שלח שוב' : 'Resend') : lang === 'he' ? '📧 צור קישור' : '📧 Create Link'}
        </button>
      </div>
    </div>
  );
}
