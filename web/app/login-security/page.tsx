'use client';

// app/login-security/page.tsx
// Ported from mobile/app/login-security.tsx.
// Public screen — no Firebase Auth required (the whole point: the account
// this incident is about is disabled until answered here).
// Arrives via:
//   https://<web-origin>/login-security?code=<code>
//
// Deliberately server-mediated only (see server/src/services/loginSecurity.ts)
// — unlike /examiner-access, this screen never reads/writes Firestore
// directly; every step goes through the public Express API since resolving
// an incident always requires an Admin-SDK action (re-enable the account,
// issue a temp password, or notify admins).

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';

interface IncidentSummary {
  email: string;
  ip: string;
  location: string;
  dateTime: string;
  status: 'pending' | 'confirmed_owner' | 'confirmed_attacker' | 'expired';
}

function LoginSecurityContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const { t } = useLanguage();

  const [phase, setPhase] = useState<'loading' | 'pending' | 'resolved' | 'invalid'>('loading');
  const [incident, setIncident] = useState<IncidentSummary | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [outcome, setOutcome] = useState<'owner' | 'attacker' | null>(null);

  const load = useCallback(async () => {
    if (!code) {
      setPhase('invalid');
      return;
    }
    try {
      const data = await apiClient.getLoginSecurityIncident(code) as IncidentSummary;
      setIncident(data);
      setPhase(data.status === 'pending' ? 'pending' : 'resolved');
    } catch {
      setPhase('invalid');
    }
  }, [code]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot load on mount; load()'s setState calls happen after its awaited network call resolves, not synchronously in this effect
    load();
  }, [load]);

  const respond = async (decision: 'owner' | 'attacker') => {
    if (!code || actionBusy) return;
    setActionBusy(true);
    try {
      await apiClient.confirmLoginSecurityIncident(code, decision);
      setOutcome(decision);
      setPhase('resolved');
    } catch {
      // Leave phase as-is so the buttons stay available to retry.
    } finally {
      setActionBusy(false);
    }
  };

  if (phase === 'loading') {
    return <p className="text-sm text-muted">{t('loading')}</p>;
  }

  if (phase === 'invalid') {
    return (
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold text-ink">{t('loginSecurityInvalidTitle')}</h1>
        <p className="mt-2 text-sm text-muted">{t('loginSecurityInvalidBody')}</p>
      </div>
    );
  }

  if (phase === 'resolved') {
    const isExpired = incident?.status === 'expired' && !outcome;
    const isOwner = outcome === 'owner' || incident?.status === 'confirmed_owner';
    const isAttacker = outcome === 'attacker' || incident?.status === 'confirmed_attacker';

    const title = isExpired
      ? t('loginSecurityExpiredTitle')
      : isOwner
        ? t('loginSecurityOwnerTitle')
        : isAttacker
          ? t('loginSecurityAttackerTitle')
          : t('loginSecurityAnsweredTitle');

    const body = isOwner ? t('loginSecurityOwnerBody') : isAttacker ? t('loginSecurityAttackerBody') : t('loginSecurityNoActionBody');

    return (
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {!isExpired && <p className="mt-2 text-sm text-muted">{body}</p>}
      </div>
    );
  }

  // phase === 'pending'
  return (
    <div className="w-full max-w-sm">
      <h1 className="text-xl font-semibold text-ink">{t('loginSecurityNoticedTitle')}</h1>
      <p className="mt-3 text-sm text-ink">
        <span className="font-medium">{t('loginSecurityAccountLabel')}</span> {incident?.email}
      </p>

      <div className="mt-3 rounded-[var(--radius)] border border-line bg-surface p-4 text-sm text-muted">
        <p>
          <span className="font-medium text-ink">{t('loginSecurityWhenLabel')}</span> {incident?.dateTime}
        </p>
        <p className="mt-1">
          <span className="font-medium text-ink">{t('loginSecurityIpLabel')}</span> {incident?.ip}
        </p>
        {!!incident?.location && (
          <p className="mt-1">
            <span className="font-medium text-ink">{t('loginSecurityLocationLabel')}</span> {incident.location}
          </p>
        )}
      </div>

      <p className="mt-5 text-center text-base font-medium text-ink">{t('loginSecurityQuestion')}</p>

      <button
        type="button"
        onClick={() => respond('owner')}
        disabled={actionBusy}
        className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
      >
        {actionBusy ? '…' : t('loginSecurityYesBtn')}
      </button>
      <button
        type="button"
        onClick={() => respond('attacker')}
        disabled={actionBusy}
        className="mt-2.5 w-full rounded-lg border border-line bg-surface py-2.5 text-sm font-semibold text-danger hover:bg-danger-bg disabled:opacity-60"
      >
        {actionBusy ? '…' : t('loginSecurityNoBtn')}
      </button>
    </div>
  );
}

export default function LoginSecurityPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="flex justify-end p-4">
        <LanguageToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <Suspense fallback={<p className="text-sm text-muted">…</p>}>
          <LoginSecurityContent />
        </Suspense>
      </main>
    </div>
  );
}
