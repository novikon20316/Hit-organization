'use client';

// app/workflow-templates/page.tsx
// Ported from mobile/app/(tabs)/WorkflowTemplateManager.tsx — a top-level
// route shared across several role dashboards (faculty_admin, coordinator,
// grad_school_head, ...), not nested under any one role, mirroring
// /reports and /info-files.

import { useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, ApiError, SoftError } from '@/lib/apiClient';
import type { AppRole } from '@/lib/roles';
import { FACULTY_LABELS, facultyLabel, type FacultyId } from '@/lib/i18n';
import { ProposeVersionModal } from './ProposeVersionModal';
import { RejectModal } from './RejectModal';
import {
  PROCESS_TYPES, canApproveTemplate, isMastersProcess, processTypeLabel, majorOptionsFor, chainRoleLabel, DEFAULT_ROUTING,
  type ProcessType, type WorkflowTemplateDoc, type MilestoneRoutingSpec,
} from './types';

// Renders a chain's stages as "Role (grades/approves)" joined by arrows —
// used for both the template-level default and any milestone override in
// the read-only Current Template view.
function chainSummary(chain: MilestoneRoutingSpec, lang: 'he' | 'en'): string {
  return chain
    .map((stage) => `${chainRoleLabel(stage.role, lang)} (${stage.action === 'grade' ? (lang === 'he' ? 'מדרג' : 'grades') : (lang === 'he' ? 'מאשר' : 'approves')})`)
    .join(' → ');
}

const WORKFLOW_TEMPLATE_ROLES: AppRole[] = ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'];
// These roles have no single "home" faculty (facultyId === 'all') — they
// must explicitly pick which faculty's templates they're viewing/proposing
// for, or every fetch/propose silently targets a facultyId ('all') that no
// real project ever has (see workflowTemplateController.ts). system_admin
// and grad_school_head get a free faculty picker; administrative_secretary
// is scoped further still (see isCoordinator below) — never a free choice,
// only whichever subject(s) her own coordinatorScopes actually assign her.
const FREE_CHOICE_CROSS_FACULTY_ROLES: AppRole[] = ['system_admin', 'grad_school_head'];
const SELECTABLE_FACULTY_IDS = (Object.keys(FACULTY_LABELS) as FacultyId[]).filter((id) => id !== 'all');

