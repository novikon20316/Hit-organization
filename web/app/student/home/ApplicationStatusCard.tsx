'use client';

// app/student/home/ApplicationStatusCard.tsx
// One row per pending application in BrowseProjects' "My Applications" panel
// — extracted from the old full-screen PendingScreen.tsx now that a student
// can have several of these open at once instead of exactly one.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { PendingApplication } from './types';

interface ApplicationStatusCardProps {
  application: PendingApplication;
  onWithdrawn: () => void;
}

export function ApplicationStatusCard({ application, onWithdrawn }: ApplicationStatusCardProps) {
  const { lang, t } = useLanguage();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [error, setError] = useState('');

  const submittedDate = application.submittedAt
    ? new Date(application.submittedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
  const isMeetingRequested = application.status === 'meeting_requested';
  const isAwaitingConfirmation = application.status === 'awaiting_student_confirmation';
  const reviewedDate = application.reviewedAt
    ? new Date(application.reviewedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const handleWithdraw = async () => {
    setBusy(true);
    try {
      await apiClient.withdrawApplication(application.id);
      setConfirmOpen(false);
      onWithdrawn();
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmStart = async (decision: 'yes' | 'no') => {
    setBusy(true);
    setError('');
    try {
      await apiClient.confirmApplicationStart(application.id, decision);
      setDeclineOpen(false);
      onWithdrawn();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'הפעולה נכשלה' : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">{lang === 'he' ? application.projectTitleHe : application.projectTitleEn}</p>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            isAwaitingConfirmation ? 'bg-[var(--success-bg)] text-[#3F6B4C]' : isMeetingRequested ? 'bg-[#FBF3E3] text-accent' : 'bg-paper text-ink'
          }`}
        >
          {isAwaitingConfirmation
            ? (lang === 'he' ? '🎉 אושר — ממתין לאישורך' : '🎉 Approved — awaiting your decision')
            : isMeetingRequested
              ? (lang === 'he' ? '📅 נדרשת פגישה' : '📅 Meeting Requested')
              : (lang === 'he' ? '⏳ ממתין לאישור' : '⏳ Awaiting Review')}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {lang === 'he' ? 'הוגש בתאריך' : 'Submitted on'} {submittedDate}
      </p>

      {reviewedDate && isMeetingRequested && (
        <p className="mt-1 text-xs text-muted">
          {lang === 'he' ? 'המנחה השיב בתאריך' : 'Supervisor answered on'} {reviewedDate}
        </p>
      )}

      {isMeetingRequested && (
        <p className="mt-2 rounded-lg border border-accent bg-[#FBF3E3] p-2.5 text-xs text-ink">
          📅 {lang === 'he'
            ? 'המנחה ביקש להיפגש איתך לפני אישור המועמדות. יש לתאם פגישה.'
            : 'The supervisor has requested a meeting before approving your application. Please arrange a meeting.'}
        </p>
      )}

      {isAwaitingConfirmation && (
        <>
          <p className="mt-2 rounded-lg border border-[#3F6B4C] bg-[var(--success-bg)] p-2.5 text-xs text-ink">
            🎉 {lang === 'he'
              ? 'המנחה אישר את בקשתך! האם ברצונך להתחיל בפרויקט זה? אישור יסגור אוטומטית את שאר הבקשות הממתינות שלך.'
              : "The supervisor approved your application! Do you want to start this project? Confirming will automatically close your other pending applications."}
          </p>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => handleConfirmStart('yes')}
              disabled={busy}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
            >
              {lang === 'he' ? 'כן, התחל בפרויקט' : 'Yes, start this project'}
            </button>
            <button
              type="button"
              onClick={() => setDeclineOpen(true)}
              disabled={busy}
              className="rounded-lg border border-danger px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-bg disabled:opacity-60"
            >
              {lang === 'he' ? 'לא, תודה' : 'No, thanks'}
            </button>
          </div>
        </>
      )}

      {!isAwaitingConfirmation && (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="mt-3 rounded-lg border border-danger px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-bg"
        >
          {lang === 'he' ? 'משוך מועמדות' : 'Withdraw Application'}
        </button>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={lang === 'he' ? 'משיכת מועמדות' : 'Withdraw Application'}
        message={lang === 'he' ? 'האם אתה בטוח שברצונך למשוך את המועמדות?' : 'Are you sure you want to withdraw your application?'}
        confirmLabel={lang === 'he' ? 'משוך' : 'Withdraw'}
        cancelLabel={t('cancel')}
        destructive
        busy={busy}
        onConfirm={handleWithdraw}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={declineOpen}
        title={lang === 'he' ? 'דחיית הפרויקט' : 'Decline the Project'}
        message={
          lang === 'he'
            ? 'האם אתה בטוח שאינך רוצה להתחיל בפרויקט זה? המנחה יקבל התראה על כך.'
            : "Are you sure you don't want to start this project? The supervisor will be notified."
        }
        confirmLabel={lang === 'he' ? 'כן, דחה' : 'Yes, decline'}
        cancelLabel={t('cancel')}
        destructive
        busy={busy}
        onConfirm={() => handleConfirmStart('no')}
        onCancel={() => setDeclineOpen(false)}
      />
    </div>
  );
}
