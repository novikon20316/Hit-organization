'use client';

// app/maintenance/page.tsx
// Ported from mobile/app/(tabs)/Maintenance.tsx. Several auth pages
// (login, verify-2fa, change-password — see useMaintenanceCheck.ts) already
// redirect here with `?title=...&endsAt=...` once a signed-in, non-admin
// user hits an active maintenance window; this page just needed to exist.
//
// useSearchParams() forces this static route into client-side rendering at
// the Suspense boundary during prerendering (Next.js requirement) — same
// pattern as app/defense-access/page.tsx.

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import type { MaintenanceStatus } from '@/hooks/useMaintenanceCheck';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';

function msToCountdown(ms: number): { h: string; m: string; s: string } {
  if (ms <= 0) return { h: '00', m: '00', s: '00' };
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { h: pad(h), m: pad(m), s: pad(s) };
}

function formatEndsAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function MaintenanceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { logout } = useAuth();
  const { lang } = useLanguage();

  const [title, setTitle] = useState(searchParams.get('title') || (lang === 'he' ? 'תחזוקה מתוכננת' : 'Scheduled maintenance'));
  const [endsAt, setEndsAt] = useState<string | null>(searchParams.get('endsAt') || null);
  const [msLeft, setMsLeft] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!endsAt) return;
    const target = new Date(endsAt).getTime();
    const tick = () => setMsLeft(Math.max(0, target - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  const pollStatus = useCallback(async () => {
    setChecking(true);
    try {
      const res = await apiClient.get<MaintenanceStatus>('/api/system/maintenance-status');
      if (!res.isActive) {
        router.replace('/login');
        return;
      }
      if (res.title) setTitle(res.title);
      if (res.endsAt) setEndsAt(res.endsAt);
    } catch {
      // Silent — keep showing the screen; fail open on the next poll.
    } finally {
      setChecking(false);
    }
  }, [router]);

  useEffect(() => {
    const id = setInterval(pollStatus, 60_000);
    return () => clearInterval(id);
  }, [pollStatus]);

  const handleSignOut = async () => {
    await logout();
    router.replace('/login');
  };

  const countdown = msLeft !== null ? msToCountdown(msLeft) : null;
  const isFinished = msLeft !== null && msLeft <= 0;

  return (
    <div className="w-full max-w-sm text-center">
      <span className="text-4xl">🛠️</span>
      <h1 className="mt-2 text-xl font-semibold text-ink">{lang === 'he' ? 'המערכת בתחזוקה' : 'Under Maintenance'}</h1>
      <p className="mt-1 text-sm font-medium text-ink">{title}</p>
      <p className="mt-3 text-sm text-muted">
        {lang === 'he'
          ? 'אנו מבצעים תחזוקה מתוכננת כדי לשפר את החוויה שלכם. האפליקציה תחזור לפעול בקרוב.'
          : "We're performing scheduled maintenance to improve your experience. The app will be back online shortly."}
      </p>

      {countdown && !isFinished && (
        <div className="mt-5 rounded-[var(--radius)] border border-line bg-surface p-4">
          <p className="text-xs font-medium text-muted">{lang === 'he' ? 'זמן משוער שנותר' : 'Estimated time remaining'}</p>
          <div className="mt-2 flex items-center justify-center gap-2">
            <CountdownUnit value={countdown.h} label={lang === 'he' ? 'שעות' : 'hours'} />
            <span className="text-lg font-semibold text-muted">:</span>
            <CountdownUnit value={countdown.m} label={lang === 'he' ? 'דקות' : 'min'} />
            <span className="text-lg font-semibold text-muted">:</span>
            <CountdownUnit value={countdown.s} label={lang === 'he' ? 'שניות' : 'sec'} />
          </div>
          {endsAt && <p className="mt-3 text-xs text-muted">{(lang === 'he' ? 'צפוי לחזור עד ' : 'Back online by ') + formatEndsAt(endsAt)}</p>}
        </div>
      )}

      {isFinished && (
        <div className="mt-5 rounded-[var(--radius)] border border-success bg-success-bg p-4">
          <p className="text-sm font-semibold text-success">✅ {lang === 'he' ? 'התחזוקה אמורה להסתיים בקרוב...' : 'Maintenance should be wrapping up…'}</p>
        </div>
      )}

      <button
        type="button"
        onClick={pollStatus}
        disabled={checking}
        className="mt-5 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
      >
        {checking ? '…' : `↻ ${lang === 'he' ? 'בדוק שוב' : 'Check again'}`}
      </button>

      <button type="button" onClick={handleSignOut} className="mt-3 text-sm text-muted hover:text-ink hover:underline">
        {lang === 'he' ? 'התנתקות' : 'Sign out'}
      </button>
    </div>
  );
}

function CountdownUnit({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
    </div>
  );
}

export default function MaintenancePage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="flex justify-end p-4">
        <LanguageToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <Suspense fallback={<p className="text-sm text-muted">…</p>}>
          <MaintenanceContent />
        </Suspense>
      </main>
    </div>
  );
}
