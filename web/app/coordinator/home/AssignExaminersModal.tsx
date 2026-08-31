'use client';

// app/coordinator/home/AssignExaminersModal.tsx
// Ported from mobile's handleApprove (final_report branch) + handleAssignExaminers.
// This IS the "Approve" action for a final_report milestone — approving one
// opens this instead of hitting the approve endpoint directly.
//
// Examiner count is no longer fixed at exactly 2 — the coordinator can add
// or remove slots freely (minimum 1). Every examiner slot shares the same
// grade weight (see IdentityGradeWeights server-side — there's no mechanism
// to configure them asymmetrically since a coordinator can't know in advance
// which physical examiner becomes "#1"), so the weight UI is just two
// fields (supervisor % + each-examiner %) regardless of how many slots exist.

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import type { CoordinatorPendingMilestone, ExaminerUser } from './types';

interface ExternalExaminerInput {
  name: string;
  email: string;
  institution: string;
}

interface ExaminerSlotState {
  type: 'internal' | 'external';
  internalId: string;
  external: ExternalExaminerInput;
}

interface AssignExaminersModalProps {
  milestone: CoordinatorPendingMilestone;
  examiners: ExaminerUser[];
  onClose: () => void;
  onAssigned: () => void;
}

const EMPTY_EXTERNAL: ExternalExaminerInput = { name: '', email: '', institution: '' };
const emptySlot = (): ExaminerSlotState => ({ type: 'internal', internalId: '', external: EMPTY_EXTERNAL });

