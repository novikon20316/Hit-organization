'use client';

// app/admin/panel/MaintenanceModal.tsx
// Ported from mobile/components/modals/MaintenanceModal.tsx + panel.tsx's
// saveMaintenance. Mobile's UI also collects a `blockedRoles` selection, but
// POST /api/admin/system/maintenance (maintenanceController.ts) never reads
// or stores that field — every non-system_admin role is blocked regardless
// of what's picked there. Rather than port a selector that quietly does
// nothing, this version drops it entirely; if per-role blocking becomes a
// real backend feature later, add the picker back here.

import { useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';

interface MaintenanceModalProps {
  onClose: () => void;
  onSaved?: () => void;
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

export function MaintenanceModal({ onClose, onSaved }: MaintenanceModalProps) {
  const { lang } = useLanguage();
  const isHe = lang === 'he';

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

  const warnLabel = useMemo(() => {
    const total = warnDays * 24 * 60 + warnHours * 60 + warnMinutes;
    if (total === 0) return isHe ? 'ללא אזהרה — ההשבתה תחל מיד' : 'No warning — shutdown begins immediately';
    return isHe ? `ההתראה תישלח ${formatDuration(warnDays, warnHours, warnMinutes, lang)} לפני הסגירה` : `Alert sends ${formatDuration(warnDays, warnHours, warnMinutes, lang)} before shutdown`;
  }, [warnDays, warnHours, warnMinutes, lang, isHe]);

  const durLabel = useMemo(() => {
    const total = durDays * 24 * 60 + durHours * 60 + durMinutes;
    if (total === 0) return isHe ? 'משך לא הוגדר' : 'Duration not set';
    return isHe ? `האפליקציה תחזור בעוד ~${formatDuration(durDays, durHours, durMinutes, lang)}` : `App will be back in ~${formatDuration(durDays, durHours, durMinutes, lang)}`;
  }, [durDays, durHours, durMinutes, lang, isHe]);

  const previewText = useMemo(() => {
    const effectiveTitle = title || (isHe ? 'תחזוקה מתוכננת' : 'Scheduled maintenance');
    const dur = formatDuration(durDays, durHours, durMinutes, lang);
    const hasDur = durDays + durHours + durMinutes > 0;
    if (isHe) {
      return hasDur
        ? `${effectiveTitle}\n\nאנו מבצעים תחזוקה מתוכננת. האפליקציה לא תהיה זמינה למשך כ-${dur}.\n\nנחזור בקרוב — תודה על הסבלנות.`
        : `${effectiveTitle}\n\nאנו מבצעים תחזוקה מתוכננת.\n\nנחזור בקרוב — תודה על הסבלנות.`;
    }
    return hasDur
      ? `${effectiveTitle}\n\nWe're performing scheduled maintenance. The app will be unavailable for approximately ${dur}.\n\nWe'll be back online shortly — thank you for your patience.`
      : `${effectiveTitle}\n\nWe're performing scheduled maintenance.\n\nWe'll be back online shortly — thank you for your patience.`;
  }, [title, durDays, durHours, durMinutes, lang, isHe]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const warnMs = warnDays * 86_400_000 + warnHours * 3_600_000 + warnMinutes * 60_000;
      const durMs = durDays * 86_400_000 + durHours * 3_600_000 + durMinutes * 60_000;
      await apiClient.updateMaintenanceStatus({
        title: title.trim() || 'Scheduled Maintenance',
        shutdownAt: Date.now() + warnMs,
        maintenanceDurMs: durMs,
        broadcastEnabled,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : isHe ? 'הפעלת מצב התחזוקה נכשלה' : 'Failed to activate maintenance mode');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">🛠️ {isHe ? 'מצב תחזוקה' : 'Maintenance mode'}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">{isHe ? 'הגדרת השבתה והתראות' : 'Configure downtime & notifications'}</p>

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

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

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
            {saving ? '…' : broadcastEnabled ? (isHe ? '🚀 הפעל ושדר' : '🚀 Activate & broadcast') : isHe ? '🛠️ הפעל תחזוקה' : '🛠️ Activate maintenance'}
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
