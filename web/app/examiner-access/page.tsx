'use client';

// app/examiner-access/page.tsx
// Ported from mobile/app/examiner-access.tsx, split across this file plus
// OtpGate.tsx / OpinionForm.tsx / DefenseDateSection.tsx.
// Public screen — no Firebase Auth required. External examiners arrive via:
//   https://<web-origin>/examiner-access?token=<uuid>
//
// Flow:
//   1. Load → validate token from Firestore (throws permission-denied if the
//      second-factor OTP hasn't been verified yet — see lib/examinerTokens.ts)
//   2. If pending   → show Accept / Decline
//   3. If accepted  → show thesis download + defense-date section + opinion form
//   4. If submitted → show confirmation (read-only)
//   5. If declined / expired / invalid → show appropriate message

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Timestamp } from 'firebase/firestore';
import {
  getExaminerToken,
  recordTokenOpened,
  recordThesisDownload,
  acceptExaminerToken,
  declineExaminerToken,
  effectiveStatus,
  daysUntilExpiry,
  type ExaminerTokenDoc,
} from '@/lib/examinerTokens';
import { useLanguage } from '@/contexts/LanguageContext';
import type { Lang } from '@/lib/i18n';
import { LanguageToggle } from '@/components/LanguageToggle';
import { OtpGate } from './OtpGate';
import { OpinionForm } from './OpinionForm';
import { DefenseDateSection } from './DefenseDateSection';
import type { ExaminerAccessPhase } from './types';

function formatDate(ts: Timestamp | null | undefined, lang: 'he' | 'en'): string {
  if (!ts) return '';
  return ts.toDate().toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB');
}

function formatDateTime(ts: Timestamp | null | undefined, lang: 'he' | 'en'): string {
  if (!ts) return '';
  return ts.toDate().toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB');
}

function ExaminerAccessContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { lang, t } = useLanguage();

  const [phase, setPhase] = useState<ExaminerAccessPhase>('loading');
  const [tokenDoc, setTokenDoc] = useState<ExaminerTokenDoc | null>(null);

  const [declineReason, setDeclineReason] = useState('');
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadToken = useCallback(async () => {
    if (!token) {
      setPhase('invalid');
      return;
    }
    try {
      const doc = await getExaminerToken(token);
      if (!doc) {
        setPhase('invalid');
        return;
      }

      setTokenDoc(doc);
      const status = effectiveStatus(doc);

      if (status === 'expired') {
        setPhase('expired');
        return;
      }
      if (status === 'declined') {
        setPhase('declined');
        return;
      }
      if (status === 'submitted') {
        setPhase('submitted');
        return;
      }
      if (status === 'accepted') {
        setPhase('accepted');
        return;
      }
      // default: 'pending'
      setPhase('pending');

      // Record the open action (fire-and-forget — don't block the UI).
      recordTokenOpened(token).catch(() => {});
    } catch (e: unknown) {
      // A denied read means the second-factor code hasn't been verified yet
      // (see firestore.rules) — that's the expected first-visit state, not
      // an error. Anything else (network, unexpected) falls through to the
      // generic error phase.
      if ((e as { code?: string })?.code === 'permission-denied') {
        setPhase('otp_required');
        return;
      }
      console.error('examiner-access: load error', e);
      setPhase('error');
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot load on mount (and again after OTP verification); loadToken()'s setState calls happen after its awaited Firestore read resolves, not synchronously in this effect
    loadToken();
  }, [loadToken]);

  const handleOtpVerified = () => {
    setPhase('loading');
    loadToken();
  };

  const handleAccept = async () => {
    if (!token) return;
    setActionBusy(true);
    setActionError('');
    try {
      await acceptExaminerToken(token);
      setPhase('accepted');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  };

  const handleDecline = async () => {
    if (!token) return;
    if (!declineReason.trim()) {
      setActionError(t('examinerDeclineReasonRequiredBody'));
      return;
    }
    setActionBusy(true);
    setActionError('');
    try {
      await declineExaminerToken(token, declineReason.trim());
      setPhase('declined');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
      setShowDeclineForm(false);
    }
  };

  const handleDownloadThesis = async () => {
    if (!tokenDoc?.thesisUrl || !token) return;
    try {
      await recordThesisDownload(token);
      window.open(tokenDoc.thesisUrl, '_blank', 'noopener,noreferrer');
    } catch {
      setActionError(t('examinerCouldNotOpenFile'));
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return <p className="text-sm text-muted">{t('examinerLinkLoading')}</p>;
  }

  // ── Invalid / Error ──────────────────────────────────────────────────────
  if (phase === 'invalid' || phase === 'error') {
    return (
      <div className="max-w-sm text-center">
        <span className="text-4xl">🔗</span>
        <h1 className="mt-2 text-xl font-semibold text-ink">{t('examinerLinkExpired')}</h1>
        <p className="mt-2 text-sm text-muted">{t('examinerInvalidBody')}</p>
      </div>
    );
  }

  // ── One-time email code (second factor) ─────────────────────────────────
  if (phase === 'otp_required' && token) {
    return <OtpGate token={token} onVerified={handleOtpVerified} />;
  }

  // ── Expired ──────────────────────────────────────────────────────────────
  if (phase === 'expired') {
    return (
      <div className="max-w-sm text-center">
        <span className="text-4xl">⏰</span>
        <h1 className="mt-2 text-xl font-semibold text-ink">{t('examinerLinkExpired')}</h1>
        <p className="mt-2 text-sm text-muted">{t('examinerExpiredBody')}</p>
      </div>
    );
  }

  // ── Declined ─────────────────────────────────────────────────────────────
  if (phase === 'declined') {
    return (
      <div className="max-w-sm text-center">
        <span className="text-4xl">✋</span>
        <h1 className="mt-2 text-xl font-semibold text-ink">{t('examinerDeclined')}</h1>
        <p className="mt-2 text-sm text-muted">{t('examinerDeclinedBody')}</p>
      </div>
    );
  }

  // ── Submitted ────────────────────────────────────────────────────────────
  if (phase === 'submitted') {
    return (
      <div className="max-w-sm text-center">
        <span className="text-4xl">✅</span>
        <h1 className="mt-2 text-xl font-semibold text-ink">{t('examinerOpinionSent')}</h1>
        <p className="mt-2 text-sm text-muted">{t('examinerSubmittedBody')}</p>
        {tokenDoc?.submittedAt && (
          <p className="mt-3 inline-block rounded-full bg-surface px-3 py-1 text-xs text-muted">
            {t('examinerOpinionSubmittedAt')} {formatDateTime(tokenDoc.submittedAt, lang)}
          </p>
        )}
      </div>
    );
  }

  // ── PENDING ──────────────────────────────────────────────────────────────
  if (phase === 'pending') {
    return (
      <div className="w-full max-w-md">
        <TokenHeader tokenDoc={tokenDoc} lang={lang} t={t} />

        {!!actionError && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{actionError}</p>}

        {!showDeclineForm ? (
          <div className="mt-5 grid gap-2.5">
            <button
              type="button"
              onClick={handleAccept}
              disabled={actionBusy}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
            >
              {actionBusy ? '…' : `✅ ${t('examinerAccept')}`}
            </button>
            <button
              type="button"
              onClick={() => setShowDeclineForm(true)}
              disabled={actionBusy}
              className="w-full rounded-lg border border-line bg-surface py-2.5 text-sm font-semibold text-ink hover:bg-paper disabled:opacity-60"
            >
              ✋ {t('examinerDecline')}
            </button>
          </div>
        ) : (
          <div className="mt-5">
            <label className="mb-1.5 block text-sm font-medium text-ink">{t('examinerDeclineReason')}</label>
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              rows={4}
              dir={lang === 'he' ? 'rtl' : 'ltr'}
              placeholder={t('examinerDeclineReasonPlaceholder')}
              className="w-full resize-y rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
            />
            <button
              type="button"
              onClick={handleDecline}
              disabled={actionBusy}
              className="mt-3 w-full rounded-lg bg-danger py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {actionBusy ? '…' : t('examinerDecline')}
            </button>
            <button
              type="button"
              onClick={() => setShowDeclineForm(false)}
              className="mt-2 w-full text-center text-sm text-muted hover:text-ink"
            >
              {t('cancel')}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── ACCEPTED — thesis download + defense date + opinion form ─────────────
  return (
    <div className="w-full max-w-md">
      <TokenHeader tokenDoc={tokenDoc} lang={lang} t={t} />

      <p className="mt-4 rounded-md bg-success-bg px-3 py-2 text-center text-sm font-medium text-success">
        ✅ {t('examinerAccepted')}
      </p>

      <div className="mt-5 rounded-[var(--radius)] border border-line bg-surface p-4 text-start shadow-sm">
        <h2 className="text-base font-semibold text-ink">{t('examinerViewThesis')}</h2>
        <button
          type="button"
          onClick={handleDownloadThesis}
          className="mt-3 w-full rounded-lg border border-line bg-paper py-2.5 text-sm font-semibold text-ink hover:border-primary hover:text-primary"
        >
          📄 {t('examinerDownloadThesis')}
        </button>
      </div>

      {!!actionError && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{actionError}</p>}

      {token && <DefenseDateSection token={token} />}

      {token && <OpinionForm token={token} examinerName={tokenDoc?.examinerName ?? ''} onSubmitted={() => setPhase('submitted')} />}
    </div>
  );
}

type TFunc = ReturnType<typeof useLanguage>['t'];

// ── Shared header (pending + accepted phases) — a top-level component,
// not one declared inline inside ExaminerAccessContent's render, so it
// doesn't get torn down and recreated (with fresh state) on every render.
function TokenHeader({ tokenDoc, lang, t }: { tokenDoc: ExaminerTokenDoc | null; lang: Lang; t: TFunc }) {
  return (
    <div className="text-center">
      <h1 className="text-xl font-semibold text-ink">{t('examinerLinkTitle')}</h1>
      <p className="mt-1 text-sm text-muted">{t('examinerLinkSubtitle')}</p>

      <div
        className="role-rail mt-4 rounded-[var(--radius)] border border-line bg-surface p-4 text-start shadow-sm"
        style={{ '--rail-color': 'var(--primary)' } as React.CSSProperties}
      >
        <InfoRow label={t('examinerNameLabel')} value={tokenDoc?.examinerName ?? ''} />
        <InfoRow label={t('examinerThesisTitle')} value={tokenDoc?.thesisTitle ?? ''} />
        <InfoRow label={t('examinerStudentLabel')} value={tokenDoc?.studentName ?? ''} />
        {tokenDoc?.expiresAt && (
          <InfoRow
            label={t('examinerDeadline')}
            value={`${formatDate(tokenDoc.expiresAt, lang)} · ${daysUntilExpiry(tokenDoc)} ${t('examinerDaysLeft')}`}
            accent
          />
        )}
      </div>

      <p className="mt-3 text-xs text-muted">🔒 {t('examinerAccessLog')}</p>
    </div>
  );
}

function InfoRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className={`text-sm ${accent ? 'font-semibold text-accent' : 'text-ink'}`}>{value}</span>
    </div>
  );
}

export default function ExaminerAccessPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="flex justify-end p-4">
        <LanguageToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16">
        <Suspense fallback={<p className="mt-16 text-sm text-muted">…</p>}>
          <ExaminerAccessContent />
        </Suspense>
      </main>
    </div>
  );
}
