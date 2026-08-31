'use client';

// app/faculty_admin/templates/page.tsx
// Ported from mobile/app/(tabs)/Facultytemplatemanager.tsx — faculty-admin
// CRUD for a project-proposal template catalog, plus an approve/reject
// workflow for proposals supervisors submit against those templates.
// Distinct from /workflow-templates, which manages an unrelated concept
// (faculty-configurable milestone workflows).

import { useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, ApiError, SoftError } from '@/lib/apiClient';
import type { AppRole } from '@/lib/roles';
import { TemplateEditorModal } from './TemplateEditorModal';
import { RejectProposalModal } from './RejectProposalModal';
import { degreeLabel, typeLabel, type FacultyTemplate } from './types';

const FACULTY_TEMPLATE_ROLES: AppRole[] = ['faculty_admin', 'system_admin'];

export default function FacultyTemplatesPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(FACULTY_TEMPLATE_ROLES);
  const { userData } = useAuth();
  const { lang, t } = useLanguage();

  const [tab, setTab] = useState<'templates' | 'pending'>('templates');
  const [templates, setTemplates] = useState<FacultyTemplate[]>([]);
  const [proposals, setProposals] = useState<FacultyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<FacultyTemplate | null>(null);
  const [rejectingTemplate, setRejectingTemplate] = useState<FacultyTemplate | null>(null);

  const facultyId = userData?.facultyId;

  const fetchDashboard = useCallback(async () => {
    if (!facultyId) return;
    try {
      const data = await apiClient.getFacultyTemplateDashboard(facultyId);
      setTemplates((data.templates ?? []) as unknown as FacultyTemplate[]);
      setProposals((data.proposals ?? []) as unknown as FacultyTemplate[]);
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת התבניות נכשלה' : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [facultyId, lang]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchDashboard's setState calls happen after its awaited network call resolves, not synchronously in this effect
    if (isAllowed) fetchDashboard();
  }, [isAllowed, fetchDashboard]);

  const handleDelete = async (tpl: FacultyTemplate) => {
    if (!window.confirm(lang === 'he' ? `למחוק את "${tpl.titleHe}"?` : `Delete "${tpl.titleEn}"?`)) return;
    setBusyId(tpl.id);
    setActionError('');
    try {
      await apiClient.deleteFacultyTemplate(tpl.id);
      await fetchDashboard();
    } catch (err) {
      setActionError(err instanceof ApiError || err instanceof SoftError ? err.message : lang === 'he' ? 'מחיקת התבנית נכשלה' : 'Failed to delete the template');
    } finally {
      setBusyId(null);
    }
  };

  const handleApprove = async (tpl: FacultyTemplate) => {
    setBusyId(tpl.id);
    setActionError('');
    try {
      await apiClient.approveTemplateProposal(tpl.id);
      await fetchDashboard();
    } catch (err) {
      setActionError(err instanceof ApiError || err instanceof SoftError ? err.message : lang === 'he' ? 'אישור ההצעה נכשל' : 'Failed to approve the proposal');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (reason: string) => {
    if (!rejectingTemplate) return;
    setBusyId(rejectingTemplate.id);
    setActionError('');
    try {
      await apiClient.rejectTemplateProposal(rejectingTemplate.id, reason);
      setRejectingTemplate(null);
      await fetchDashboard();
    } catch (err) {
      setActionError(err instanceof ApiError || err instanceof SoftError ? err.message : lang === 'he' ? 'דחיית ההצעה נכשלה' : 'Failed to reject the proposal');
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
      title={lang === 'he' ? 'תבניות פרויקט' : 'Project Templates'}
      subtitle={lang === 'he' ? 'ניהול קטלוג תבניות ואישור הצעות מנחים' : 'Manage the template catalog and supervisor proposals'}
    >
      <div className="mb-5 flex gap-1 border-b border-line">
        {([
          { key: 'templates' as const, label: lang === 'he' ? 'תבניות פרויקט' : 'Project Templates', badge: 0 },
          { key: 'pending' as const, label: lang === 'he' ? 'הצעות ממתינות' : 'Pending Proposals', badge: proposals.filter((p) => p.status === 'pending').length },
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

      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{loadError}</p>}
      {actionError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{actionError}</p>}

      {loading ? (
        <p className="text-sm text-muted">{t('loading')}</p>
      ) : tab === 'templates' ? (
        <div>
          <button
            type="button"
            onClick={() => {
              setEditingTemplate(null);
              setEditorOpen(true);
            }}
            className="mb-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
          >
            ＋ {lang === 'he' ? 'תבנית חדשה' : 'New Template'}
          </button>

          {templates.length === 0 ? (
            <p className="text-sm text-muted">📋 {lang === 'he' ? 'אין תבניות פרויקט לפקולטה זו עדיין.' : 'No project templates for this faculty yet.'}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {templates.map((tpl) => (
                <div key={tpl.id} className="rounded-[var(--radius)] border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{lang === 'he' ? tpl.titleHe : tpl.titleEn}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {degreeLabel(tpl.degree, lang)} · {typeLabel(tpl.type, lang)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTemplate(tpl);
                          setEditorOpen(true);
                        }}
                        className="rounded-md px-1.5 py-1 text-sm hover:bg-paper"
                        aria-label="edit"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(tpl)}
                        disabled={busyId === tpl.id}
                        className="rounded-md px-1.5 py-1 text-sm hover:bg-paper disabled:opacity-50"
                        aria-label="delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  {(lang === 'he' ? tpl.descriptionHe : tpl.descriptionEn) && (
                    <p className="mt-2 line-clamp-3 text-xs text-muted">{lang === 'he' ? tpl.descriptionHe : tpl.descriptionEn}</p>
                  )}
                  {tpl.skills && <p className="mt-1.5 text-xs text-muted">🛠️ {tpl.skills}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : proposals.length === 0 ? (
        <p className="text-sm text-muted">✅ {lang === 'he' ? 'אין הצעות ממתינות לאישור' : 'No pending proposals'}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {proposals.map((tpl) => (
            <div key={tpl.id} className="rounded-[var(--radius)] border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{lang === 'he' ? tpl.titleHe : tpl.titleEn}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    tpl.status === 'rejected' ? 'bg-danger-bg text-danger' : 'bg-[#FBF3E3] text-accent'
                  }`}
                >
                  {tpl.status === 'rejected' ? (lang === 'he' ? 'נדחה' : 'Rejected') : lang === 'he' ? 'ממתין' : 'Pending'}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                🎓 {degreeLabel(tpl.degree, lang)} · {typeLabel(tpl.type, lang)}
              </p>
              {(lang === 'he' ? tpl.descriptionHe : tpl.descriptionEn) && (
                <p className="mt-1.5 line-clamp-3 text-xs text-muted">{lang === 'he' ? tpl.descriptionHe : tpl.descriptionEn}</p>
              )}
              {tpl.skills && <p className="mt-1.5 text-xs text-muted">🛠️ {tpl.skills}</p>}
              {tpl.status === 'rejected' && tpl.rejectionReason && (
                <p className="mt-1.5 text-xs text-danger">
                  {lang === 'he' ? 'סיבת דחייה:' : 'Rejection reason:'} {tpl.rejectionReason}
                </p>
              )}
              {tpl.status === 'pending' && (
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
                    onClick={() => setRejectingTemplate(tpl)}
                    disabled={busyId === tpl.id}
                    className="flex-1 rounded-lg bg-danger px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                  >
                    ❌ {t('reject')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editorOpen && (
        <TemplateEditorModal
          key={editingTemplate?.id ?? 'new'}
          template={editingTemplate}
          onClose={() => setEditorOpen(false)}
          onSaved={fetchDashboard}
        />
      )}

      <RejectProposalModal
        open={!!rejectingTemplate}
        busy={busyId === rejectingTemplate?.id}
        onCancel={() => setRejectingTemplate(null)}
        onConfirm={handleReject}
      />
    </DashboardShell>
  );
}
