'use client';

// app/admin/panel/MaintenanceModal.tsx
// Ported from mobile/components/modals/MaintenanceModal.tsx + panel.tsx's
// saveMaintenance. Mobile's UI also collects a `blockedRoles` selection, but
// POST /api/admin/system/maintenance (maintenanceController.ts) never reads
// or stores that field — every non-system_admin role is blocked regardless
// of what's picked there. Rather than port a selector that quietly does
// nothing, this version drops it entirely; if per-role blocking becomes a
// real backend feature later, add the picker back here.
//
// Web and mobile now have independent maintenance flags (see
// services/maintenanceStatus.ts) — this modal manages BOTH from here via a
// platform selector, shows each platform's current live status, and lets
// you end one early instead of only ever waiting out its timer.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';

interface MaintenanceModalProps {
  onClose: () => void;
  onSaved?: () => void;
}

type Platform = 'web' | 'mobile';

interface PlatformStatus {
  isActive: boolean;
  title: string;
  endsAt: string | null;
}

function formatDuration(d: number, h: number, m: number, lang: 'he' | 'en'): string {
  const parts: string[] = [];
  if (lang === 'he') {
    if (d > 0) parts.push(`${d} ${d === 1 ? 'יום' : 'ימים'}`);
    if (h > 0) parts.push(`${h} ${h === 1 ? 'שעה' : 'שעות'}`);
    if (m > 0) parts.push(`${m} דק'`);
    return parts.length ? parts.join(' ו-') : '0 דקות';
  }
  if (d > 0) parts.push(`${d} ${d === 1 ? 'day' : 'days'}`);
  if (h > 0) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
  if (m > 0) parts.push(`${m} min`);
  return parts.length ? parts.join(' ') : '0 min';
}

const DAY_OPTIONS = Array.from({ length: 8 }, (_, i) => i);
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
const MIN_OPTIONS = [0, 5, 10, 15, 30, 45];
const PLATFORMS: Platform[] = ['web', 'mobile'];

// The blocked-user-facing wording must match which platform is actually
// affected — "אתר"/"website" for web, "אפליקציה"/"app" for mobile (mobile's
// own screen already says this; see mobile/app/(tabs)/Maintenance.tsx and
// mobile/components/modals/MaintenanceModal.tsx). Hebrew grammatical gender
// differs between the two nouns (אתר is masculine, אפליקציה is feminine),
// so the verb forms below aren't just a word swap.
function maintenanceSubject(p: Platform, lang: 'he' | 'en') {
  if (p === 'web') {
    return lang === 'he'
      ? { unavailable: 'האתר לא יהיה זמין', willReturn: 'האתר יחזור לפעול' }
      : { unavailable: 'The website will be unavailable', willReturn: 'The website will be back' };
  }
  return lang === 'he'
    ? { unavailable: 'האפליקציה לא תהיה זמינה', willReturn: 'האפליקציה תחזור לפעול' }
    : { unavailable: 'The app will be unavailable', willReturn: 'The app will be back' };
}

