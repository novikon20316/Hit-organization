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
import { ProposeVersionModal } from './ProposeVersionModal';
import { RejectModal } from './RejectModal';
import { PROCESS_TYPES, canApproveRole, isMastersProcess, processTypeLabel, type ProcessType, type WorkflowTemplateDoc } from './types';

const WORKFLOW_TEMPLATE_ROLES: AppRole[] = ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'];

export default function WorkflowTemplatesPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(WORKFLOW_TEMPLATE_ROLES);
  const { userData } = useAuth();
  const { lang, t } = useLanguage();

  const [activeProcessType, setActiveProcessType] = useState<ProcessType>('msc_thesis');
  const [tab, setTab] = useState<'current' | 'pending'>('current');
  const [templates, setTemplates] = useState<WorkflowTemplateDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [proposeOpen, setProposeOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const facultyId = userData?.facultyId;
  const role = userData?.role;

  const fetchTemplates = useCallback(async () => {
    if (!facultyId) return;
    try {
      const data = await apiClient.getWorkflowTemplates(facultyId);
      setTemplates((data.templates ?? []) as unknown as WorkflowTemplateDoc[]);
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת התבניות נכשלה' : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [facultyId, lang]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchTemplates's setState calls happen after its awaited network call resolves, not synchronously in this effect
    if (isAllowed) fetchTemplates();
  }, [isAllowed, fetchTemplates]);

  const approvedForActive = templates.find((tpl) => tpl.processType === activeProcessType && tpl.status === 'approved');
  const pending = templates.filter((tpl) => tpl.status === 'pending_approval');
  const pendingForActive = pending.filter((tpl) => tpl.processType === activeProcessType);

  const handleApprove = async (tpl: WorkflowTemplateDoc) => {
    setBusyId(tpl.id);
    setActionError('');
    try {
      await apiClient.approveWorkflowTemplate(tpl.id);
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

      <div className="mb-5 flex gap-1 border-b border-line">
        {([
          { key: 'current' as const, label: lang === 'he' ? 'תבנית נוכחית' : 'Current Template', badge: 0 },
          { key: 'pending' as const, label: lang === 'he' ? 'ממתין לאישור' : 'Pending Approval', badge: pending.length },
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
              {[...approvedForActive.milestones]
                .sort((a, b) => a.order - b.order)
                .map((m, idx) => (
                  <div key={m.type} className={`flex items-center gap-2.5 py-2 ${idx > 0 ? 'border-t border-line' : ''}`}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-xs font-bold text-primary">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{lang === 'he' ? m.nameHe : m.nameEn}</p>
                      <p className="text-xs text-muted">
                        📅 {lang === 'he' ? `יום ${m.dueDaysFromStart}` : `Day ${m.dueDaysFromStart}`}
                        {m.requiresExaminers ? ` · 👥 ${lang === 'he' ? 'בוחנים' : 'Examiners'}` : ''}
                      </p>
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

          <button
            type="button"
            onClick={() => setProposeOpen(true)}
            className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
          >
            ＋ {lang === 'he' ? 'הצע גרסה חדשה' : 'Propose New Version'}
          </button>
        </div>
      ) : pending.length === 0 ? (
        <p className="text-sm text-muted">✅ {lang === 'he' ? 'אין הצעות ממתינות' : 'No pending proposals'}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {pending.map((tpl) => {
            const canApprove = canApproveRole(tpl.processType, role);
            return (
              <div key={tpl.id} className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': 'var(--accent)' } as React.CSSProperties}>
                <p className="text-sm font-semibold text-ink">
                  {processTypeLabel(tpl.processType, lang)} · {lang === 'he' ? `גרסה ${tpl.version}` : `Version ${tpl.version}`}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {tpl.milestones.length} {lang === 'he' ? 'אבני דרך' : 'milestones'}
                  {tpl.proposedNote ? ` · ${tpl.proposedNote}` : ''}
                </p>
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
                {canApprove && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleApprove(tpl)}
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {proposeOpen && (
        <ProposeVersionModal
          processType={activeProcessType}
          initialMilestones={approvedForActive?.milestones ?? []}
          onClose={() => setProposeOpen(false)}
          onProposed={() => {
            fetchTemplates();
            setTab('pending');
          }}
        />
      )}

      <RejectModal open={!!rejectingId} busy={busyId === rejectingId} onCancel={() => setRejectingId(null)} onConfirm={handleReject} />
    </DashboardShell>
  );
}
