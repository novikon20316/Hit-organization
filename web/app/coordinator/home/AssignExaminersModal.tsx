'use client';

// app/coordinator/home/AssignExaminersModal.tsx
// Ported from mobile's handleApprove (final_report branch) + handleAssignExaminers.
// This IS the "Approve" action for a final_report milestone — approving one
// opens this instead of hitting the approve endpoint directly.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { CoordinatorPendingMilestone, ExaminerUser } from './types';

interface ExternalExaminerInput {
  name: string;
  email: string;
  institution: string;
}

interface AssignExaminersModalProps {
  milestone: CoordinatorPendingMilestone;
  examiners: ExaminerUser[];
  onClose: () => void;
  onAssigned: () => void;
}

const EMPTY_EXTERNAL: ExternalExaminerInput = { name: '', email: '', institution: '' };

export function AssignExaminersModal({ milestone, examiners, onClose, onAssigned }: AssignExaminersModalProps) {
  const { lang } = useLanguage();

  const [examiner1Type, setExaminer1Type] = useState<'internal' | 'external'>('internal');
  const [examiner2Type, setExaminer2Type] = useState<'internal' | 'external'>('internal');
  const [examiner1Id, setExaminer1Id] = useState('');
  const [examiner2Id, setExaminer2Id] = useState('');
  const [examiner1Ext, setExaminer1Ext] = useState<ExternalExaminerInput>(EMPTY_EXTERNAL);
  const [examiner2Ext, setExaminer2Ext] = useState<ExternalExaminerInput>(EMPTY_EXTERNAL);
  // Collected and validated to sum to 100%, same as mobile — but note mobile
  // never actually sends these to the server (assign-examiners's request
  // body only reads examiners/milestoneId/studentIds; see
  // server/src/controllers/coordinatorController.ts). Kept here to match
  // existing behavior exactly rather than silently changing it; worth a
  // follow-up on the mobile side too if the weights are meant to do anything.
  const [weightSupervisor, setWeightSupervisor] = useState('30');
  const [weightExaminer1, setWeightExaminer1] = useState('35');
  const [weightExaminer2, setWeightExaminer2] = useState('35');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const buildPayload = (type: 'internal' | 'external', id: string, ext: ExternalExaminerInput) =>
    type === 'internal'
      ? ({ type: 'internal' as const, uid: id })
      : ({ type: 'external' as const, name: ext.name.trim(), email: ext.email.trim(), institution: ext.institution.trim() });

  const handleSubmit = async () => {
    setError('');

    if (examiner1Type === 'internal' && !examiner1Id) {
      setError(lang === 'he' ? 'יש לבחור בוחן 1' : 'Please select examiner 1');
      return;
    }
    if (examiner1Type === 'external' && (!examiner1Ext.name.trim() || !examiner1Ext.email.trim())) {
      setError(lang === 'he' ? 'שם ואימייל לבוחן 1 הם שדות חובה' : 'Name and email are required for examiner 1');
      return;
    }
    if (examiner2Type === 'internal' && !examiner2Id) {
      setError(lang === 'he' ? 'יש לבחור בוחן 2' : 'Please select examiner 2');
      return;
    }
    if (examiner2Type === 'external' && (!examiner2Ext.name.trim() || !examiner2Ext.email.trim())) {
      setError(lang === 'he' ? 'שם ואימייל לבוחן 2 הם שדות חובה' : 'Name and email are required for examiner 2');
      return;
    }
    if (examiner1Type === 'internal' && examiner2Type === 'internal' && examiner1Id === examiner2Id) {
      setError(lang === 'he' ? 'יש לבחור שני בוחנים שונים' : 'Please select two different examiners');
      return;
    }
    if (
      examiner1Type === 'external' &&
      examiner2Type === 'external' &&
      examiner1Ext.email.trim().toLowerCase() === examiner2Ext.email.trim().toLowerCase()
    ) {
      setError(lang === 'he' ? 'יש להזין שני בוחנים חיצוניים שונים' : 'Please enter two different external examiners');
      return;
    }

    const w1 = parseFloat(weightSupervisor) / 100;
    const w2 = parseFloat(weightExaminer1) / 100;
    const w3 = parseFloat(weightExaminer2) / 100;
    if (Math.abs(w1 + w2 + w3 - 1) > 0.01) {
      setError(lang === 'he' ? 'סך המשקלות חייב להיות 100%' : 'Weights must sum to 100%');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.assignExaminers(milestone.projectId, {
        examiners: [
          buildPayload(examiner1Type, examiner1Id, examiner1Ext),
          buildPayload(examiner2Type, examiner2Id, examiner2Ext),
        ],
        milestoneId: milestone.id,
        studentIds: milestone.studentIds,
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
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'שיבוץ בוחנים' : 'Assign Examiners'}</h2>
        <p className="mt-1 text-sm text-muted">{lang === 'he' ? milestone.projectTitleHe : milestone.projectTitleEn}</p>

        <ExaminerSlot
          label={lang === 'he' ? 'בוחן 1' : 'Examiner 1'}
          type={examiner1Type}
          onTypeChange={setExaminer1Type}
          internalId={examiner1Id}
          onInternalIdChange={setExaminer1Id}
          external={examiner1Ext}
          onExternalChange={setExaminer1Ext}
          examiners={examiners}
          lang={lang}
        />

        <ExaminerSlot
          label={lang === 'he' ? 'בוחן 2' : 'Examiner 2'}
          type={examiner2Type}
          onTypeChange={setExaminer2Type}
          internalId={examiner2Id}
          onInternalIdChange={setExaminer2Id}
          external={examiner2Ext}
          onExternalChange={setExaminer2Ext}
          examiners={examiners}
          lang={lang}
        />

        <div className="mt-4">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            {lang === 'he' ? 'משקלות ציון (סה"כ 100%)' : 'Grade Weights (must total 100%)'}
          </span>
          <div className="grid grid-cols-3 gap-2">
            <WeightField label={lang === 'he' ? 'מנחה' : 'Supervisor'} value={weightSupervisor} onChange={setWeightSupervisor} />
            <WeightField label={lang === 'he' ? 'בוחן 1' : 'Examiner 1'} value={weightExaminer1} onChange={setWeightExaminer1} />
            <WeightField label={lang === 'he' ? 'בוחן 2' : 'Examiner 2'} value={weightExaminer2} onChange={setWeightExaminer2} />
          </div>
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

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

function ExaminerSlot({
  label,
  type,
  onTypeChange,
  internalId,
  onInternalIdChange,
  external,
  onExternalChange,
  examiners,
  lang,
}: {
  label: string;
  type: 'internal' | 'external';
  onTypeChange: (t: 'internal' | 'external') => void;
  internalId: string;
  onInternalIdChange: (id: string) => void;
  external: ExternalExaminerInput;
  onExternalChange: (v: ExternalExaminerInput) => void;
  examiners: ExaminerUser[];
  lang: 'he' | 'en';
}) {
  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';
  return (
    <div className="mt-4 rounded-lg border border-line p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{label}</span>
        <div className="flex gap-1 rounded-full bg-paper p-0.5">
          {(['internal', 'external'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTypeChange(t)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                type === t ? 'bg-primary text-primary-ink' : 'text-muted'
              }`}
            >
              {t === 'internal' ? (lang === 'he' ? 'פנימי' : 'Internal') : lang === 'he' ? 'חיצוני' : 'External'}
            </button>
          ))}
        </div>
      </div>

      {type === 'internal' ? (
        <select value={internalId} onChange={(e) => onInternalIdChange(e.target.value)} className={`${inputCls} mt-2`}>
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
            value={external.name}
            onChange={(e) => onExternalChange({ ...external, name: e.target.value })}
            className={inputCls}
          />
          <input
            placeholder={lang === 'he' ? 'דוא"ל' : 'Email'}
            dir="ltr"
            value={external.email}
            onChange={(e) => onExternalChange({ ...external, email: e.target.value })}
            className={inputCls}
          />
          <input
            placeholder={lang === 'he' ? 'מוסד' : 'Institution'}
            value={external.institution}
            onChange={(e) => onExternalChange({ ...external, institution: e.target.value })}
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
