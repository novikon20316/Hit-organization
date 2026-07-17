'use client';

// app/workflow-templates/MilestoneRowModal.tsx
// Add/edit a single milestone row within the propose-version editor —
// nameHe/En, days-from-start, and a requires-examiners toggle.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { MilestoneSpec } from './types';

interface MilestoneRowModalProps {
  open: boolean;
  editing: MilestoneSpec | null;
  onCancel: () => void;
  onSave: (values: { nameHe: string; nameEn: string; dueDaysFromStart: number; requiresExaminers: boolean }) => void;
}

export function MilestoneRowModal({ open, editing, onCancel, onSave }: MilestoneRowModalProps) {
  const { lang, t } = useLanguage();
  const [nameHe, setNameHe] = useState(editing?.nameHe ?? '');
  const [nameEn, setNameEn] = useState(editing?.nameEn ?? '');
  const [days, setDays] = useState(String(editing?.dueDaysFromStart ?? 90));
  const [requiresExaminers, setRequiresExaminers] = useState(editing?.requiresExaminers ?? false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSave = () => {
    if (!nameHe.trim() || !nameEn.trim()) {
      setError(lang === 'he' ? 'יש להזין שם לאבן הדרך (עברית ואנגלית)' : 'Enter a milestone name (Hebrew and English)');
      return;
    }
    const parsedDays = parseInt(days, 10);
    if (!Number.isFinite(parsedDays) || parsedDays < 0) {
      setError(lang === 'he' ? 'מספר ימים לא תקין' : 'Invalid number of days');
      return;
    }
    onSave({ nameHe: nameHe.trim(), nameEn: nameEn.trim(), dueDaysFromStart: parsedDays, requiresExaminers });
  };

  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-[var(--radius)] bg-surface p-5 shadow-lg">
        <h2 className="text-base font-semibold text-ink">
          {editing ? `✏️ ${lang === 'he' ? 'עריכת אבן דרך' : 'Edit Milestone'}` : `➕ ${lang === 'he' ? 'אבן דרך חדשה' : 'New Milestone'}`}
        </h2>

        <div className="mt-3 grid gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'שם (עברית)' : 'Name (Hebrew)'}</span>
            <input dir="rtl" value={nameHe} onChange={(e) => setNameHe(e.target.value)} placeholder="שם אבן הדרך" className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'שם (אנגלית)' : 'Name (English)'}</span>
            <input dir="ltr" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Milestone name" className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'מועד יעד (ימים מתחילת התהליך)' : 'Due (days from process start)'}</span>
            <input type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} placeholder="90" className={inputCls} />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-line bg-paper px-3 py-2.5">
            <span className="text-sm font-medium text-ink">{lang === 'he' ? 'דורש בוחנים' : 'Requires examiners'}</span>
            <input
              type="checkbox"
              checked={requiresExaminers}
              onChange={(e) => setRequiresExaminers(e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
          </label>

          {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
              {t('cancel')}
            </button>
            <button type="button" onClick={handleSave} className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover">
              {t('save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
