'use client';

// app/admin/panel/Enforce2FAModal.tsx
// system_admin action: announce a grace-period deadline after which every
// user must have two-factor authentication set up. Activating bulk-notifies
// every existing user (in-app + email, bilingual Hebrew/English instructions)
// — see server/src/controllers/twoFactorEnforcementController.ts. Modeled on
// MaintenanceModal.tsx (same "current status + activate/cancel" shape).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';

interface Enforce2FAModalProps {
  onClose: () => void;
  onSaved?: () => void;
}

interface Status {
  active: boolean;
  announcedAt: string | null;
  deadline: string | null;
  createdBy: string | null;
}

const DAY_OPTIONS = [1, 2, 3, 5, 7, 10, 14, 21, 30];

function daysRemaining(deadline: string | null): number | null {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export function Enforce2FAModal({ onClose, onSaved }: Enforce2FAModalProps) {
  const { lang } = useLanguage();
  const isHe = lang === 'he';

  const [status, setStatus] = useState<Status | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [graceDays, setGraceDays] = useState(7);
  const [activating, setActivating] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [error, setError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(modalRef, true, onClose);

  const refreshStatus = async () => {
    setStatusLoading(true);
    try {
      setStatus(await apiClient.getTwoFactorEnforcementStatus());
    } catch {
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  const remaining = useMemo(() => daysRemaining(status?.deadline ?? null), [status]);
  const pastDeadline = remaining !== null && remaining <= 0;

  const previewText = useMemo(() => {
    if (isHe) {
      return (
        `🔐 אימות דו-שלבי (2FA) יהפוך לחובה בעוד ${graceDays} ${graceDays === 1 ? 'יום' : 'ימים'}\n\n` +
        `החל מהתאריך שנקבע, המערכת תחייב אימות דו-שלבי (2FA) לכל המשתמשים. מומלץ להגדיר זאת כבר עכשיו.\n` +
        `איך להפעיל: היכנסו ל"אימות דו-שלבי" בהגדרות ← סרקו את קוד ה-QR באמצעות Google Authenticator ← הזינו את הקוד בן 6 הספרות.`
      );
    }
    return (
      `🔐 Two-Factor Authentication (2FA) Becomes Mandatory in ${graceDays} ${graceDays === 1 ? 'day' : 'days'}\n\n` +
      `Starting on the deadline date, the system will require 2FA for every user. We recommend setting it up now.\n` +
      `How to enable it: open "Two-Factor Authentication" in Settings → scan the QR code using Google Authenticator → enter the 6-digit code.`
    );
  }, [graceDays, isHe]);

  const handleActivate = async () => {
    setActivating(true);
    setError('');
    try {
      await apiClient.activateTwoFactorEnforcement(graceDays);
      await refreshStatus();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : isHe ? 'הפעלת האכיפה נכשלה' : 'Failed to activate enforcement');
    } finally {
      setActivating(false);
    }
  };

  const handleDeactivate = async () => {
    setDeactivating(true);
    setError('');
    try {
      await apiClient.deactivateTwoFactorEnforcement();
      await refreshStatus();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : isHe ? 'ביטול האכיפה נכשל' : 'Failed to cancel enforcement');
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg outline-none"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">🔐 {isHe ? 'אכיפת אימות דו-שלבי (2FA)' : 'Enforce Two-Factor Authentication (2FA)'}</h2>
          <button type="button" onClick={onClose} aria-label={isHe ? 'סגור' : 'Close'} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          {isHe
            ? 'כל המשתמשים יקבלו הודעה (במערכת + אימייל) בעברית ובאנגלית, עם הסבר כיצד להפעיל. בתום התקופה, מי שלא הגדיר יחויב לסרוק קוד QR לפני המשך שימוש.'
            : 'Every user gets a notice (in-app + email) in Hebrew and English explaining how to enable it. Once the deadline passes, anyone who hasn\'t set it up will be required to scan a QR code before continuing.'}
        </p>

        <div className="mt-4 rounded-lg bg-paper p-3">
          {statusLoading ? (
            <p className="text-xs text-muted">{isHe ? 'טוען סטטוס…' : 'Loading status…'}</p>
          ) : status?.active ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">
                  {isHe ? 'אכיפה פעילה — ' : 'Enforcement active — '}
                  <span className={pastDeadline ? 'text-danger' : 'text-success'}>
                    {pastDeadline
                      ? (isHe ? 'המועד עבר, החסימה פעילה' : 'deadline passed, block is active')
                      : (isHe ? `${remaining} ${remaining === 1 ? 'יום נותר' : 'ימים נותרו'}` : `${remaining} ${remaining === 1 ? 'day' : 'days'} left`)}
                  </span>
                </p>
                {status.deadline && (
                  <p className="mt-0.5 text-xs text-muted">
                    {isHe ? 'תאריך יעד: ' : 'Deadline: '}
                    {new Date(status.deadline).toLocaleDateString(isHe ? 'he-IL' : 'en-US')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={deactivating}
                className="rounded-lg border border-danger px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger-bg disabled:opacity-60"
              >
                {deactivating ? '…' : isHe ? 'בטל אכיפה' : 'Cancel enforcement'}
              </button>
            </div>
          ) : (
            <p className="text-sm text-ink">{isHe ? 'אין אכיפה פעילה כרגע' : 'No enforcement currently active'}</p>
          )}
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-1.5 text-sm font-medium text-ink">⏳ {isHe ? 'תקופת התארגנות' : 'Grace period'}</p>
          <div className="flex flex-wrap gap-1.5">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setGraceDays(d)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  graceDays === d ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink'
                }`}
              >
                {d} {isHe ? (d === 1 ? 'יום' : 'ימים') : d === 1 ? 'day' : 'days'}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-paper p-3">
          <p className="mb-1 text-xs font-semibold text-muted">👁️ {isHe ? 'מה המשתמשים יקבלו' : 'What users will receive'}</p>
          <p className="whitespace-pre-line text-xs text-ink">{previewText}</p>
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
            {isHe ? 'סגור' : 'Close'}
          </button>
          <button
            type="button"
            onClick={handleActivate}
            disabled={activating}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
          >
            {activating
              ? '…'
              : status?.active
                ? isHe
                  ? `🔄 עדכן ל-${graceDays} ימים ושלח שוב`
                  : `🔄 Update to ${graceDays} days & re-notify`
                : isHe
                  ? `🚀 הפעל ושלח לכולם`
                  : `🚀 Activate & notify everyone`}
          </button>
        </div>
      </div>
    </div>
  );
}
