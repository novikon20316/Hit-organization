'use client';

// app/defense-access/page.tsx
// Ported from mobile/app/defense-access.tsx.
// Public screen — no Firebase Auth required. External examiners arrive via
// a SEPARATE link from /examiner-access (that one is for thesis review;
// this one is defense-day-only access):
//   https://<web-origin>/defense-access?grant=<code>
//
// Access is gated server-side (see examinerAccessController.getDefenseAccessStatus)
// to only the calendar day of the defense, until midnight Asia/Jerusalem —
// the server recomputes this fresh on every load, this screen never decides
// access on its own.
//
// useSearchParams() forces this static route into client-side rendering at
// the Suspense boundary during prerendering (Next.js requirement) — wrapped
// below so the rest of the app shell can still be prerendered.

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';

type GateStatus = 'loading' | 'invalid' | 'not_yet_active' | 'active' | 'expired' | 'error';

interface DefenseAccessInfo {
  examinerName?: string;
  defenseDateISO?: string;
  activatesAt?: string;
  expiresAt?: string;
  projectTitleHe?: string;
  projectTitleEn?: string;
  room?: string | null;
  building?: string | null;
  time?: string | null;
  onlineDefenseLink?: string | null;
}

function DefenseAccessContent() {
  const searchParams = useSearchParams();
  const grant = searchParams.get('grant');
  const { lang, t } = useLanguage();

  const [status, setStatus] = useState<GateStatus>('loading');
  const [info, setInfo] = useState<DefenseAccessInfo | null>(null);

  const load = useCallback(async () => {
    if (!grant) {
      setStatus('invalid');
      return;
    }
    try {
      const res = await apiClient.getDefenseAccessStatus(grant);
      setStatus(res.status);
      setInfo(res);
    } catch (e) {
      console.error('defense-access: load error', e);
      setStatus(e instanceof ApiError && e.status === 404 ? 'invalid' : 'error');
    }
  }, [grant]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot load on mount; load()'s setState calls happen after its awaited network call resolves, not synchronously in this effect
    load();
  }, [load]);

  if (status === 'loading') {
    return <p className="text-sm text-muted">{t('loading')}</p>;
  }

  if (status === 'invalid' || status === 'error') {
    return (
      <div className="max-w-sm text-center">
        <span className="text-4xl">🔗</span>
        <h1 className="mt-2 text-xl font-semibold text-ink">{t('defenseAccessInvalidTitle')}</h1>
        <p className="mt-1 text-sm text-muted">{t('defenseAccessInvalidBody')}</p>
      </div>
    );
  }

  if (status === 'not_yet_active') {
    return (
      <div className="max-w-sm text-center">
        <span className="text-4xl">⏳</span>
        <h1 className="mt-2 text-xl font-semibold text-ink">{t('defenseAccessNotYetTitle')}</h1>
        <p className="mt-1 text-sm text-muted">
          {t('defenseAccessNotYetBody')} {info?.defenseDateISO}
        </p>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="max-w-sm text-center">
        <span className="text-4xl">⏰</span>
        <h1 className="mt-2 text-xl font-semibold text-ink">{t('defenseAccessExpiredTitle')}</h1>
        <p className="mt-1 text-sm text-muted">{t('defenseAccessExpiredBody')}</p>
      </div>
    );
  }

  // ── active ──────────────────────────────────────────────────────────────
  const thesisTitle = lang === 'he' ? info?.projectTitleHe : info?.projectTitleEn;
  const notSet = t('defenseAccessNotSetYet');

  return (
    <div className="w-full max-w-sm text-center">
      <span className="text-4xl">🎓</span>
      <h1 className="mt-2 text-xl font-semibold text-ink">{t('defenseAccessTitle')}</h1>
      <p className="mt-1 text-sm text-muted">
        {t('defenseAccessHello')} {info?.examinerName}
      </p>

      <div
        className="role-rail mt-5 rounded-[var(--radius)] border border-line bg-surface p-4 text-start shadow-sm"
        style={{ '--rail-color': 'var(--primary)' } as React.CSSProperties}
      >
        <InfoRow label={t('projectTitle')} value={thesisTitle} />
        <InfoRow label={t('date')} value={info?.defenseDateISO} />
        <InfoRow label={t('time')} value={info?.time ?? notSet} />
        <InfoRow label={t('defenseRoom')} value={info?.room ?? notSet} />
        <InfoRow label={t('defenseBuilding')} value={info?.building ?? notSet} />
      </div>

      {info?.onlineDefenseLink && (
        <a
          href={info.onlineDefenseLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
        >
          💻 {lang === 'he' ? 'הצטרפות להגנה המקוונת' : 'Join the online defense'}
        </a>
      )}

      <p className="mt-4 text-xs text-muted">{t('defenseAccessFootnote')}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="text-sm text-ink">{value ?? '—'}</span>
    </div>
  );
}

export default function DefenseAccessPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="flex justify-end p-4">
        <LanguageToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <Suspense fallback={<p className="text-sm text-muted">…</p>}>
          <DefenseAccessContent />
        </Suspense>
      </main>
    </div>
  );
}
