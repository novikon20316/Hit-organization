'use client';

// app/coordinator/home/DateConflictModal.tsx
// Ported from mobile's conflict-resolution modal in coordinator/home.tsx —
// shown when the examiner date-matching flow found no common date. The
// coordinator either keeps both examiners and lets the system auto-pick a
// date (25-40 days out), or replaces one examiner and restarts date
// selection for just them. See apiClient.resolveDefenseDateConflict.

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import type { AssignedMilestone, ExaminerUser } from './types';

interface ExternalExaminerInput {
  name: string;
  email: string;
  institution: string;
}

const EMPTY_EXTERNAL: ExternalExaminerInput = { name: '', email: '', institution: '' };

interface DateConflictModalProps {
  milestone: AssignedMilestone;
  examiners: ExaminerUser[];
  onClose: () => void;
  onResolved: () => void;
}

export function DateConflictModal({ milestone, examiners, onClose, onResolved }: DateConflictModalProps) {
  const { lang } = useLanguage();
  const panel = milestone.defensePanel ?? [];
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);

  const [replacedKey, setReplacedKey] = useState(panel[0] ? `${panel[0].type}:${panel[0].ref}` : '');
  const [replacementType, setReplacementType] = useState<'internal' | 'external'>('internal');
  const [replacementInternalId, setReplacementInternalId] = useState('');
  const [replacementExt, setReplacementExt] = useState<ExternalExaminerInput>(EMPTY_EXTERNAL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';

  const handleKeepExaminers = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await apiClient.resolveDefenseDateConflict(milestone.id, { action: 'keep_examiners' });
      setResult(res.date ? (lang === 'he' ? `✅ נבחר תאריך הגנה: ${res.date}` : `✅ Defense date auto-selected: ${res.date}`) : '✅');
      setTimeout(onResolved, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'בחירת התאריך האוטומטית נכשלה' : 'Failed to auto-select a date');
    } finally {
      setSaving(false);
    }
  };

  const handleReplaceExaminer = async () => {
    setError('');
    if (!replacedKey) return;
    if (replacementType === 'internal' && !replacementInternalId) {
      setError(lang === 'he' ? 'יש לבחור בוחן חלופי' : 'Please select a replacement examiner');
      return;
    }
    if (replacementType === 'external' && (!replacementExt.name.trim() || !replacementExt.email.trim())) {
      setError(lang === 'he' ? 'שם ואימייל הם שדות חובה' : 'Name and email are required');
      return;
    }
    setSaving(true);
    try {
      await apiClient.resolveDefenseDateConflict(milestone.id, {
        action: 'replace_examiner',
        replacedExaminerKey: replacedKey,
        newExaminer:
          replacementType === 'internal'
            ? { type: 'internal', uid: replacementInternalId }
            : { type: 'external', name: replacementExt.name.trim(), email: replacementExt.email.trim(), institution: replacementExt.institution.trim() },
      });
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'החלפת הבוחן נכשלה' : 'Failed to replace examiner');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg outline-none"
      >
        <h2 className="text-lg font-semibold text-ink">⚠️ {lang === 'he' ? 'לא נמצא תאריך משותף' : 'No common date found'}</h2>
        <p className="mt-2 text-sm text-muted">
          {lang === 'he'
            ? 'ניתן לשמור על אותם בוחנים ולתת למערכת לבחור תאריך (25–40 יום מהיום), או להחליף אחד הבוחנים ולהתחיל תהליך בחירה חדש עבורו.'
            : 'You can keep the same examiners and let the system auto-pick a date (25-40 days out), or replace one examiner and restart date selection for just them.'}
        </p>

        <button
          type="button"
          onClick={handleKeepExaminers}
          disabled={saving}
          className="mt-4 w-full rounded-lg bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
        >
          {saving ? '…' : lang === 'he' ? '1️⃣ שמור בוחנים ובחר תאריך אוטומטית' : '1️⃣ Keep examiners & auto-pick a date'}
        </button>

        <p className="mt-5 text-sm font-medium text-ink">{lang === 'he' ? '2️⃣ או החלף בוחן:' : '2️⃣ Or replace an examiner:'}</p>

        <div className="mt-2 grid gap-1.5">
          {panel.map((member) => {
            const key = `${member.type}:${member.ref}`;
            const active = replacedKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setReplacedKey(key)}
                className={`rounded-lg border px-3 py-2 text-start text-sm ${active ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink'}`}
              >
                {member.displayName} {member.type === 'external' ? `(${lang === 'he' ? 'חיצוני' : 'external'})` : ''}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex gap-1 rounded-full bg-paper p-0.5" style={{ width: 'fit-content' }}>
          {(['internal', 'external'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setReplacementType(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                replacementType === t ? 'bg-primary text-primary-ink' : 'text-muted'
              }`}
            >
              {t === 'internal' ? (lang === 'he' ? 'פנימי' : 'Internal') : lang === 'he' ? 'חיצוני' : 'External'}
            </button>
          ))}
        </div>

        {replacementType === 'internal' ? (
          <select value={replacementInternalId} onChange={(e) => setReplacementInternalId(e.target.value)} className={`${inputCls} mt-2`}>
            <option value="">{lang === 'he' ? 'בחר בוחן' : 'Select examiner'}</option>
            {examiners.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.displayName} — {ex.email}
              </option>
            ))}
          </select>
        ) : (
          <div className="mt-2 grid gap-2">
            <input
              placeholder={lang === 'he' ? 'שם מלא' : 'Full name'}
              value={replacementExt.name}
              onChange={(e) => setReplacementExt({ ...replacementExt, name: e.target.value })}
              className={inputCls}
            />
            <input
              placeholder={lang === 'he' ? 'דוא"ל' : 'Email'}
              dir="ltr"
              value={replacementExt.email}
              onChange={(e) => setReplacementExt({ ...replacementExt, email: e.target.value })}
              className={inputCls}
            />
            <input
              placeholder={lang === 'he' ? 'מוסד' : 'Institution'}
              value={replacementExt.institution}
              onChange={(e) => setReplacementExt({ ...replacementExt, institution: e.target.value })}
              className={inputCls}
            />
          </div>
        )}

        {result && <p className="mt-4 rounded-md bg-success-bg px-3 py-2 text-sm text-success" role="status">{result}</p>}
        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
            {lang === 'he' ? 'ביטול' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleReplaceExaminer}
            disabled={saving || !replacedKey}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
          >
            {saving ? '…' : lang === 'he' ? 'החלף בוחן' : 'Replace examiner'}
          </button>
        </div>
      </div>
    </div>
  );
}
