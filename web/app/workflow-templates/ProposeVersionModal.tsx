'use client';

// app/workflow-templates/ProposeVersionModal.tsx
// Milestone-list editor for proposing a new workflow-template version —
// pre-filled from the currently approved version (if any) so the proposer
// edits an existing list rather than starting from scratch.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, ApiError, SoftError } from '@/lib/apiClient';
import { MilestoneRowModal } from './MilestoneRowModal';
import { emptyMilestone, processTypeLabel, type GradingComponentSpec, type MilestoneSpec, type ProcessType } from './types';

interface ProposeVersionModalProps {
  processType: ProcessType;
  /** Required for cross-faculty proposers (system_admin/administrative_secretary/
   *  grad_school_head) — they have no single "home" faculty, so the server
   *  requires one to be named explicitly (see workflowTemplateController.ts). */
  facultyId?: string;
  initialMilestones: MilestoneSpec[];
  onClose: () => void;
  onProposed: () => void;
}

export function ProposeVersionModal({ processType, facultyId, initialMilestones, onClose, onProposed }: ProposeVersionModalProps) {
  const { lang, t } = useLanguage();
  const [milestones, setMilestones] = useState<MilestoneSpec[]>(initialMilestones.length > 0 ? initialMilestones.map((m) => ({ ...m })) : [emptyMilestone(1)]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [rowModalOpen, setRowModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<MilestoneSpec | null>(null);

  const openAddRow = () => {
    setEditingRow(null);
    setRowModalOpen(true);
  };
  const openEditRow = (ms: MilestoneSpec) => {
    setEditingRow(ms);
    setRowModalOpen(true);
  };

  const handleSaveRow = (values: { nameHe: string; nameEn: string; dueDaysFromStart: number; requiresExaminers: boolean; gradingComponents: GradingComponentSpec[] }) => {
    if (editingRow) {
      setMilestones((prev) => prev.map((m) => (m === editingRow ? { ...m, ...values } : m)));
    } else {
      setMilestones((prev) => [...prev, { type: `custom_${Math.random().toString(36).slice(2, 10)}`, order: prev.length + 1, ...values }]);
    }
    setRowModalOpen(false);
  };

  const removeRow = (ms: MilestoneSpec) => {
    setMilestones((prev) => prev.filter((m) => m !== ms).map((m, i) => ({ ...m, order: i + 1 })));
  };

  const handleSubmit = async () => {
    if (milestones.length === 0) {
      setError(lang === 'he' ? 'יש להוסיף לפחות אבן דרך אחת' : 'Add at least one milestone');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.createWorkflowTemplateProposal({
        processType,
        milestones,
        note: note.trim() || undefined,
        facultyId,
      });
      onProposed();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof SoftError ? err.message : lang === 'he' ? 'שליחת ההצעה נכשלה' : 'Failed to submit the proposal');
    } finally {
      setSaving(false);
    }
  };

  const sorted = [...milestones].sort((a, b) => a.order - b.order);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-[var(--radius)] bg-surface p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">➕ {lang === 'he' ? 'הצעת גרסה חדשה' : 'Propose New Version'}</h2>
          <button type="button" onClick={onClose} className="text-lg text-muted hover:text-ink">
            ✕
          </button>
        </div>

        <p className="mt-2 inline-block rounded-full bg-[#EFEBF6] px-2.5 py-1 text-xs font-semibold" style={{ color: '#5B21B6' }}>
          🎓 {processTypeLabel(processType, lang)}
        </p>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink">
            {lang === 'he' ? 'אבני דרך' : 'Milestones'} ({milestones.length})
          </span>
          <button type="button" onClick={openAddRow} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover">
            ＋ {t('add')}
          </button>
        </div>

        <div className="mt-2 grid gap-2">
          {sorted.map((ms, idx) => (
            <div key={ms.type} className="flex items-start gap-2.5 rounded-lg border border-line bg-paper p-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-xs font-bold text-primary">{idx + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{lang === 'he' ? ms.nameHe || '—' : ms.nameEn || '—'}</p>
                <p className="mt-0.5 text-xs text-muted">
                  📅 {lang === 'he' ? `יום ${ms.dueDaysFromStart}` : `Day ${ms.dueDaysFromStart}`}
                  {ms.requiresExaminers ? ` · 👥 ${lang === 'he' ? 'בוחנים' : 'Examiners'}` : ''}
                  {ms.gradingComponents && ms.gradingComponents.length > 0
                    ? ` · 📊 ${ms.gradingComponents.length} ${lang === 'he' ? 'מרכיבי ציון' : 'grading components'}`
                    : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" onClick={() => openEditRow(ms)} className="rounded-md px-1.5 py-1 text-sm hover:bg-surface" aria-label="edit">
                  ✏️
                </button>
                <button type="button" onClick={() => removeRow(ms)} className="rounded-md px-1.5 py-1 text-sm hover:bg-surface" aria-label="remove">
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{`${lang === 'he' ? 'הערה להצעה' : 'Note for this proposal'} (${t('optional')})`}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={lang === 'he' ? 'למה מוצע השינוי...' : 'Why this change is proposed...'}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
          />
        </label>

        {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
          >
            {saving ? '…' : lang === 'he' ? 'שלח לאישור' : 'Submit for Approval'}
          </button>
        </div>
      </div>

      <MilestoneRowModal open={rowModalOpen} editing={editingRow} onCancel={() => setRowModalOpen(false)} onSave={handleSaveRow} />
    </div>
  );
}
