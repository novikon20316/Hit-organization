'use client';

// app/workflow-templates/ProposeVersionModal.tsx
// Milestone-list editor for proposing a new workflow-template version —
// pre-filled from the currently approved version (if any) so the proposer
// edits an existing list rather than starting from scratch.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, ApiError, SoftError } from '@/lib/apiClient';
import { MilestoneRowModal } from './MilestoneRowModal';
import { ChainEditor } from './ChainEditor';
import {
  CHAIN_ROLES, DEFAULT_ROUTING, chainRoleLabel, emptyMilestone, processTypeLabel,
  type ChainRole, type GradingComponentSpec, type MilestoneRoutingSpec, type MilestoneSpec, type ProcessType,
} from './types';

interface ProposeVersionModalProps {
  processType: ProcessType;
  /** Required for cross-faculty proposers (system_admin/grad_school_head) —
   *  they have no single "home" faculty, so the server requires one to be
   *  named explicitly (see workflowTemplateController.ts). For the
   *  administrative coordinator this is her resolved own-scope facultyId
   *  (never a free choice, but still sent so the server can match it
   *  against her coordinatorScopes if she holds more than one). */
  facultyId?: string;
  /** A major slug, or `null` for "all majors in this faculty" — resolved by
   *  the parent page (system_admin's picker, or the administrative
   *  coordinator's own scope), never asked again in here. */
  major: string | null;
  initialMilestones: MilestoneSpec[];
  /** Pre-fills from the currently approved version's chain, if any —
   *  matches how initialMilestones works. Falls back to DEFAULT_ROUTING
   *  (today's hardcoded behavior) when proposing the very first version. */
  initialDefaultRouting?: MilestoneRoutingSpec;
  /** Pre-fills from the currently approved version's examinerSignoffRole, if
   *  any — matches how initialDefaultRouting works. Omitted (proposing the
   *  very first version) falls back to the same legacy default the server
   *  applies: grad_school_head for msc_thesis, none otherwise. */
  initialExaminerSignoffRole?: ChainRole | 'none';
  /** Pre-fills from the currently approved version's finalGradeSignoffRole,
   *  if any. Omitted falls back to the server's own legacy default:
   *  grad_school_head, for every process type. */
  initialFinalGradeSignoffRole?: ChainRole;
  onClose: () => void;
  onProposed: () => void;
}

