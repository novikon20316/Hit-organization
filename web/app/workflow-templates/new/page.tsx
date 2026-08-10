'use client';

// app/workflow-templates/new/page.tsx
// Routed replacement for the old ProposeVersionModal.tsx overlay — reached
// via router.push from the "Propose New Version" / "Copy from <other
// process type>" buttons on ../page.tsx, instead of opening as a dialog.
//
// processType/facultyId/major/from are threaded across the navigation
// boundary as plain query-string values (simple IDs) — the actual template
// data used to pre-fill the form (milestones, routing, sign-off roles, ...)
// is fetched independently, right here, the same way ../page.tsx fetches it
// (apiClient.getWorkflowTemplates), rather than shared via context/globals.
//
// On successful submit this navigates back to `/workflow-templates?tab=pending`
// (../page.tsx reads that `tab` param once, on mount, to land on the same
// tab the old onProposed callback used to switch to).
//
// useSearchParams() forces this static route into client-side rendering at
// the Suspense boundary during prerendering (Next.js requirement) — same
// pattern as app/maintenance/page.tsx and app/defense-access/page.tsx.

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, ApiError, SoftError } from '@/lib/apiClient';
import type { AppRole } from '@/lib/roles';
import { MilestoneRowModal } from '../MilestoneRowModal';
import { ChainEditor } from '../ChainEditor';
import {
  SIGNOFF_ROLES, DEFAULT_ROUTING, PROCESS_TYPES, chainRoleLabel, emptyMilestone, processTypeLabel,
  type ChainRole, type FormFieldSpec, type GradingComponentSpec, type MilestoneRoutingSpec, type MilestoneSpec, type ProcessType, type WorkflowTemplateDoc,
} from '../types';

// Same list as ../page.tsx's WORKFLOW_TEMPLATE_ROLES — duplicated rather
// than imported, matching this app's existing convention of each page file
// defining its own useRequireRole guard list locally (see e.g. ADMIN_ROLES
// in both app/admin/panel/page.tsx and
// app/admin/projects/[projectId]/milestones/page.tsx).
const WORKFLOW_TEMPLATE_ROLES: AppRole[] = ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'];

function isProcessType(v: string | null): v is ProcessType {
  return !!v && PROCESS_TYPES.some((p) => p.key === v);
}

function ProposeVersionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading: guardLoading, isAllowed } = useRequireRole(WORKFLOW_TEMPLATE_ROLES);
  const { lang, t } = useLanguage();

  const processTypeParam = searchParams.get('processType');
  const processType: ProcessType | null = isProcessType(processTypeParam) ? processTypeParam : null;
  const facultyId = searchParams.get('facultyId') ?? undefined;
  const major = searchParams.get('major'); // absent -> null ("all majors"), same meaning the modal's `major` prop used
  const proposeFrom: 'own' | 'other' = searchParams.get('from') === 'other' ? 'other' : 'own';

  const otherProcessType: ProcessType | null =
    processType === 'msc_thesis' ? 'msc_project' : processType === 'msc_project' ? 'msc_thesis' : null;

  const [loadingSource, setLoadingSource] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sourceTpl, setSourceTpl] = useState<WorkflowTemplateDoc | null>(null);

  useEffect(() => {
    if (!isAllowed || !processType) return;
    let cancelled = false;
    (async () => {
      if (!facultyId) {
        // No faculty resolved (e.g. a coordinator with no assigned subject
        // yet) — same edge case ../page.tsx's fetchTemplates guards
        // against. Just render the form with empty defaults rather than
        // failing the fetch.
        setLoadingSource(false);
        return;
      }
      try {
        const data = await apiClient.getWorkflowTemplates(facultyId, major);
        if (cancelled) return;
        const templates = (data.templates ?? []) as unknown as WorkflowTemplateDoc[];
        const wantType = proposeFrom === 'other' && otherProcessType ? otherProcessType : processType;
        setSourceTpl(templates.find((tpl) => tpl.processType === wantType && tpl.status === 'approved') ?? null);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת התבנית נכשלה' : 'Failed to load the template');
        }
      } finally {
        if (!cancelled) setLoadingSource(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount keyed on the (stable, URL-derived) query values; lang is intentionally excluded so a language toggle mid-fetch doesn't re-trigger it
  }, [isAllowed, processType, facultyId, major, proposeFrom, otherProcessType]);

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  if (!processType) {
    return (
      <DashboardShell title={lang === 'he' ? 'הצעת גרסה חדשה' : 'Propose New Version'}>
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
          {lang === 'he' ? 'קישור לא תקין — חסר סוג תהליך.' : 'Invalid link — missing process type.'}
        </p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title={lang === 'he' ? '➕ הצעת גרסה חדשה' : '➕ Propose New Version'}
      subtitle={processTypeLabel(processType, lang)}
    >
      {loadingSource ? (
        <p className="text-sm text-muted">{t('loading')}</p>
      ) : (
        <ProposeVersionForm
          processType={processType}
          facultyId={facultyId}
          major={major}
          initialMilestones={sourceTpl?.milestones ?? []}
          initialDefaultRouting={sourceTpl?.defaultRouting}
          initialExaminerSignoffRole={sourceTpl?.examinerSignoffRole}
          initialFinalGradeSignoffRole={sourceTpl?.finalGradeSignoffRole}
          copiedFromLabel={proposeFrom === 'other' && otherProcessType ? processTypeLabel(otherProcessType, lang) : undefined}
          loadError={loadError}
          onDone={() => router.push('/workflow-templates?tab=pending')}
          onCancel={() => router.push('/workflow-templates')}
        />
      )}
    </DashboardShell>
  );
}

interface ProposeVersionFormProps {
  processType: ProcessType;
  facultyId?: string;
  major: string | null;
  initialMilestones: MilestoneSpec[];
  initialDefaultRouting?: MilestoneRoutingSpec;
  initialExaminerSignoffRole?: ChainRole | 'none';
  initialFinalGradeSignoffRole?: ChainRole;
  copiedFromLabel?: string;
  loadError: string;
  onDone: () => void;
  onCancel: () => void;
}

// Full-page counterpart of the old ProposeVersionModal.tsx — same fields,
// same validation, same apiClient call; only the chrome around it changed
// (a plain page section instead of a fixed-overlay dialog). The nested
// MilestoneRowModal.tsx stays an actual modal, opened from within this page.
function ProposeVersionForm({
  processType, facultyId, major, initialMilestones, initialDefaultRouting, initialExaminerSignoffRole, initialFinalGradeSignoffRole,
  copiedFromLabel, loadError, onDone, onCancel,
}: ProposeVersionFormProps) {
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

  const handleSaveRow = (values: {
    nameHe: string; nameEn: string; dateMode: 'offset' | 'fixed'; dueDaysFromStart: number; fixedDate?: string;
    requiresExaminers: boolean; examinerCount?: number; gradingComponents: GradingComponentSpec[]; routing?: MilestoneRoutingSpec;
    staffRecordMode?: 'none' | 'upload_or_form'; staffFormFields?: FormFieldSpec[];
    finalGradeComponents?: MilestoneSpec['finalGradeComponents'];
    submissionRequirement: MilestoneSpec['submissionRequirement'];
  }) => {
    // `routing`/`finalGradeComponents` are only present in `values` when the
    // row's chain override / three-rubric toggle is ON — spread the rest in
    // when present, but explicitly drop any pre-existing value on the
    // milestone being edited when absent (turning either override off must
    // actually clear it, not leave the stale config behind).
    const { routing, finalGradeComponents, ...rest } = values;
    if (editingRow) {
      setMilestones((prev) => prev.map((m) => {
        if (m !== editingRow) return m;
        const next: MilestoneSpec = { ...m, ...rest };
        if (routing) next.routing = routing;
        else delete next.routing;
        if (finalGradeComponents) next.finalGradeComponents = finalGradeComponents;
        else delete next.finalGradeComponents;
        return next;
      }));
    } else {
      setMilestones((prev) => {
        const next: MilestoneSpec = { type: `custom_${Math.random().toString(36).slice(2, 10)}`, order: prev.length + 1, ...rest };
        if (routing) next.routing = routing;
        if (finalGradeComponents) next.finalGradeComponents = finalGradeComponents;
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
    const totalPercent = milestones.reduce((sum, m) => sum + (m.percentOfFinalGrade ?? 0), 0);
    if (Math.abs(totalPercent - 100) > 0.01) {
      setError(lang === 'he'
        ? `סכום האחוזים מהציון הסופי של כל אבני הדרך חייב להיות 100 (כרגע ${totalPercent})`
        : `The final-grade percentages across all milestones must sum to 100 (currently ${totalPercent})`);
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
      onDone();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof SoftError ? err.message : lang === 'he' ? 'שליחת ההצעה נכשלה' : 'Failed to submit the proposal');
    } finally {
      setSaving(false);
    }
  };

  const sorted = [...milestones].sort((a, b) => a.order - b.order);

  return (
    <div className="mx-auto w-full max-w-2xl pb-6">
      {copiedFromLabel && (
        <p className="mb-4 rounded-md bg-[#E9F0F5] px-2.5 py-1.5 text-xs text-[#3E6C8C]">
          📋 {lang === 'he' ? `הועתק מתבנית ${copiedFromLabel} — ניתן לערוך הכל לפני השליחה.` : `Copied from the ${copiedFromLabel} template — everything below is still editable before you submit.`}
        </p>
      )}

      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{loadError}</p>}

      <div className="rounded-[var(--radius)] border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
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
                  📅 {ms.dateMode === 'fixed'
                    ? (lang === 'he' ? `תאריך קבוע: ${ms.fixedDate ?? '—'}` : `Fixed: ${ms.fixedDate ?? '—'}`)
                    : (lang === 'he' ? `יום ${ms.dueDaysFromStart}` : `Day ${ms.dueDaysFromStart}`)}
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
      </div>

      <div className="mt-4 rounded-[var(--radius)] border border-line bg-surface p-5">
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

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block rounded-[var(--radius)] border border-line bg-surface p-5">
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
            {SIGNOFF_ROLES.map((r) => (
              <option key={r.key} value={r.key}>{chainRoleLabel(r.key, lang)}</option>
            ))}
          </select>
        </label>

        <label className="block rounded-[var(--radius)] border border-line bg-surface p-5">
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
            {SIGNOFF_ROLES.map((r) => (
              <option key={r.key} value={r.key}>{chainRoleLabel(r.key, lang)}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 rounded-[var(--radius)] border border-line bg-surface p-5">
        <span className="mb-1.5 block text-sm font-medium text-ink">
          {lang === 'he' ? 'מתי התבנית תיכנס לתוקף?' : 'When should this take effect?'}
        </span>
        <div className="grid gap-2 sm:grid-cols-2">
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

      <label className="mt-4 block rounded-[var(--radius)] border border-line bg-surface p-5">
        <span className="mb-1.5 block text-sm font-medium text-ink">{`${lang === 'he' ? 'הערה להצעה' : 'Note for this proposal'} (${t('optional')})`}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder={lang === 'he' ? 'למה מוצע השינוי...' : 'Why this change is proposed...'}
          className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
        />
      </label>

      {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
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

      <MilestoneRowModal open={rowModalOpen} editing={editingRow} onCancel={() => setRowModalOpen(false)} onSave={handleSaveRow} />
    </div>
  );
}

export default function ProposeVersionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-paper">
          <p className="text-sm text-muted">…</p>
        </div>
      }
    >
      <ProposeVersionContent />
    </Suspense>
  );
}
