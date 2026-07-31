'use client';

// app/workflow-templates/MilestoneRowModal.tsx
// Add/edit a single milestone row within the propose-version editor —
// nameHe/En, days-from-start, and a requires-examiners toggle.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { ChainEditor, emptyStage } from './ChainEditor';
import type { GradingComponentSpec, MilestoneRoutingSpec, MilestoneSpec } from './types';

function emptyComponent(): GradingComponentSpec {
  return { key: `c_${Math.random().toString(36).slice(2, 8)}`, labelHe: '', labelEn: '', maxScore: 20, weight: 20, hasComment: true, visibleToStudent: true };
}

interface MilestoneRowModalProps {
  open: boolean;
  editing: MilestoneSpec | null;
  onCancel: () => void;
  onSave: (values: {
    nameHe: string;
    nameEn: string;
    dueDaysFromStart: number;
    requiresExaminers: boolean;
    examinerCount?: number;
    gradingComponents: GradingComponentSpec[];
    routing?: MilestoneRoutingSpec;
  }) => void;
}

export function MilestoneRowModal({ open, editing, onCancel, onSave }: MilestoneRowModalProps) {
  const { lang, t } = useLanguage();
  const [nameHe, setNameHe] = useState(editing?.nameHe ?? '');
  const [nameEn, setNameEn] = useState(editing?.nameEn ?? '');
  const [days, setDays] = useState(String(editing?.dueDaysFromStart ?? 90));
  const [requiresExaminers, setRequiresExaminers] = useState(editing?.requiresExaminers ?? false);
  const [examinerCount, setExaminerCount] = useState(String(editing?.examinerCount ?? 2));
  const [components, setComponents] = useState<GradingComponentSpec[]>(editing?.gradingComponents ?? []);
  const [overrideChain, setOverrideChain] = useState(!!(editing?.routing && editing.routing.length > 0));
  const [routing, setRouting] = useState<MilestoneRoutingSpec>(editing?.routing && editing.routing.length > 0 ? editing.routing.map((s) => ({ ...s })) : [emptyStage()]);
  const [error, setError] = useState('');

  if (!open) return null;

  const updateComponent = (idx: number, patch: Partial<GradingComponentSpec>) => {
    setComponents((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };
  const removeComponent = (idx: number) => setComponents((prev) => prev.filter((_, i) => i !== idx));

  const weightSum = components.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);

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
    const parsedExaminerCount = parseInt(examinerCount, 10);
    if (requiresExaminers && (!Number.isFinite(parsedExaminerCount) || parsedExaminerCount < 1)) {
      setError(lang === 'he' ? 'מספר בוחנים לא תקין' : 'Invalid examiner count');
      return;
    }
    if (components.length > 0) {
      if (components.some((c) => !c.labelHe.trim() || !c.labelEn.trim())) {
        setError(lang === 'he' ? 'יש להזין שם לכל מרכיב ציון (עברית ואנגלית)' : 'Enter a name for every grading component (Hebrew and English)');
        return;
      }
      if (weightSum !== 100) {
        setError(lang === 'he' ? `סכום המשקלים חייב להיות 100 (כרגע ${weightSum})` : `Component weights must sum to 100 (currently ${weightSum})`);
        return;
      }
    }
    if (overrideChain && routing.length === 0) {
      setError(lang === 'he' ? 'שרשרת מותאמת אישית חייבת לכלול לפחות שלב אחד' : 'A custom chain needs at least one stage');
      return;
    }
    onSave({
      nameHe: nameHe.trim(),
      nameEn: nameEn.trim(),
      dueDaysFromStart: parsedDays,
      requiresExaminers,
      ...(requiresExaminers ? { examinerCount: parsedExaminerCount } : {}),
      gradingComponents: components,
      ...(overrideChain ? { routing } : {}),
    });
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

          {requiresExaminers && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {lang === 'he' ? 'מספר בוחנים נדרש' : 'Required number of examiners'}
              </span>
              <input
                type="number"
                min={1}
                value={examinerCount}
                onChange={(e) => setExaminerCount(e.target.value)}
                className={inputCls}
              />
            </label>
          )}

          <div className="rounded-lg border border-line bg-paper p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">
                {lang === 'he' ? 'מרכיבי ציון' : 'Grading components'}
                {components.length > 0 && <span className="ms-1 text-xs text-muted">({weightSum}/100)</span>}
              </span>
              <button
                type="button"
                onClick={() => setComponents((prev) => [...prev, emptyComponent()])}
                className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-ink hover:bg-primary-hover"
              >
                ＋ {t('add')}
              </button>
            </div>

            {components.length === 0 ? (
              <p className="mt-2 text-xs text-muted">
                {lang === 'he' ? 'ללא מרכיבים מוגדרים — ישמש מד ברירת המחדל.' : 'No components defined — falls back to the default rubric.'}
              </p>
            ) : (
              <div className="mt-2 grid gap-2">
                {components.map((c, idx) => (
                  <div key={c.key} className="rounded-md border border-line bg-surface p-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        dir="rtl"
                        value={c.labelHe}
                        onChange={(e) => updateComponent(idx, { labelHe: e.target.value })}
                        placeholder={lang === 'he' ? 'שם (עברית)' : 'Name (Hebrew)'}
                        className="w-full rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink"
                      />
                      <input
                        dir="ltr"
                        value={c.labelEn}
                        onChange={(e) => updateComponent(idx, { labelEn: e.target.value })}
                        placeholder={lang === 'he' ? 'שם (אנגלית)' : 'Name (English)'}
                        className="w-full rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink"
                      />
                      <button type="button" onClick={() => removeComponent(idx)} className="shrink-0 px-1 text-sm" aria-label="remove">
                        🗑️
                      </button>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <label className="flex items-center gap-1 text-xs text-muted">
                        {lang === 'he' ? 'ניקוד מקסימלי' : 'Max score'}
                        <input
                          type="number"
                          min={0}
                          value={c.maxScore}
                          onChange={(e) => updateComponent(idx, { maxScore: Number(e.target.value) })}
                          className="w-16 rounded-md border border-line bg-paper px-1.5 py-0.5 text-xs text-ink"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-xs text-muted">
                        {lang === 'he' ? 'משקל %' : 'Weight %'}
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={c.weight}
                          onChange={(e) => updateComponent(idx, { weight: Number(e.target.value) })}
                          className="w-16 rounded-md border border-line bg-paper px-1.5 py-0.5 text-xs text-ink"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-xs text-muted">
                        <input
                          type="checkbox"
                          checked={c.hasComment}
                          onChange={(e) => updateComponent(idx, { hasComment: e.target.checked })}
                          className="h-3.5 w-3.5 accent-[var(--primary)]"
                        />
                        {lang === 'he' ? 'שדה הערה' : 'Comment field'}
                      </label>
                      <label className="flex items-center gap-1 text-xs text-muted">
                        <input
                          type="checkbox"
                          checked={c.visibleToStudent}
                          onChange={(e) => updateComponent(idx, { visibleToStudent: e.target.checked })}
                          className="h-3.5 w-3.5 accent-[var(--primary)]"
                        />
                        {lang === 'he' ? 'גלוי לסטודנט' : 'Visible to student'}
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-line bg-paper p-3">
            <label className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">
                {lang === 'he' ? 'שרשרת אישור מותאמת לאבן דרך זו' : 'Override chain for this milestone'}
              </span>
              <input
                type="checkbox"
                checked={overrideChain}
                onChange={(e) => setOverrideChain(e.target.checked)}
                className="h-4 w-4 accent-[var(--primary)]"
              />
            </label>
            {overrideChain ? (
              <div className="mt-2">
                <ChainEditor stages={routing} onChange={setRouting} />
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-muted">
                {lang === 'he' ? 'ללא שינוי — ישתמש בשרשרת ברירת המחדל של התבנית.' : 'Unchanged — inherits the template\'s default chain.'}
              </p>
            )}
          </div>

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