export function MaintenanceModal({ onClose, onSaved }: MaintenanceModalProps) {
  const { lang } = useLanguage();
  const isHe = lang === 'he';

  const [platform, setPlatform] = useState<Platform>('web');
  const [statuses, setStatuses] = useState<Record<Platform, PlatformStatus | null>>({ web: null, mobile: null });
  const [statusLoading, setStatusLoading] = useState(true);
  const [deactivating, setDeactivating] = useState<Platform | null>(null);

  const [title, setTitle] = useState('');
  const [warnDays, setWarnDays] = useState(0);
  const [warnHours, setWarnHours] = useState(2);
  const [warnMinutes, setWarnMinutes] = useState(0);
  const [durDays, setDurDays] = useState(0);
  const [durHours, setDurHours] = useState(4);
  const [durMinutes, setDurMinutes] = useState(0);
  const [broadcastEnabled, setBroadcastEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(modalRef, true, onClose);

  const refreshStatuses = async () => {
    setStatusLoading(true);
    const results = await Promise.all(
      PLATFORMS.map(async (p) => {
        try {
          return [p, await apiClient.getMaintenanceStatusForPlatform(p)] as const;
        } catch {
          return [p, null] as const;
        }
      }),
    );
    setStatuses(Object.fromEntries(results) as Record<Platform, PlatformStatus | null>);
    setStatusLoading(false);
  };

  useEffect(() => {
    refreshStatuses();
  }, []);

  const handleDeactivate = async (p: Platform) => {
    setDeactivating(p);
    setError('');
    try {
      await apiClient.deactivateMaintenanceStatus(p);
      await refreshStatuses();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : isHe ? 'כיבוי מצב התחזוקה נכשל' : 'Failed to end maintenance mode');
    } finally {
      setDeactivating(null);
    }
  };

  const warnLabel = useMemo(() => {
    const total = warnDays * 24 * 60 + warnHours * 60 + warnMinutes;
    if (total === 0) return isHe ? 'ללא אזהרה — ההשבתה תחל מיד' : 'No warning — shutdown begins immediately';
    return isHe ? `ההתראה תישלח ${formatDuration(warnDays, warnHours, warnMinutes, lang)} לפני הסגירה` : `Alert sends ${formatDuration(warnDays, warnHours, warnMinutes, lang)} before shutdown`;
  }, [warnDays, warnHours, warnMinutes, lang, isHe]);

  const durLabel = useMemo(() => {
    const total = durDays * 24 * 60 + durHours * 60 + durMinutes;
    if (total === 0) return isHe ? 'משך לא הוגדר' : 'Duration not set';
    const subj = maintenanceSubject(platform, lang);
    return isHe ? `${subj.willReturn} בעוד ~${formatDuration(durDays, durHours, durMinutes, lang)}` : `${subj.willReturn} in ~${formatDuration(durDays, durHours, durMinutes, lang)}`;
  }, [durDays, durHours, durMinutes, lang, isHe, platform]);

  const previewText = useMemo(() => {
    const effectiveTitle = title || (isHe ? 'תחזוקה מתוכננת' : 'Scheduled maintenance');
    const dur = formatDuration(durDays, durHours, durMinutes, lang);
    const hasDur = durDays + durHours + durMinutes > 0;
    const subj = maintenanceSubject(platform, lang);
    if (isHe) {
      return hasDur
        ? `${effectiveTitle}\n\nאנו מבצעים תחזוקה מתוכננת. ${subj.unavailable} למשך כ-${dur}.\n\nנחזור בקרוב — תודה על הסבלנות.`
        : `${effectiveTitle}\n\nאנו מבצעים תחזוקה מתוכננת.\n\nנחזור בקרוב — תודה על הסבלנות.`;
    }
    return hasDur
      ? `${effectiveTitle}\n\nWe're performing scheduled maintenance. ${subj.unavailable} for approximately ${dur}.\n\nWe'll be back online shortly — thank you for your patience.`
      : `${effectiveTitle}\n\nWe're performing scheduled maintenance.\n\nWe'll be back online shortly — thank you for your patience.`;
  }, [title, durDays, durHours, durMinutes, lang, isHe, platform]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const warnMs = warnDays * 86_400_000 + warnHours * 3_600_000 + warnMinutes * 60_000;
      const durMs = durDays * 86_400_000 + durHours * 3_600_000 + durMinutes * 60_000;
      await apiClient.updateMaintenanceStatus({
        platform,
        title: title.trim() || 'Scheduled Maintenance',
        shutdownAt: Date.now() + warnMs,
        maintenanceDurMs: durMs,
        broadcastEnabled,
      });
      await refreshStatuses();
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : isHe ? 'הפעלת מצב התחזוקה נכשלה' : 'Failed to activate maintenance mode');
    } finally {
      setSaving(false);
    }
  };

  const platformLabel = (p: Platform) => (p === 'web' ? (isHe ? 'אתר' : 'Web') : isHe ? 'אפליקציה' : 'Mobile app');

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
          <h2 className="text-lg font-semibold text-ink">🛠️ {isHe ? 'מצב תחזוקה' : 'Maintenance mode'}</h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          {isHe ? 'אתר ואפליקציה מנוהלים בנפרד — השבתת אחד לא משפיעה על השני' : 'Web and mobile are managed independently — taking one down doesn’t affect the other'}
        </p>

        {/* Current status per platform */}
        <div className="mt-4 grid gap-2">
          {statusLoading ? (
            <p className="text-xs text-muted">{isHe ? 'טוען סטטוס…' : 'Loading status…'}</p>
          ) : (
            PLATFORMS.map((p) => {
              const status = statuses[p];
              return (
                <div key={p} className="flex items-center justify-between rounded-lg bg-paper p-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {platformLabel(p)} —{' '}
                      <span className={status?.isActive ? 'text-danger' : 'text-success'}>
                        {status?.isActive ? (isHe ? 'בתחזוקה' : 'Under maintenance') : isHe ? 'פעיל' : 'Live'}
                      </span>
                    </p>
                    {status?.isActive && (
                      <p className="mt-0.5 text-xs text-muted">
                        {status.title}
                        {status.endsAt ? ` · ${isHe ? 'עד' : 'until'} ${new Date(status.endsAt).toLocaleString(isHe ? 'he-IL' : 'en-US')}` : ''}
                      </p>
                    )}
                  </div>
                  {status?.isActive && (
                    <button
                      type="button"
                      onClick={() => handleDeactivate(p)}
                      disabled={deactivating === p}
                      className="rounded-lg border border-danger px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger-bg disabled:opacity-60"
                    >
                      {deactivating === p ? '…' : isHe ? 'סיים עכשיו' : 'End now'}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-1.5 text-sm font-medium text-ink">🎯 {isHe ? 'להפעיל תחזוקה עבור' : 'Activate maintenance for'}</p>
          <div className="flex gap-1.5">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  platform === p ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink'
                }`}
              >
                {platformLabel(p)}
              </button>
            ))}
          </div>
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">💬 {isHe ? 'הודעה למשתמשים' : 'User-facing message'}</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isHe ? 'כותרת — למשל: שדרוג מתוכנן' : 'Title — e.g. Scheduled system upgrade'}
            className={inputCls}
          />
        </label>

        <div className="mt-4">
          <p className="mb-1.5 text-sm font-medium text-ink">📣 {isHe ? 'אזהרה לפני הסגירה' : 'Warning before shutdown'}</p>
          <div className="grid grid-cols-3 gap-2">
            <TimeSelect label={isHe ? 'ימים' : 'Days'} value={warnDays} onChange={setWarnDays} options={DAY_OPTIONS} />
            <TimeSelect label={isHe ? 'שעות' : 'Hours'} value={warnHours} onChange={setWarnHours} options={HOUR_OPTIONS} />
            <TimeSelect label={isHe ? 'דקות' : 'Mins'} value={warnMinutes} onChange={setWarnMinutes} options={MIN_OPTIONS} />
          </div>
          <p className="mt-1.5 text-xs text-muted">{warnLabel}</p>
        </div>

        <div className="mt-4">
          <p className="mb-1.5 text-sm font-medium text-ink">⏱️ {isHe ? 'משך התחזוקה' : 'Maintenance duration'}</p>
          <div className="grid grid-cols-3 gap-2">
            <TimeSelect label={isHe ? 'ימים' : 'Days'} value={durDays} onChange={setDurDays} options={DAY_OPTIONS} />
            <TimeSelect label={isHe ? 'שעות' : 'Hours'} value={durHours} onChange={setDurHours} options={HOUR_OPTIONS} />
            <TimeSelect label={isHe ? 'דקות' : 'Mins'} value={durMinutes} onChange={setDurMinutes} options={MIN_OPTIONS} />
          </div>
          <p className="mt-1.5 text-xs text-muted">{durLabel}</p>
        </div>

        <label className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-paper p-3">
          <span>
            <span className="block text-sm font-medium text-ink">📡 {isHe ? 'שידור התראה' : 'Push broadcast'}</span>
            <span className="block text-xs text-muted">
              {broadcastEnabled
                ? isHe
                  ? 'התראה תישלח לכל המכשירים הרלוונטיים'
                  : 'Notification sent to all affected devices'
                : isHe
                  ? 'המשתמשים יחסמו ללא הודעה מוקדמת'
                  : 'Users will be blocked without advance notice'}
            </span>
          </span>
          <input type="checkbox" checked={broadcastEnabled} onChange={(e) => setBroadcastEnabled(e.target.checked)} className="h-5 w-5" />
        </label>

        <div className="mt-4 rounded-lg bg-paper p-3">
          <p className="mb-1 text-xs font-semibold text-muted">👁️ {isHe ? 'מה המשתמשים החסומים יראו' : 'What blocked users will see'}</p>
          <p className="whitespace-pre-line text-xs text-ink">{previewText}</p>
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
            {isHe ? 'ביטול' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
          >
            {saving
              ? '…'
              : broadcastEnabled
                ? isHe
                  ? `🚀 הפעל ל${platformLabel(platform)} ושדר`
                  : `🚀 Activate for ${platformLabel(platform)} & broadcast`
                : isHe
                  ? `🛠️ הפעל תחזוקה ל${platformLabel(platform)}`
                  : `🛠️ Activate maintenance for ${platformLabel(platform)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function TimeSelect({ label, value, onChange, options }: { label: string; value: number; onChange: (v: number) => void; options: number[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={inputCls}>
        {options.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';