export function ProposeVersionModal({
  processType, facultyId, major, initialMilestones, initialDefaultRouting, initialExaminerSignoffRole, initialFinalGradeSignoffRole, onClose, onProposed,
}: ProposeVersionModalProps) {
  const { lang, t } = useLanguage();
  const [milestones, setMilestones] = useState<MilestoneSpec[]>(initialMilestones.length > 0 ? initialMilestones.map((m) => ({ ...m })) : [emptyMilestone(1)]);
  const [defaultRouting, setDefaultRouting] = useState<MilestoneRoutingSpec>(
    initialDefaultRouting && initialDefaultRouting.length > 0 ? initialDefaultRouting.map((s) => ({ ...s })) : DEFAULT_ROUTING.map((s) => ({ ...s }))
  );
  const [examinerSignoffRole, setExaminerSignoffRole] = useState<ChainRole | 'none'>(
    initialExaminerSignoffRole ?? (processType === 'msc_thesis' ? 'grad_school_head' : 'none')
  );
  const [finalGradeSignoffRole, setFinalGradeSignoffRole] = useState<ChainRole>(
    initialFinalGradeSignoffRole ?? 'grad_school_head'
  );
  const [note, setNote] = useState('');
  const [applyMode, setApplyMode] = useState<'now' | 'from_now_on'>('from_now_on');
  const [preview, setPreview] = useState<{ count: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleApplyModeChange = async (mode: 'now' | 'from_now_on') => {
    setApplyMode(mode);
    if (mode !== 'now' || !facultyId) return;
    setPreviewLoading(true);
    try {
      const result = await apiClient.getWorkflowTemplateRetroactivePreview({ facultyId, major, processType });
      setPreview({ count: result.count });
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

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

  const handleSaveRow = (values: { nameHe: string; nameEn: string; dueDaysFromStart: number; requiresExaminers: boolean; examinerCount?: number; gradingComponents: GradingComponentSpec[]; routing?: MilestoneRoutingSpec }) => {
    // `routing` is only present in `values` when the row's chain override is
    // ON — spread it in when present, but explicitly drop any pre-existing
    // `routing` on the milestone being edited when it's absent (turning the
    // override off must actually clear it, not leave the stale chain behind).
    const { routing, ...rest } = values;
    if (editingRow) {
      setMilestones((prev) => prev.map((m) => {
        if (m !== editingRow) return m;
        const next: MilestoneSpec = { ...m, ...rest };
        if (routing) next.routing = routing;
        else delete next.routing;
        return next;
      }));
    } else {
      setMilestones((prev) => {
        const next: MilestoneSpec = { type: `custom_${Math.random().toString(36).slice(2, 10)}`, order: prev.length + 1, ...rest };
        if (routing) next.routing = routing;
        return [...prev, next];
      });
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
        major,
        applyMode,
        defaultRouting,
        examinerSignoffRole,
        finalGradeSignoffRole,
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
                  {ms.routing && ms.routing.length > 0
                    ? ` · 🔀 ${lang === 'he' ? 'שרשרת מותאמת אישית' : 'custom chain'}`
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

        <div className="mt-4">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            {lang === 'he' ? 'שרשרת אישור/דחייה ברירת מחדל' : 'Default approval/rejection chain'}
          </span>
          <p className="mb-1.5 text-xs text-muted">
            {lang === 'he'
              ? 'חלה על כל אבן דרך שאין לה שרשרת משלה (ניתן לשנות לפי אבן דרך בעריכה שלה).'
              : 'Applies to every milestone without its own override (set per-milestone via its own edit screen).'}
          </p>
          <ChainEditor stages={defaultRouting} onChange={setDefaultRouting} />
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            {lang === 'he' ? 'אישור נוסף להזמנת בוחנים' : 'Second sign-off before examiner invitations go out'}
          </span>
          <p className="mb-1.5 text-xs text-muted">
            {lang === 'he'
              ? 'לאחר שהרכז מאשר את רשימת הבוחנים, ניתן לדרוש אישור נוסף מתפקיד ספציפי לפני שההזמנות נשלחות בפועל.'
              : "After a coordinator approves the recommended examiner list, require sign-off from a specific role before invitations actually go out."}
          </p>
          <select
            value={examinerSignoffRole}
            onChange={(e) => setExaminerSignoffRole(e.target.value as ChainRole | 'none')}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
          >
            <option value="none">{lang === 'he' ? 'ללא אישור נוסף' : 'No second sign-off'}</option>
            {CHAIN_ROLES.map((r) => (
              <option key={r.key} value={r.key}>{chainRoleLabel(r.key, lang)}</option>
            ))}
          </select>
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            {lang === 'he' ? 'אישור הציון הסופי (הגנה)' : 'Final grade sign-off (defense)'}
          </span>
          <p className="mb-1.5 text-xs text-muted">
            {lang === 'he'
              ? 'לאחר שהציון הסופי מחושב, תפקיד זה יאשר (או ידחה) אותו לפני ההעברה למכלול.'
              : "Once a defense milestone's final grade is computed, this role approves (or rejects) it before it transfers to Michlol."}
          </p>
          <select
            value={finalGradeSignoffRole}
            onChange={(e) => setFinalGradeSignoffRole(e.target.value as ChainRole)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
          >
            {CHAIN_ROLES.map((r) => (
              <option key={r.key} value={r.key}>{chainRoleLabel(r.key, lang)}</option>
            ))}
          </select>
        </label>

        <div className="mt-4">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            {lang === 'he' ? 'מתי התבנית תיכנס לתוקף?' : 'When should this take effect?'}
          </span>
          <div className="grid gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
              <input type="radio" checked={applyMode === 'from_now_on'} onChange={() => handleApplyModeChange('from_now_on')} className="accent-[var(--primary)]" />
              <span className="text-sm text-ink">
                {lang === 'he' ? 'מכאן ואילך (רק תהליכים חדשים)' : 'From now on (new processes only)'}
              </span>
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
              <input type="radio" checked={applyMode === 'now'} onChange={() => handleApplyModeChange('now')} className="accent-[var(--primary)]" />
              <span className="text-sm text-ink">
                {lang === 'he' ? 'עכשיו (גם תהליכים בעיצומם)' : 'Now (also in-progress processes)'}
              </span>
            </label>
          </div>
          {applyMode === 'now' && (
            <p className="mt-1.5 text-xs font-medium text-danger">
              {previewLoading
                ? '…'
                : preview
                  ? lang === 'he'
                    ? `⚡ יעדכן ${preview.count} תהליכים בעיצומם ברגע שהתבנית תאושר`
                    : `⚡ Will update ${preview.count} in-progress process(es) once approved`
                  : lang === 'he'
                    ? 'לא ניתן היה לחשב תצוגה מקדימה'
                    : 'Could not compute a preview'}
            </p>
          )}
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