export function AssignExaminersModal({ milestone, examiners, onClose, onAssigned }: AssignExaminersModalProps) {
  const { lang } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);

  // milestone.examinerCount is an optional hint from the faculty's workflow
  // template (see workflowTemplates.ts) — used only as the starting slot
  // count; the coordinator can still add/remove slots freely regardless.
  const [slots, setSlots] = useState<ExaminerSlotState[]>(() =>
    Array.from({ length: Math.max(1, milestone.examinerCount ?? 2) }, emptySlot)
  );
  // Written onto the milestone's gradeWeights field server-side (see
  // coordinatorController.ts's assignExaminers) — computeIdentityWeightedFinalGrade
  // (gradeEngine.ts) reads it once submitMilestoneGrade finishes scoring,
  // instead of always falling back to the default split.
  const [weightSupervisor, setWeightSupervisor] = useState('40');
  const [weightEachExaminer, setWeightEachExaminer] = useState(String(Math.round((60 / Math.max(1, milestone.examinerCount ?? 2)) * 10) / 10));

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const updateSlot = (idx: number, patch: Partial<ExaminerSlotState>) => {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const addSlot = () => setSlots((prev) => [...prev, emptySlot()]);
  const removeSlot = (idx: number) => setSlots((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  const buildPayload = (slot: ExaminerSlotState) =>
    slot.type === 'internal'
      ? ({ type: 'internal' as const, uid: slot.internalId })
      : ({ type: 'external' as const, name: slot.external.name.trim(), email: slot.external.email.trim(), institution: slot.external.institution.trim() });

  const handleSubmit = async () => {
    setError('');

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      const label = lang === 'he' ? `בוחן ${i + 1}` : `Examiner ${i + 1}`;
      if (slot.type === 'internal' && !slot.internalId) {
        setError(lang === 'he' ? `יש לבחור ${label}` : `Please select ${label}`);
        return;
      }
      if (slot.type === 'external' && (!slot.external.name.trim() || !slot.external.email.trim())) {
        setError(lang === 'he' ? `שם ואימייל ל${label} הם שדות חובה` : `Name and email are required for ${label}`);
        return;
      }
    }
    const internalIds = slots.filter((s) => s.type === 'internal').map((s) => s.internalId);
    if (new Set(internalIds).size !== internalIds.length) {
      setError(lang === 'he' ? 'יש לבחור בוחנים שונים זה מזה' : 'Please select distinct examiners');
      return;
    }
    const externalEmails = slots.filter((s) => s.type === 'external').map((s) => s.external.email.trim().toLowerCase());
    if (new Set(externalEmails).size !== externalEmails.length) {
      setError(lang === 'he' ? 'יש להזין בוחנים חיצוניים שונים זה מזה' : 'Please enter distinct external examiners');
      return;
    }

    const supervisorWeight = parseFloat(weightSupervisor) / 100;
    const examinerWeight = parseFloat(weightEachExaminer) / 100;
    if (Math.abs(supervisorWeight + slots.length * examinerWeight - 1) > 0.01) {
      setError(lang === 'he' ? 'סך המשקלות חייב להיות 100%' : 'Weights must sum to 100%');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.assignExaminers(milestone.projectId, {
        examiners: slots.map(buildPayload),
        milestoneId: milestone.id,
        studentIds: milestone.studentIds,
        weights: { supervisorWeight, examinerWeight },
      });
      onAssigned();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שיבוץ הבוחנים נכשל' : 'Failed to assign examiners');
    } finally {
      setSubmitting(false);
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
        <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'שיבוץ בוחנים' : 'Assign Examiners'}</h2>
        <p className="mt-1 text-sm text-muted">{lang === 'he' ? milestone.projectTitleHe : milestone.projectTitleEn}</p>

        {slots.map((slot, idx) => (
          <ExaminerSlotRow
            key={idx}
            index={idx}
            slot={slot}
            onChange={(patch) => updateSlot(idx, patch)}
            onRemove={slots.length > 1 ? () => removeSlot(idx) : undefined}
            examiners={examiners}
            lang={lang}
          />
        ))}

        <button
          type="button"
          onClick={addSlot}
          className="mt-3 w-full rounded-lg border border-dashed border-primary px-3 py-2 text-sm font-semibold text-primary hover:bg-paper"
        >
          ＋ {lang === 'he' ? 'הוסף בוחן' : 'Add examiner'}
        </button>

        <div className="mt-4">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            {lang === 'he' ? 'משקלות ציון (סה"כ 100%)' : 'Grade Weights (must total 100%)'}
          </span>
          <div className="grid grid-cols-2 gap-2">
            <WeightField label={lang === 'he' ? 'מנחה' : 'Supervisor'} value={weightSupervisor} onChange={setWeightSupervisor} />
            <WeightField
              label={lang === 'he' ? `כל בוחן (מתוך ${slots.length})` : `Each examiner (of ${slots.length})`}
              value={weightEachExaminer}
              onChange={setWeightEachExaminer}
            />
          </div>
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
            {lang === 'he' ? 'ביטול' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
          >
            {submitting ? '…' : lang === 'he' ? 'שבץ בוחנים' : 'Assign Examiners'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExaminerSlotRow({
  index,
  slot,
  onChange,
  onRemove,
  examiners,
  lang,
}: {
  index: number;
  slot: ExaminerSlotState;
  onChange: (patch: Partial<ExaminerSlotState>) => void;
  onRemove?: () => void;
  examiners: ExaminerUser[];
  lang: 'he' | 'en';
}) {
  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';
  const label = lang === 'he' ? `בוחן ${index + 1}` : `Examiner ${index + 1}`;
  return (
    <div className="mt-4 rounded-lg border border-line p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{label}</span>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-full bg-paper p-0.5">
            {(['internal', 'external'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ type: t })}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  slot.type === t ? 'bg-primary text-primary-ink' : 'text-muted'
                }`}
              >
                {t === 'internal' ? (lang === 'he' ? 'פנימי' : 'Internal') : lang === 'he' ? 'חיצוני' : 'External'}
              </button>
            ))}
          </div>
          {onRemove && (
            <button type="button" onClick={onRemove} className="text-muted hover:text-danger" aria-label={lang === 'he' ? 'הסר בוחן' : 'Remove examiner'}>
              ✕
            </button>
          )}
        </div>
      </div>

      {slot.type === 'internal' ? (
        <select value={slot.internalId} onChange={(e) => onChange({ internalId: e.target.value })} className={`${inputCls} mt-2`}>
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
            value={slot.external.name}
            onChange={(e) => onChange({ external: { ...slot.external, name: e.target.value } })}
            className={inputCls}
          />
          <input
            placeholder={lang === 'he' ? 'דוא"ל' : 'Email'}
            dir="ltr"
            value={slot.external.email}
            onChange={(e) => onChange({ external: { ...slot.external, email: e.target.value } })}
            className={inputCls}
          />
          <input
            placeholder={lang === 'he' ? 'מוסד' : 'Institution'}
            value={slot.external.institution}
            onChange={(e) => onChange({ external: { ...slot.external, institution: e.target.value } })}
            className={inputCls}
          />
        </div>
      )}
    </div>
  );
}

function WeightField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <div className="relative">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-line bg-paper px-3 py-2 pe-6 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
        />
        <span className="absolute inset-y-0 end-2 flex items-center text-xs text-muted">%</span>
      </div>
    </label>
  );
}
