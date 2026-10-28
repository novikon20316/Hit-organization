'use client';

// app/admin/panel/MergeUsersModal.tsx
// system_admin "Merge Users" flow (Users tab toolbar): pick two accounts that
// belong to the same person, choose which email/login survives, preview what
// will be re-pointed (server dry run), then merge. See
// server/src/services/userMerge.ts for what a merge actually does.
// Mirrors ReassignBeforeDeleteModal's dialog shell/a11y conventions.

import { useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModalA11y } from '@/hooks/useModalA11y';
import { apiClient, type UserMergeResult } from '@/lib/apiClient';
import { roleLabel } from '@/lib/i18n';
import type { AppRole } from '@/lib/roles';
import type { AdminUserRecord } from './types';

interface MergeUsersModalProps {
  open: boolean;
  users: AdminUserRecord[];
  onClose: () => void;
  onMerged: () => void;
}

const inputCls = 'w-full rounded-lg border border-line bg-paper px-2.5 py-1.5 text-sm text-ink focus:border-primary focus:outline-none';

function matches(u: AdminUserRecord, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return false;
  return [u.displayName, u.displayNameHe, u.displayNameEn, u.email].some((v) => (v ?? '').toLowerCase().includes(s));
}

function UserPicker({
  label, users, selected, excludeId, initialQuery, onSelect,
}: {
  label: string;
  users: AdminUserRecord[];
  selected: AdminUserRecord | null;
  excludeId: string | null;
  initialQuery: string;
  onSelect: (u: AdminUserRecord | null) => void;
}) {
  const { lang } = useLanguage();
  const [query, setQuery] = useState(initialQuery);
  const results = useMemo(
    () => users.filter((u) => u.id !== excludeId && matches(u, query)).slice(0, 8),
    [users, excludeId, query],
  );

  if (selected) {
    return (
      <div>
        <p className="mb-1 text-xs font-medium text-muted">{label}</p>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary bg-primary/5 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{selected.displayName}</p>
            <p className="truncate text-xs text-muted">{selected.email}</p>
          </div>
          <button type="button" onClick={() => onSelect(null)} className="shrink-0 text-xs font-medium text-primary hover:underline">
            {lang === 'he' ? 'שינוי' : 'Change'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted">
        {label}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={lang === 'he' ? 'חיפוש לפי שם או אימייל...' : 'Search by name or email...'}
          className={`mt-1 ${inputCls}`}
        />
      </label>
      {results.length > 0 && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-line">
          {results.map((u) => (
            <li key={u.id}>
              <button type="button" onClick={() => onSelect(u)} className="w-full px-3 py-1.5 text-start hover:bg-paper">
                <span className="block truncate text-sm text-ink">{u.displayName}</span>
                <span className="block truncate text-xs text-muted">
                  {u.email} · {roleLabel(u.role as AppRole, lang)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const WARNING_TEXT: Record<UserMergeResult['warnings'][number], { he: string; en: string }> = {
  BOTH_ACTIVE_PROJECTS: { he: 'לשני החשבונות יש פרויקט פעיל — החשבון המאוחד יכלול את שניהם.', en: 'Both accounts have an active project — the merged account will have both.' },
  OVER_ACTIVE_PROJECT_CAP: { he: 'לחשבון המאוחד יהיו יותר מ-3 פרויקטים פעילים.', en: 'The merged account will have more than 3 active projects.' },
  DIFFERENT_FACULTIES: { he: 'החשבונות שייכים לפקולטות שונות — הפקולטה של החשבון שנשמר תישאר.', en: "The accounts are in different faculties — the kept account's faculty stays." },
  DIFFERENT_NAMES: { he: 'לחשבונות שמות שונים — ודא/י שמדובר באותו אדם.', en: 'The accounts have different names — make sure they are the same person.' },
};

export function MergeUsersModal({ open, users, onClose, onMerged }: MergeUsersModalProps) {
  const { lang } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [first, setFirst] = useState<AdminUserRecord | null>(null);
  const [second, setSecond] = useState<AdminUserRecord | null>(null);
  const [keepId, setKeepId] = useState<string | null>(null);
  const [preview, setPreview] = useState<UserMergeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<UserMergeResult | null>(null);

  const close = () => {
    setFirst(null); setSecond(null); setKeepId(null); setPreview(null); setError(''); setDone(null);
    onClose();
  };
  useModalA11y(dialogRef, open, close);

  if (!open) return null;

  const keep = keepId ? [first, second].find((u) => u?.id === keepId) ?? null : null;
  const remove = keep ? (keep.id === first?.id ? second : first) : null;

  // Any change to the selection invalidates a previous preview.
  const resetPreview = () => { setPreview(null); setError(''); };

  const runPreview = async () => {
    if (!keep || !remove) return;
    setBusy(true); setError('');
    try {
      setPreview(await apiClient.mergeUsers(keep.id, remove.id, true));
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'התצוגה המקדימה נכשלה' : 'Preview failed');
    } finally {
      setBusy(false);
    }
  };

  const runMerge = async () => {
    if (!keep || !remove) return;
    setBusy(true); setError('');
    try {
      setDone(await apiClient.mergeUsers(keep.id, remove.id, false));
      onMerged();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'המיזוג נכשל' : 'Merge failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-black/40 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="merge-users-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-5 shadow-lg outline-none"
      >
        <h2 id="merge-users-title" className="text-base font-semibold text-ink">
          {lang === 'he' ? 'מיזוג משתמשים' : 'Merge Users'}
        </h2>

        {done ? (
          <>
            <p className="mt-3 text-sm text-ink">
              {lang === 'he'
                ? `החשבונות מוזגו. ${done.keep.displayName} נשאר/ה עם האימייל ${done.keep.email}; ${done.totalDocuments} רשומות הועברו.`
                : `Accounts merged. ${done.keep.displayName} remains with ${done.keep.email}; ${done.totalDocuments} records moved over.`}
            </p>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={close} className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover">
                {lang === 'he' ? 'סגירה' : 'Close'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">
              {lang === 'he'
                ? 'בחר/י שני חשבונות של אותו אדם ואת האימייל שיישאר. כל הפרויקטים, הציונים וההודעות של החשבון השני יועברו, והחשבון השני יימחק.'
                : "Pick two accounts that belong to the same person and the email to keep. The other account's projects, grades and messages move over, and its login is deleted."}
            </p>

            <div className="mt-4 grid gap-3">
              <UserPicker
                label={lang === 'he' ? 'משתמש ראשון' : 'First user'}
                users={users}
                selected={first}
                excludeId={second?.id ?? null}
                initialQuery=""
                onSelect={(u) => { setFirst(u); setKeepId(null); resetPreview(); }}
              />
              {first && (
                <UserPicker
                  key={first.id}
                  label={lang === 'he' ? 'משתמש שני' : 'Second user'}
                  users={users}
                  selected={second}
                  excludeId={first.id}
                  initialQuery={first.displayName.split(' ')[0] ?? ''}
                  onSelect={(u) => { setSecond(u); setKeepId(null); resetPreview(); }}
                />
              )}
            </div>

            {first && second && (
              <fieldset className="mt-4">
                <legend className="mb-1 text-xs font-medium text-muted">
                  {lang === 'he' ? 'איזה אימייל יישאר?' : 'Which email should remain?'}
                </legend>
                <div className="grid gap-2">
                  {[first, second].map((u) => (
                    <label key={u.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${keepId === u.id ? 'border-primary bg-primary/5' : 'border-line'}`}>
                      <input
                        type="radio"
                        name="merge-keep"
                        checked={keepId === u.id}
                        onChange={() => { setKeepId(u.id); resetPreview(); }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">{u.email}</span>
                        <span className="block truncate text-xs text-muted">{u.displayName} · {roleLabel(u.role as AppRole, lang)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {preview && keep && remove && (
              <div className="mt-4 rounded-lg border border-line bg-paper p-3 text-sm">
                <p className="text-ink">
                  {lang === 'he'
                    ? `${preview.totalDocuments} רשומות יועברו מ-${remove.email} אל ${keep.email}. ההתחברות של ${remove.email} תימחק.`
                    : `${preview.totalDocuments} records will move from ${remove.email} to ${keep.email}. ${remove.email}'s login will be deleted.`}
                </p>
                <p className="mt-2 text-ink">
                  {lang === 'he' ? 'אחרי המיזוג: ' : 'After the merge: '}
                  {lang === 'he' ? 'התחברות עם ' : 'login '}<span dir="ltr">{preview.keepAfter.email}</span>
                  {' · '}
                  {lang === 'he' ? 'תפקיד ראשי: ' : 'primary role: '}{roleLabel(preview.keepAfter.role as AppRole, lang)}
                  {' · '}
                  {lang === 'he' ? 'כל התפקידים: ' : 'all roles: '}{preview.keepAfter.roles.map((r) => roleLabel(r as AppRole, lang)).join(', ')}
                </p>
                {Object.keys(preview.referencesByCollection).length > 0 && (
                  <ul className="mt-2 grid grid-cols-2 gap-x-4 text-xs text-muted">
                    {Object.entries(preview.referencesByCollection).sort((a, b) => b[1] - a[1]).map(([col, n]) => (
                      <li key={col}>{col}: {n}</li>
                    ))}
                  </ul>
                )}
                {preview.warnings.length > 0 && (
                  <ul className="mt-2 grid gap-1">
                    {preview.warnings.map((w) => (
                      <li key={w} className="rounded-md bg-accent/10 px-2 py-1 text-xs text-ink">⚠ {WARNING_TEXT[w][lang === 'he' ? 'he' : 'en']}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {error && <p className="mt-3 rounded-md bg-danger-bg px-2.5 py-1.5 text-xs text-danger" role="alert">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={close} disabled={busy} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
                {lang === 'he' ? 'ביטול' : 'Cancel'}
              </button>
              {!preview ? (
                <button
                  type="button"
                  onClick={runPreview}
                  disabled={busy || !keep || !remove}
                  className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
                >
                  {busy ? '…' : lang === 'he' ? 'תצוגה מקדימה' : 'Preview'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={runMerge}
                  disabled={busy}
                  className="rounded-lg bg-danger px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? '…' : lang === 'he' ? 'מיזוג (בלתי הפיך)' : 'Merge (cannot be undone)'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
