'use client';

// app/student/home/PendingScreen.tsx
// Ported from mobile/app/(tabs)/Pendingscreen.tsx.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { PendingApplication } from './types';

interface PendingScreenProps {
  application: PendingApplication;
  onWithdrawn: () => void;
}

export function PendingScreen({ application, onWithdrawn }: PendingScreenProps) {
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

  const steps = [
    { he: 'המנחה בודק את קורות החיים וגיליון הציונים שלך', en: 'The supervisor reviews your CV and transcript' },
    {
      he: isMeetingRequested ? 'המנחה ביקש להיפגש — תאם פגישה בהקדם' : 'המנחה יאשר, ידחה, או יבקש להיפגש',
      en: isMeetingRequested ? 'The supervisor wants to meet — schedule a meeting' : 'The supervisor will approve, reject, or request a meeting',
    },
    { he: 'תקבל/י התראה באפליקציה ובמייל עם קבלת תשובה', en: 'You will receive an in-app and email notification with the decision' },
    { he: 'עם אישור — הפרויקט יוצא לדרך!', en: 'Upon approval — the project begins!' },
  ];

  return (
    <div className="mx-auto max-w-lg">
      <div className="flex flex-col items-center py-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-paper text-3xl">⏳</span>
        <h2 className="mt-4 text-lg font-semibold text-ink">{lang === 'he' ? 'המועמדות שלך נשלחה' : 'Your Application is In'}</h2>
        <p className="mt-1 text-sm text-muted">{lang === 'he' ? 'המנחה יבחן אותה בהקדם' : 'The supervisor will review it soon'}</p>
      </div>

      {isMeetingRequested && (
        <div className="mb-4 rounded-lg border border-accent bg-[#FBF3E3] p-3 text-sm text-ink">
          📅 {lang === 'he'
            ? 'המנחה ביקש להיפגש איתך לפני אישור המועמדות. יש לתאם פגישה.'
            : 'The supervisor has requested a meeting before approving your application. Please arrange a meeting.'}
        </div>
      )}

      <div className="rounded-[var(--radius)] border border-line bg-surface p-4">
        <Row label={lang === 'he' ? 'פרויקט' : 'Project'} value={lang === 'he' ? application.projectTitleHe : application.projectTitleEn} />
        <div className="my-2 border-t border-line" />
        <Row label={lang === 'he' ? 'הוגש בתאריך' : 'Submitted on'} value={submittedDate} />
        <div className="my-2 border-t border-line" />
        <Row
          label={lang === 'he' ? 'סטטוס' : 'Status'}
          value={isMeetingRequested ? (lang === 'he' ? '📅 נדרשת פגישה' : '📅 Meeting Requested') : lang === 'he' ? '⏳ ממתין לאישור' : '⏳ Awaiting Review'}
          highlight
        />
      </div>

      <div className="mt-4 rounded-[var(--radius)] border border-line bg-surface p-4">
        <p className="mb-3 text-sm font-semibold text-ink">{lang === 'he' ? 'מה קורה עכשיו?' : 'What happens next?'}</p>
        <div className="grid gap-3">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-ink">
                {i + 1}
              </span>
              <p className="text-sm text-ink">{lang === 'he' ? step.he : step.en}</p>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="mt-4 w-full rounded-lg border border-danger px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger-bg"
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

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-sm font-medium ${highlight ? 'text-primary' : 'text-ink'}`}>{value}</span>
    </div>
  );
}
