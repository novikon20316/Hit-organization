'use client';

// app/administrative_coordinator/dashboard/SendExaminerModal.tsx
//
// Previously wrote an examinerTokens doc directly to Firestore from the
// client (lib/createExaminerToken.ts) — that path has no way to check the
// caller's assigned degree scope (Firestore rules gate by role only, not by
// coordinatorScopes), so any administrative coordinator could invite an
// examiner for a project outside her own degree. It also never actually
// emailed the examiner (she had to copy/paste the link herself) and passed
// group.currentMilestone — a display label like "Final Report", not a real
// milestone doc id — as milestoneId.
//
// Now routed through the same POST /api/coordinator/projects/:id/assign-examiners
// endpoint the coordinator's own AssignExaminersModal uses, which already
// enforces withinCoordinatorScope server-side and emails the access link via
// services/examinerAccess.ts.
import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import type { ProjectGroup } from './types';

interface SendExaminerModalProps {
  group: ProjectGroup;
  onClose: () => void;
}

export function SendExaminerModal({ group, onClose }: SendExaminerModalProps) {
  const { lang } = useLanguage();
  const [examinerName, setExaminerName] = useState('');
  const [examinerEmail, setExaminerEmail] = useState('');
  const [examinerInstitution, setExaminerInstitution] = useState('');
  const [examinerLanguage, setExaminerLanguage] = useState<'he' | 'en'>('he');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(modalRef, true, onClose);

  const handleSend = async () => {
    if (!examinerName.trim() || !examinerEmail.trim()) {
      setError(lang === 'he' ? 'יש להזין שם ומייל של הבוחן' : 'Please enter examiner name and email');
      return;
    }
    setSending(true);
    setError('');
    try {
      const result = await apiClient.assignExaminers(group.id, {
        // Existing internal examiners must be re-sent — the endpoint
        // replaces the project's whole examiner panel with what's passed
        // here, so omitting them would silently unassign them.
        examiners: [
          ...group.existingExaminerIds.map((uid) => ({ type: 'internal' as const, uid })),
          { type: 'external' as const, name: examinerName.trim(), email: examinerEmail.trim(), institution: examinerInstitution.trim() },
        ],
        ...(group.currentMilestoneId ? { milestoneId: group.currentMilestoneId } : {}),
        lang: examinerLanguage,
      });
      if (result.externalFailed.length > 0) {
        setError(
          lang === 'he'
            ? 'הבקשה נשמרה אך שליחת המייל לבוחן נכשלה — נסה שוב מאוחר יותר'
            : 'The request was saved, but the email to the examiner failed to send — please try again later.',
        );
        return;
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שגיאה בשליחת הבקשה' : 'Failed to send the request');
    } finally {
      setSending(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-low px-3 py-2 text-sm text-administrative-coordinator-on-surface focus:border-administrative-coordinator-primary focus:bg-administrative-coordinator-surface-container-lowest focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-administrative-coordinator-lg bg-administrative-coordinator-surface-container-lowest p-6 shadow-lg outline-none"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-administrative-coordinator-on-surface">📧 {lang === 'he' ? 'שלח בוחן חיצוני' : 'Send External Examiner'}</h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-administrative-coordinator-on-surface-variant hover:text-administrative-coordinator-on-surface">
            ✕
          </button>
        </div>

        <div className="mt-3 rounded-lg bg-administrative-coordinator-surface-container-low p-3">
          <p className="text-sm font-semibold text-administrative-coordinator-on-surface">{group.projectTitle}</p>
          <p className="mt-0.5 text-xs text-administrative-coordinator-on-surface-variant">👥 {group.members.map((m) => m.name).join(', ')}</p>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-administrative-coordinator-on-surface">{lang === 'he' ? 'שם הבוחן *' : 'Examiner name *'}</span>
            <input value={examinerName} onChange={(e) => setExaminerName(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-administrative-coordinator-on-surface">{lang === 'he' ? 'דוא"ל *' : 'Email *'}</span>
            <input dir="ltr" value={examinerEmail} onChange={(e) => setExaminerEmail(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-administrative-coordinator-on-surface">{lang === 'he' ? 'מוסד' : 'Institution'}</span>
            <input value={examinerInstitution} onChange={(e) => setExaminerInstitution(e.target.value)} className={inputCls} />
          </label>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-administrative-coordinator-on-surface">{lang === 'he' ? 'שפה מועדפת' : 'Preferred Language'}</span>
            <div className="flex gap-1.5">
              {(['he', 'en'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setExaminerLanguage(l)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                    examinerLanguage === l ? 'border-administrative-coordinator-primary bg-administrative-coordinator-primary text-administrative-coordinator-on-primary' : 'border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-low text-administrative-coordinator-on-surface'
                  }`}
                >
                  {l === 'he' ? 'עברית' : 'English'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {sent && (
          <p className="mt-4 rounded-md bg-success-bg px-3 py-2 text-sm text-success" role="status">
            {lang === 'he' ? '✅ הבקשה נשלחה — קישור הגישה נשלח לבוחן במייל.' : '✅ Sent — the access link was emailed directly to the examiner.'}
          </p>
        )}

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className="mt-4 w-full rounded-lg bg-administrative-coordinator-primary py-2.5 text-sm font-semibold text-administrative-coordinator-on-primary hover:opacity-90 disabled:opacity-60"
        >
          {sending ? '…' : sent ? (lang === 'he' ? 'שלח שוב' : 'Send again') : lang === 'he' ? '📧 שלח בקשה' : '📧 Send Request'}
        </button>
      </div>
    </div>
  );
}
