'use client';

// app/admin/panel/AppVersionSection.tsx
//
// "Minimum mobile app version" — shown inside MaintenanceModal. Sets, per
// platform, the lowest native BUILD NUMBER the mobile app may run; older
// installs see a blocking "update required" screen
// (mobile/components/ForceUpdateGate.tsx). Mobile only: the website always
// serves its latest build. See server/src/services/appVersion.ts.

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';

type Platform = 'ios' | 'android';
const PLATFORMS: Platform[] = ['android', 'ios'];
const LABEL: Record<Platform, string> = { android: 'Android', ios: 'iPhone (iOS)' };

export function AppVersionSection({ isHe }: { isHe: boolean }) {
  const [minBuild, setMinBuild] = useState<Record<Platform, string>>({ ios: '', android: '' });
  const [storeUrl, setStoreUrl] = useState<Record<Platform, string>>({ ios: '', android: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.getAppVersionPolicyAdmin()
      .then((p) => {
        setMinBuild({ ios: p.ios.minBuild ? String(p.ios.minBuild) : '', android: p.android.minBuild ? String(p.android.minBuild) : '' });
        setStoreUrl({ ios: p.ios.storeUrl ?? '', android: p.android.storeUrl ?? '' });
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setError('');
    setMessage('');
    const body: Record<Platform, { minBuild: number | null; storeUrl: string }> = {} as never;
    for (const p of PLATFORMS) {
      const raw = minBuild[p].trim();
      const n = raw ? Number(raw) : null;
      if (n !== null && !(Number.isInteger(n) && n > 0)) {
        setError(isHe ? `מספר הבנייה של ${LABEL[p]} חייב להיות מספר שלם חיובי` : `${LABEL[p]} build must be a positive whole number`);
        return;
      }
      body[p] = { minBuild: n, storeUrl: storeUrl[p].trim() };
    }
    if (!window.confirm(isHe
      ? 'כל מי שמותקנת אצלו גרסה ישנה מהמינימום יחסם עד שיעדכן. להמשיך?'
      : 'Anyone with an older build will be blocked until they update. Continue?')) return;
    setSaving(true);
    try {
      await apiClient.updateAppVersionPolicy(body);
      setMessage(isHe ? 'נשמר' : 'Saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : isHe ? 'השמירה נכשלה' : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-6 border-t border-admin-outline-variant pt-4">
      <h3 className="text-sm font-semibold text-admin-on-surface">📲 {isHe ? 'גרסת אפליקציה מינימלית (מובייל בלבד)' : 'Minimum app version (mobile only)'}</h3>
      <p className="mt-1 text-xs text-admin-on-surface-variant">
        {isHe
          ? 'מכשיר עם מספר בנייה נמוך מהמינימום יראה מסך "נדרש עדכון" ולא יוכל להשתמש באפליקציה. השאירו ריק כדי לא לחסום. האתר תמיד מעודכן ולא מושפע.'
          : 'Devices with a lower build number see an "update required" screen and can’t use the app. Leave empty to block nobody. The website is always up to date and unaffected.'}
      </p>
      {loading ? (
        <p className="mt-3 text-xs text-admin-on-surface-variant">{isHe ? 'טוען…' : 'Loading…'}</p>
      ) : (
        <div className="mt-3 grid gap-3">
          {PLATFORMS.map((p) => (
            <div key={p} className="grid gap-2 sm:grid-cols-[110px_1fr_2fr] sm:items-center">
              <span className="text-sm font-medium text-admin-on-surface">{LABEL[p]}</span>
              <input
                inputMode="numeric"
                dir="ltr"
                value={minBuild[p]}
                onChange={(e) => setMinBuild((m) => ({ ...m, [p]: e.target.value.replace(/\D/g, '') }))}
                placeholder={isHe ? 'מספר בנייה מינימלי' : 'Min build number'}
                aria-label={`${LABEL[p]} ${isHe ? 'מספר בנייה מינימלי' : 'minimum build number'}`}
                className={inputCls}
              />
              <input
                dir="ltr"
                value={storeUrl[p]}
                onChange={(e) => setStoreUrl((m) => ({ ...m, [p]: e.target.value }))}
                placeholder={p === 'ios' ? 'https://apps.apple.com/…' : 'https://play.google.com/…'}
                aria-label={`${LABEL[p]} ${isHe ? 'קישור לחנות' : 'store link'}`}
                className={inputCls}
              />
            </div>
          ))}
          {error && <p className="text-xs text-danger" role="alert">{error}</p>}
          {message && <p className="text-xs text-success" role="status">{message}</p>}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="justify-self-start rounded-lg bg-admin-primary px-3 py-1.5 text-sm font-semibold text-admin-on-primary hover:opacity-90 disabled:opacity-60"
          >
            {saving ? '…' : isHe ? 'שמירת גרסת מינימום' : 'Save minimum version'}
          </button>
        </div>
      )}
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-admin-outline-variant bg-admin-surface-container-low px-3 py-2 text-sm text-admin-on-surface focus:border-admin-primary focus:bg-admin-surface-container-lowest focus:outline-none';