export default function WorkflowTemplatesPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(WORKFLOW_TEMPLATE_ROLES);
  const { userData } = useAuth();
  const { lang, t } = useLanguage();

  const [activeProcessType, setActiveProcessType] = useState<ProcessType>('msc_thesis');
  const [tab, setTab] = useState<'current' | 'pending' | 'history'>('current');
  const [templates, setTemplates] = useState<WorkflowTemplateDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [proposeOpen, setProposeOpen] = useState(false);
  // 'other' pre-fills the new-version draft from the sibling process type's
  // approved template (msc_thesis <-> msc_project only — bsc_project has no
  // sibling) instead of this one's own, so staff whose thesis/project tracks
  // are identical don't have to re-enter every milestone by hand.
  const [proposeFrom, setProposeFrom] = useState<'own' | 'other'>('own');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Approve, for a template proposed with applyMode 'now', shows a preview
  // of affected in-progress projects before actually confirming — see
  // handleApprove below.
  const [approvePreview, setApprovePreview] = useState<{ tpl: WorkflowTemplateDoc; count: number } | null>(null);

  const role = userData?.role as AppRole | undefined;
  const isCoordinator = role === 'administrative_secretary';
  const isFreeChoiceCrossFaculty = !!role && FREE_CHOICE_CROSS_FACULTY_ROLES.includes(role);

  const [selectedFacultyId, setSelectedFacultyId] = useState<string>('');
  const [selectedMajor, setSelectedMajor] = useState<string | null>(null);
  const [coordinatorScopeIndex, setCoordinatorScopeIndex] = useState(0);

  // The administrative coordinator's own assigned subject(s) — {facultyId, major?}
  // tuples on her own user doc's coordinatorScopes (same generic field the
  // 'coordinator' role uses; see server/src/controllers/
  // workflowTemplateController.ts's resolveCoordinatorScope). Never a free
  // choice: if she holds more than one, she picks among only her own.
  const coordinatorScopes = (userData?.coordinatorScopes ?? []) as { facultyId: string; major?: string }[];
  const coordinatorScope = isCoordinator ? coordinatorScopes[coordinatorScopeIndex] : undefined;

  const facultyId = isFreeChoiceCrossFaculty ? selectedFacultyId : isCoordinator ? coordinatorScope?.facultyId : userData?.facultyId;
  const major: string | null = role === 'system_admin' ? selectedMajor : isCoordinator ? (coordinatorScope?.major ?? null) : null;

  useEffect(() => {
    if (isFreeChoiceCrossFaculty && !selectedFacultyId && SELECTABLE_FACULTY_IDS.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- role (and so isFreeChoiceCrossFaculty) only becomes known once userData loads asynchronously; this just seeds a sensible default the first time that becomes true, same pattern as the fetch-on-mount effects elsewhere in this file
      setSelectedFacultyId(SELECTABLE_FACULTY_IDS[0]!);
    }
  }, [isFreeChoiceCrossFaculty, selectedFacultyId]);

  const majorOptions = role === 'system_admin' && facultyId ? majorOptionsFor(facultyId, activeProcessType, lang) : [];

  const fetchTemplates = useCallback(async () => {
    if (!facultyId) {
      setLoading(false);
      return;
    }
    try {
      const data = await apiClient.getWorkflowTemplates(facultyId, major);
      setTemplates((data.templates ?? []) as unknown as WorkflowTemplateDoc[]);
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת התבניות נכשלה' : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [facultyId, major, lang]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchTemplates's setState calls happen after its awaited network call resolves, not synchronously in this effect
    if (isAllowed) fetchTemplates();
  }, [isAllowed, fetchTemplates]);

  const approvedForActive = templates.find((tpl) => tpl.processType === activeProcessType && tpl.status === 'approved');
  const otherProcessType: ProcessType | null =
    activeProcessType === 'msc_thesis' ? 'msc_project'
    : activeProcessType === 'msc_project' ? 'msc_thesis'
    : null;
  const approvedForOther = otherProcessType
    ? templates.find((tpl) => tpl.processType === otherProcessType && tpl.status === 'approved')
    : undefined;
  const proposeSourceTpl = proposeFrom === 'other' ? approvedForOther : approvedForActive;
  const pending = templates.filter((tpl) => tpl.status === 'pending_approval');
  const pendingForActive = pending.filter((tpl) => tpl.processType === activeProcessType);
  const history = templates.filter((tpl) => tpl.status === 'rejected' || tpl.status === 'superseded');
  const historyForActive = history.filter((tpl) => tpl.processType === activeProcessType);

  // For an applyMode:'now' proposal, show a preview of affected in-progress
  // projects before actually approving — final confirmation re-fetched
  // right here since time may have passed since the proposal was created.
  const handleApproveClick = async (tpl: WorkflowTemplateDoc) => {
    if (tpl.applyMode !== 'now') {
      handleApprove(tpl);
      return;
    }
    setBusyId(tpl.id);
    setActionError('');
    try {
      const preview = await apiClient.getWorkflowTemplateRetroactivePreview({ facultyId: tpl.facultyId, major: tpl.major, processType: tpl.processType });
      setApprovePreview({ tpl, count: preview.count });
    } catch (err) {
      setActionError(err instanceof ApiError || err instanceof SoftError ? err.message : lang === 'he' ? 'טעינת התצוגה המקדימה נכשלה' : 'Failed to load the preview');
    } finally {
      setBusyId(null);
    }
  };

  const handleApprove = async (tpl: WorkflowTemplateDoc) => {
    setBusyId(tpl.id);
    setActionError('');
    try {
      await apiClient.approveWorkflowTemplate(tpl.id);
      setApprovePreview(null);
      await fetchTemplates();
    } catch (err) {
      setActionError(err instanceof ApiError || err instanceof SoftError ? err.message : lang === 'he' ? 'האישור נכשל' : 'Approval failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (reason: string) => {
    if (!rejectingId) return;
    setBusyId(rejectingId);
    setActionError('');
    try {
      await apiClient.rejectWorkflowTemplate(rejectingId, reason);
      setRejectingId(null);
      await fetchTemplates();
    } catch (err) {
      setActionError(err instanceof ApiError || err instanceof SoftError ? err.message : lang === 'he' ? 'הדחייה נכשלה' : 'Rejection failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    setActionError('');
    try {
      await apiClient.deleteWorkflowTemplate(id);
      setConfirmDeleteId(null);
      await fetchTemplates();
    } catch (err) {
      setActionError(err instanceof ApiError || err instanceof SoftError ? err.message : lang === 'he' ? 'המחיקה נכשלה' : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  return (
    <DashboardShell
      title={lang === 'he' ? 'תבניות תהליך' : 'Process Templates'}
      subtitle={lang === 'he' ? 'הגדרת אבני הדרך לכל סוג תהליך' : 'Configure the milestone list for each process type'}
    >
      {isFreeChoiceCrossFaculty && (
        <label className="mb-4 block max-w-xs">
          <span className="mb-1.5 block text-xs font-medium text-muted">
            {lang === 'he' ? 'פקולטה' : 'Faculty'}
          </span>
          <select
            value={selectedFacultyId}
            onChange={(e) => setSelectedFacultyId(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          >
            {SELECTABLE_FACULTY_IDS.map((id) => (
              <option key={id} value={id}>{FACULTY_LABELS[id][lang]}</option>
            ))}
          </select>
        </label>
      )}

      {isCoordinator && coordinatorScopes.length === 0 && (
        <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
          {lang === 'he'
            ? 'לא הוקצה לך תחום אחריות עדיין — פנה למנהל המערכת שיקצה לך תחום.'
            : 'No subject has been assigned to your account yet — ask your system_admin to assign one.'}
        </p>
      )}
      {isCoordinator && coordinatorScopes.length > 1 && (
        <label className="mb-4 block max-w-xs">
          <span className="mb-1.5 block text-xs font-medium text-muted">
            {lang === 'he' ? 'תחום אחריות' : 'Your subject'}
          </span>
          <select
            value={coordinatorScopeIndex}
            onChange={(e) => setCoordinatorScopeIndex(Number(e.target.value))}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          >
            {coordinatorScopes.map((s, i) => (
              <option key={i} value={i}>
                {facultyLabel(s.facultyId as FacultyId, lang)}
                {s.major ? ` — ${s.major}` : ` (${lang === 'he' ? 'כל המגמות' : 'all majors'})`}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {PROCESS_TYPES.map((pt) => (
          <button
            key={pt.key}
            type="button"
            onClick={() => setActiveProcessType(pt.key)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${
              activeProcessType === pt.key ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink'
            }`}
          >
            {lang === 'he' ? pt.he : pt.en}
          </button>
        ))}
      </div>

      {role === 'system_admin' && facultyId && (
        <label className="mb-4 block max-w-xs">
          <span className="mb-1.5 block text-xs font-medium text-muted">
            {lang === 'he' ? 'מגמה / תחום' : 'Subject / Major'}
          </span>
          <select
            value={selectedMajor ?? ''}
            onChange={(e) => setSelectedMajor(e.target.value || null)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          >
            <option value="">{lang === 'he' ? 'כל המגמות בפקולטה' : 'All majors in this faculty'}</option>
            {majorOptions.map((m) => (
              <option key={m.slug} value={m.slug}>{m.label}</option>
            ))}
          </select>
        </label>
      )}

      <div className="mb-5 flex gap-1 border-b border-line">
        {([
          { key: 'current' as const, label: lang === 'he' ? 'תבנית נוכחית' : 'Current Template', badge: 0 },
          { key: 'pending' as const, label: lang === 'he' ? 'ממתין לאישור' : 'Pending Approval', badge: pending.length },
          { key: 'history' as const, label: lang === 'he' ? 'היסטוריה' : 'History', badge: 0 },
        ]).map(({ key, label, badge }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {label}
            {badge > 0 ? ` (${badge})` : ''}
          </button>
        ))}
      </div>

      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{loadError}</p>}
      {actionError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{actionError}</p>}

      {loading ? (
        <p className="text-sm text-muted">{t('loading')}</p>
      ) : tab === 'current' ? (
        <div>
          {approvedForActive ? (
            <div className="mb-4 rounded-[var(--radius)] border border-line bg-surface p-4">
              <p className="mb-2 text-xs text-muted">
                {lang === 'he' ? `גרסה ${approvedForActive.version} · מאושר` : `Version ${approvedForActive.version} · Approved`}
              </p>
              <p className="mb-2 rounded-md bg-paper px-2.5 py-1.5 text-xs text-ink">
                🔀 {lang === 'he' ? 'שרשרת ברירת מחדל: ' : 'Default chain: '}
                {chainSummary(approvedForActive.defaultRouting && approvedForActive.defaultRouting.length > 0 ? approvedForActive.defaultRouting : DEFAULT_ROUTING, lang)}
              </p>
              {(() => {
                // Mirrors the server's own legacy-default fallback (workflowTemplates.ts's
                // resolveExaminerSignoffRole): omitted -> grad_school_head for msc_thesis,
                // none otherwise. 'none' (explicit opt-out) never displays.
                const resolvedSignoff = approvedForActive.examinerSignoffRole
                  ?? (approvedForActive.processType === 'msc_thesis' ? 'grad_school_head' : 'none');
                if (resolvedSignoff === 'none') return null;
                return (
                  <p className="mb-2 rounded-md bg-[#EFEBF6] px-2.5 py-1.5 text-xs font-medium" style={{ color: '#5B21B6' }}>
                    🎓 {lang === 'he' ? `הזמנת בוחנים דורשת אישור: ${chainRoleLabel(resolvedSignoff as any, lang)}` : `Examiner invitations require sign-off from: ${chainRoleLabel(resolvedSignoff as any, lang)}`}
                  </p>
                );
              })()}
              <p className="mb-2 rounded-md bg-[#EFEBF6] px-2.5 py-1.5 text-xs font-medium" style={{ color: '#5B21B6' }}>
                🎓 {lang === 'he'
                  ? `אישור ציון סופי (הגנה): ${chainRoleLabel(approvedForActive.finalGradeSignoffRole ?? 'grad_school_head', lang)}`
                  : `Final grade sign-off (defense): ${chainRoleLabel(approvedForActive.finalGradeSignoffRole ?? 'grad_school_head', lang)}`}
              </p>
              {[...approvedForActive.milestones]
                .sort((a, b) => a.order - b.order)
                .map((m, idx) => (
                  <div key={m.type} className={`flex items-center gap-2.5 py-2 ${idx > 0 ? 'border-t border-line' : ''}`}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-xs font-bold text-primary">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{lang === 'he' ? m.nameHe : m.nameEn}</p>
                      <p className="text-xs text-muted">
                        📅 {m.dateMode === 'fixed'
                          ? (lang === 'he' ? `תאריך קבוע: ${m.fixedDate ?? '—'}` : `Fixed: ${m.fixedDate ?? '—'}`)
                          : (lang === 'he' ? `יום ${m.dueDaysFromStart}` : `Day ${m.dueDaysFromStart}`)}
                        {m.requiresExaminers ? ` · 👥 ${lang === 'he' ? 'בוחנים' : 'Examiners'}` : ''}
                        {m.gradingComponents && m.gradingComponents.length > 0
                          ? ` · 📊 ${m.gradingComponents.length} ${lang === 'he' ? 'מרכיבי ציון' : 'grading components'}`
                          : ''}
                      </p>
                      {m.routing && m.routing.length > 0 && (
                        <p className="mt-0.5 text-[11px] text-accent">
                          🔀 {lang === 'he' ? 'שרשרת מותאמת: ' : 'Custom chain: '}{chainSummary(m.routing, lang)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="mb-4 rounded-[var(--radius)] border border-line bg-surface p-6 text-center">
              <p className="text-2xl">📋</p>
              <p className="mt-2 text-sm text-muted">
                {lang === 'he'
                  ? 'אין תבנית מאושרת לתהליך זה — נעשה שימוש בברירת המחדל של המערכת.'
                  : 'No approved template for this process yet — the system default is used.'}
              </p>
            </div>
          )}

          {pendingForActive.length > 0 && (
            <p className="mb-3 text-xs font-semibold text-accent">
              ⏳ {lang === 'he' ? 'יש הצעה ממתינה לאישור לתהליך זה' : 'A proposal is pending approval for this process'}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setProposeFrom('own'); setProposeOpen(true); }}
              className="flex-1 rounded-lg bg-primary py-3 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
            >
              ＋ {lang === 'he' ? 'הצע גרסה חדשה' : 'Propose New Version'}
            </button>
            {otherProcessType && approvedForOther && (
              <button
                type="button"
                onClick={() => { setProposeFrom('other'); setProposeOpen(true); }}
                title={lang === 'he'
                  ? `העתק את כל אבני הדרך מתבנית ${processTypeLabel(otherProcessType, lang)}`
                  : `Copy every milestone from the ${processTypeLabel(otherProcessType, lang)} template`}
                className="flex-1 rounded-lg border border-primary py-3 text-sm font-semibold text-primary hover:bg-[#EDE9FE]"
              >
                📋 {lang === 'he' ? `העתק מ${processTypeLabel(otherProcessType, lang)}` : `Copy from ${processTypeLabel(otherProcessType, lang)}`}
              </button>
            )}
          </div>
        </div>
      ) : tab === 'pending' ? pending.length === 0 ? (
        <p className="text-sm text-muted">✅ {lang === 'he' ? 'אין הצעות ממתינות' : 'No pending proposals'}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {pending.map((tpl) => {
            const canApprove = canApproveTemplate(tpl, userData);
            return (
              <div key={tpl.id} className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': 'var(--accent)' } as React.CSSProperties}>
                <p className="text-sm font-semibold text-ink">
                  {processTypeLabel(tpl.processType, lang)} · {lang === 'he' ? `גרסה ${tpl.version}` : `Version ${tpl.version}`}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {tpl.milestones.length} {lang === 'he' ? 'אבני דרך' : 'milestones'}
                  {tpl.proposedNote ? ` · ${tpl.proposedNote}` : ''}
                </p>
                {tpl.applyMode === 'now' && (
                  <p className="mt-1 text-xs font-medium text-danger">
                    ⚡ {lang === 'he' ? 'תחול מיידית על תהליכים בעיצומם' : 'Applies immediately to in-progress processes'}
                  </p>
                )}
                {!canApprove && (
                  <p className="mt-2 text-xs italic text-muted">
                    {isMastersProcess(tpl.processType)
                      ? lang === 'he'
                        ? 'ממתין לאישור ראש בית הספר ללימודי מוסמכים'
                        : 'Awaiting grad school head approval'
                      : lang === 'he'
                        ? 'ממתין לאישור הפקולטה'
                        : 'Awaiting faculty approval'}
                  </p>
                )}
                {canApprove && confirmDeleteId === tpl.id ? (
                  <div className="mt-3 grid gap-2">
                    <p className="text-xs text-danger">{lang === 'he' ? 'למחוק את ההצעה הזו לצמיתות?' : 'Permanently delete this proposal?'}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleDelete(tpl.id)}
                        disabled={busyId === tpl.id}
                        className="flex-1 rounded-lg bg-danger px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                      >
                        {lang === 'he' ? 'מחק' : 'Delete'}
                      </button>
                      <button type="button" onClick={() => setConfirmDeleteId(null)} className="flex-1 rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink">
                        {lang === 'he' ? 'ביטול' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                ) : canApprove ? (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleApproveClick(tpl)}
                      disabled={busyId === tpl.id}
                      className="flex-1 rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      ✅ {t('approve')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRejectingId(tpl.id)}
                      disabled={busyId === tpl.id}
                      className="flex-1 rounded-lg bg-danger px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      ❌ {t('reject')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(tpl.id)}
                      disabled={busyId === tpl.id}
                      className="rounded-lg border border-line px-2.5 py-2 text-xs font-medium text-danger hover:border-danger"
                    >
                      🗑️
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : historyForActive.length === 0 ? (
        <p className="text-sm text-muted">{lang === 'he' ? 'אין היסטוריה להצגה' : 'No history to show'}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {historyForActive.map((tpl) => {
            const canDelete = canApproveTemplate(tpl, userData);
            return (
              <div key={tpl.id} className="rounded-[var(--radius)] border border-line bg-surface p-4 opacity-90">
                <p className="text-sm font-semibold text-ink">
                  {processTypeLabel(tpl.processType, lang)} · {lang === 'he' ? `גרסה ${tpl.version}` : `Version ${tpl.version}`}
                  {' · '}
                  <span className={tpl.status === 'rejected' ? 'text-danger' : 'text-muted'}>
                    {tpl.status === 'rejected' ? (lang === 'he' ? 'נדחה' : 'Rejected') : (lang === 'he' ? 'הוחלף' : 'Superseded')}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted">
                  {tpl.milestones.length} {lang === 'he' ? 'אבני דרך' : 'milestones'}
                  {tpl.rejectionReason ? ` · ${tpl.rejectionReason}` : ''}
                </p>
                {tpl.retroactiveAffectedCount !== undefined && (
                  <p className="mt-1 text-xs text-muted">
                    {lang === 'he' ? `הוחל רטרואקטיבית על ${tpl.retroactiveAffectedCount} תהליכים` : `Retroactively applied to ${tpl.retroactiveAffectedCount} process(es)`}
                  </p>
                )}
                {canDelete && (
                  confirmDeleteId === tpl.id ? (
                    <div className="mt-3 grid gap-2">
                      <p className="text-xs text-danger">{lang === 'he' ? 'למחוק לצמיתות?' : 'Permanently delete?'}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleDelete(tpl.id)}
                          disabled={busyId === tpl.id}
                          className="flex-1 rounded-lg bg-danger px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                        >
                          {lang === 'he' ? 'מחק' : 'Delete'}
                        </button>
                        <button type="button" onClick={() => setConfirmDeleteId(null)} className="flex-1 rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink">
                          {lang === 'he' ? 'ביטול' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(tpl.id)}
                      className="mt-3 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-danger hover:border-danger"
                    >
                      🗑️ {lang === 'he' ? 'מחק' : 'Delete'}
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      {proposeOpen && (
        <ProposeVersionModal
          processType={activeProcessType}
          facultyId={facultyId}
          major={major}
          initialMilestones={proposeSourceTpl?.milestones ?? []}
          initialDefaultRouting={proposeSourceTpl?.defaultRouting}
          initialExaminerSignoffRole={proposeSourceTpl?.examinerSignoffRole}
          initialFinalGradeSignoffRole={proposeSourceTpl?.finalGradeSignoffRole}
          copiedFromLabel={proposeFrom === 'other' && otherProcessType ? processTypeLabel(otherProcessType, lang) : undefined}
          onClose={() => setProposeOpen(false)}
          onProposed={() => {
            fetchTemplates();
            setTab('pending');
          }}
        />
      )}

      <RejectModal open={!!rejectingId} busy={busyId === rejectingId} onCancel={() => setRejectingId(null)} onConfirm={handleReject} />

      {approvePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-[var(--radius)] bg-surface p-5 shadow-lg">
            <h2 className="text-base font-semibold text-ink">⚡ {lang === 'he' ? 'החלה רטרואקטיבית' : 'Retroactive application'}</h2>
            <p className="mt-2 text-sm text-ink">
              {lang === 'he'
                ? `אישור התבנית יעדכן מיידית ${approvePreview.count} תהליכים בעיצומם.`
                : `Approving this template will immediately update ${approvePreview.count} in-progress process(es).`}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setApprovePreview(null)}
                disabled={busyId === approvePreview.tpl.id}
                className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper"
              >
                {lang === 'he' ? 'ביטול' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => handleApprove(approvePreview.tpl)}
                disabled={busyId === approvePreview.tpl.id}
                className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
              >
                {busyId === approvePreview.tpl.id ? '…' : lang === 'he' ? 'אשר בכל זאת' : 'Confirm & Approve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
