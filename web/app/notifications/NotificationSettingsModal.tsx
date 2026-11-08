'use client';

// app/notifications/NotificationSettingsModal.tsx
// The signed-in user's own notification settings (server
// notificationPrefs.ts): per category, which outside channels (email, push,
// SMS, WhatsApp) also carry a notification, and an optional daily email
// digest. In-app notifications and task badges are always on, and security
// & account alerts are always sent — both stated in the dialog so nobody
// expects otherwise.

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModalA11y } from '@/hooks/useModalA11y';
import { apiClient, type NotificationCategory, type NotificationChannel, type NotificationPrefs } from '@/lib/apiClient';

const CATEGORIES: Array<{ key: NotificationCategory; he: string; en: string; hintHe: string; hintEn: string }> = [
  { key: 'messages', he: 'הודעות', en: 'Messages', hintHe: 'צ׳אט והודעות מהרכזת', hintEn: 'Chat and coordinator messages' },
  { key: 'deadlines', he: 'מועדים ותזכורות', en: 'Deadlines & reminders', hintHe: 'מועדי הגשה, איחורים, אבני דרך תקועות', hintEn: 'Due dates, overdue and stuck milestones' },
  { key: 'workflow', he: 'אישורים והתקדמות', en: 'Approvals & progress', hintHe: 'הגשות, ציונים, אישורים, מועמדויות, הגנות', hintEn: 'Submissions, grades, approvals, applications, defenses' },
  { key: 'announcements', he: 'הודעות כלליות', en: 'Announcements', hintHe: 'הודעות מערכת ופרויקטים חדשים', hintEn: 'System announcements and new projects' },
];

const CHANNELS: Array<{ key: NotificationChannel; he: string; en: string }> = [
  { key: 'email', he: 'דוא"ל', en: 'Email' },
  { key: 'push', he: 'התראה לנייד', en: 'Push' },
  { key: 'sms', he: 'SMS', en: 'SMS' },
  { key: 'whatsapp', he: 'WhatsApp', en: 'WhatsApp' },
];

export function NotificationSettingsModal({ onClose }: { onClose: () => void }) {
  const { lang } = useLanguage();
  const he = lang === 'he';
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiClient.getNotificationPrefs()
      .then((r) => setPrefs(r.prefs))
      .catch((err) => setError(err instanceof Error ? err.message : he ? 'הטעינה נכשלה' : 'Failed to load'));
  }, [he]);

  const toggle = (category: NotificationCategory, channel: NotificationChannel) => {
    setSaved(false);
    setPrefs((p) => p && { ...p, channels: { ...p.channels, [category]: { ...p.channels[category], [channel]: !p.channels[category][channel] } } });
  };

  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    setError('');
    try {
      const r = await apiClient.updateNotificationPrefs(prefs);
      setPrefs(r.prefs);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'השמירה נכשלה' : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-black/40 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-settings-title"
        className="w-full max-w-xl rounded-[var(--radius)] bg-surface p-5 shadow-lg outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="notif-settings-title" className="text-base font-semibold text-ink">⚙️ {he ? 'הגדרות התראות' : 'Notification settings'}</h2>
          <button type="button" onClick={onClose} aria-label={he ? 'סגור' : 'Close'} className="text-muted hover:text-ink">✕</button>
        </div>
        <p className="mt-1 text-xs text-muted">
          {he
            ? 'בחרו לאן תגיע כל התראה בנוסף למערכת. התראות בתוך המערכת ותגי משימות פתוחות תמיד פעילים. התראות אבטחה וחשבון (התחברות, קודי אימות, סיסמה זמנית) נשלחות תמיד.'
            : 'Choose where each notification also goes, besides the app. In-app notifications and open-task badges are always on. Security & account alerts (sign-in, verification codes, temporary passwords) are always sent.'}
        </p>

        {!prefs ? (
          <p className="mt-4 text-sm text-muted" role={error ? 'alert' : 'status'}>{error || (he ? 'טוען…' : 'Loading…')}</p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="py-2 pe-2 text-start font-medium">{he ? 'סוג' : 'Category'}</th>
                    {CHANNELS.map((c) => <th key={c.key} className="px-2 py-2 text-center font-medium">{he ? c.he : c.en}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {CATEGORIES.map((cat) => (
                    <tr key={cat.key} className="border-t border-line">
                      <td className="py-2 pe-2">
                        <p className="font-medium text-ink">{he ? cat.he : cat.en}</p>
                        <p className="text-[11px] text-muted">{he ? cat.hintHe : cat.hintEn}</p>
                      </td>
                      {CHANNELS.map((ch) => (
                        <td key={ch.key} className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={prefs.channels[cat.key][ch.key]}
                            onChange={() => toggle(cat.key, ch.key)}
                            aria-label={`${he ? cat.he : cat.en} — ${he ? ch.he : ch.en}`}
                            className="h-4 w-4 accent-[var(--primary)]"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label className="mt-4 flex items-start gap-2 rounded-md border border-line p-3">
              <input
                type="checkbox"
                checked={prefs.emailDigest}
                onChange={() => { setSaved(false); setPrefs((p) => p && { ...p, emailDigest: !p.emailDigest }); }}
                className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
              />
              <span>
                <span className="block text-sm font-medium text-ink">{he ? 'סיכום יומי בדוא"ל במקום מיילים מיידיים' : 'One daily email digest instead of instant emails'}</span>
                <span className="block text-xs text-muted">
                  {he
                    ? 'מיילים שהופעלו למעלה יישלחו יחד פעם ביום, בסביבות 08:00. התראות אבטחה ממשיכות להישלח מיד.'
                    : 'Emails switched on above arrive together once a day, around 08:00. Security alerts are still sent right away.'}
                </span>
              </span>
            </label>

            {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
            {saved && <p className="mt-3 rounded-md bg-success-bg px-3 py-2 text-sm text-success" role="status">✅ {he ? 'ההגדרות נשמרו' : 'Settings saved'}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink">
                {he ? 'סגור' : 'Close'}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:opacity-90 disabled:opacity-60"
              >
                {saving ? '…' : he ? 'שמור' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
