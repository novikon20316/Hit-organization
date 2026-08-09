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

  const submittedDate = application.submittedAt
    ? new Date(application.submittedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
  const isMeetingRequested = application.status === 'meeting_requested';

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

  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">{lang === 'he' ? application.projectTitleHe : application.projectTitleEn}</p>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            isMeetingRequested ? 'bg-[#FBF3E3] text-accent' : 'bg-paper text-ink'
          }`}
        >
          {isMeetingRequested ? (lang === 'he' ? '📅 נדרשת פגישה' : '📅 Meeting Requested') : lang === 'he' ? '⏳ ממתין לאישור' : '⏳ Awaiting Review'}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {lang === 'he' ? 'הוגש בתאריך' : 'Submitted on'} {submittedDate}
      </p>

      {isMeetingRequested && (
        <p className="mt-2 rounded-lg border border-accent bg-[#FBF3E3] p-2.5 text-xs text-ink">
          📅 {lang === 'he'
            ? 'המנחה ביקש להיפגש איתך לפני אישור המועמדות. יש לתאם פגישה.'
            : 'The supervisor has requested a meeting before approving your application. Please arrange a meeting.'}
        </p>
      )}

      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="mt-3 rounded-lg border border-danger px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-bg"
      >
        {lang === 'he' ? 'משוך מועמדות' : 'Withdraw Application'}
      </button>

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
    </div>
  );
}
