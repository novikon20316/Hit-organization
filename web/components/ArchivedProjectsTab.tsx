'use client';

// components/ArchivedProjectsTab.tsx
// Shared between coordinator/home and admin/panel — both roles get the exact
// same Archived view: pending erasure requests to decide on, plus every
// already-archived project (search by name, full milestone history, restore).
// See server's services/projectErasure.ts for the underlying protocol.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { getFacultyColor } from '@/lib/facultyColors';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const MILESTONE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר', en: 'Research Proposal' },
  progress_report: { he: 'דו"ח התקדמות', en: 'Progress Report' },
  final_report: { he: 'דו"ח מסכם', en: 'Final Report' },
  defense: { he: 'הגנה', en: 'Defense' },
  poster: { he: 'פוסטר', en: 'Poster Session' },
};

type ErasureRequest = Awaited<ReturnType<typeof apiClient.listPendingErasureRequests>>['requests'][number];
type ArchivedProject = Awaited<ReturnType<typeof apiClient.listArchivedProjects>>['projects'][number];

export function ArchivedProjectsTab() {
  const { lang, t } = useLanguage();
  const [requests, setRequests] = useState<ErasureRequest[]>([]);
  const [projects, setProjects] = useState<ArchivedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [rejectReasonFor, setRejectReasonFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [restoringProject, setRestoringProject] = useState<ArchivedProject | null>(null);
  const [restoring, setRestoring] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [reqRes, projRes] = await Promise.all([
        apiClient.listPendingErasureRequests(),
        apiClient.listArchivedProjects(),
      ]);
      setRequests(reqRes.requests ?? []);
      setProjects(projRes.projects ?? []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת הארכיון נכשלה' : 'Failed to load the archive');
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.titleHe?.toLowerCase().includes(q) || p.titleEn?.toLowerCase().includes(q));
  }, [projects, search]);

  const decide = async (requestId: string, decision: 'approved' | 'rejected', reason?: string) => {
    setDecidingId(requestId);
    try {
      await apiClient.decideErasureRequest(requestId, decision, reason);
      setRejectReasonFor(null);
      setRejectReason('');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'הפעולה נכשלה' : 'Action failed');
    } finally {
      setDecidingId(null);
    }
  };

  const handleRestore = async () => {
    if (!restoringProject) return;
    setRestoring(true);
    try {
      await apiClient.restoreProject(restoringProject.id);
      setRestoringProject(null);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'השחזור נכשל' : 'Restore failed');
    } finally {
      setRestoring(false);
    }
  };

  if (loading) return <p className="text-sm text-muted">{t('loading')}</p>;

  return (
    <div>
      {error && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      <div className="mb-5">
        <h3 className="mb-2 text-sm font-semibold text-ink">{t('pendingErasureRequests')} {requests.length > 0 ? `(${requests.length})` : ''}</h3>
        {requests.length === 0 ? (
          <p className="text-sm text-muted">{t('noErasureRequests')}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {requests.map((r) => (
              <div key={r.id} className="rounded-[var(--radius)] border border-line bg-surface p-4">
                <p className="text-sm font-semibold text-ink">{lang === 'he' ? r.projectTitleHe : r.projectTitleEn}</p>
                <p className="mt-1 text-xs text-muted">{t('erasureRequestedBy')}: {r.requestedByRole}</p>
                <p className="mt-1 text-xs text-muted">{t('erasureReason')}: {r.reason}</p>

                {rejectReasonFor === r.id ? (
                  <div className="mt-3 grid gap-2">
                    <input
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder={t('erasureReason')}
                      className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={decidingId === r.id || !rejectReason.trim()}
                        onClick={() => decide(r.id, 'rejected', rejectReason)}
                        className="flex-1 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                      >
                        {t('rejectErasure')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setRejectReasonFor(null); setRejectReason(''); }}
                        className="flex-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-paper"
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={decidingId === r.id}
                      onClick={() => decide(r.id, 'approved')}
                      className="flex-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
                    >
                      {t('approveErasure')}
                    </button>
                    <button
                      type="button"
                      disabled={decidingId === r.id}
                      onClick={() => setRejectReasonFor(r.id)}
                      className="flex-1 rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-bg disabled:opacity-60"
                    >
                      {t('rejectErasure')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchArchivedProjects')}
          className="w-full max-w-sm rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
        />
      </div>

      {filteredProjects.length === 0 ? (
        <p className="text-sm text-muted">{t('noArchivedProjects')}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredProjects.map((p) => {
            const color = getFacultyColor(p.facultyId);
            const isOpen = !!expanded[p.id];
            return (
              <div key={p.id} className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': color } as React.CSSProperties}>
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${color}1F`, color }}>
                    {facultyLabel(p.facultyId as FacultyId, lang)}
                  </span>
                  {p.deletedAt && (
                    <span className="text-xs text-muted">{t('erasedOn')}: {new Date(p.deletedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}</span>
                  )}
                </div>
                <p className="mt-2 text-sm font-semibold text-ink">{lang === 'he' ? p.titleHe : p.titleEn}</p>
                <p className="mt-1 text-xs text-muted">👨‍🏫 {p.supervisorName || (lang === 'he' ? 'ללא מנחה' : 'No Supervisor')}</p>
                <p className="mt-1 text-xs text-muted">👥 {p.enrolledStudentNames.join(', ') || (lang === 'he' ? 'אין סטודנטים' : 'No students')}</p>

                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                  className="mt-2 text-xs font-medium text-primary hover:underline"
                >
                  {isOpen ? '▲' : '▼'} {lang === 'he' ? 'התקדמות' : 'Progress'}
                </button>

                {isOpen && (
                  <div className="mt-2 rounded-lg bg-paper p-2.5">
                    {p.milestones.length === 0 ? (
                      <p className="text-xs text-muted">{lang === 'he' ? 'לא נוצרו אבני דרך' : 'No milestones created'}</p>
                    ) : (
                      p.milestones.map((m: any, idx: number) => (
                        <div key={m.id ?? idx} className={`flex items-center justify-between py-1.5 text-xs ${idx < p.milestones.length - 1 ? 'border-b border-line' : ''}`}>
                          <span className="font-medium text-ink">{MILESTONE_LABEL[m.type]?.[lang] ?? m.type}</span>
                          <span className="text-muted">{m.status}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setRestoringProject(p)}
                  className="mt-3 w-full rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-primary hover:text-primary"
                >
                  ♻️ {t('restoreProject')}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!restoringProject}
        title={t('restoreProject')}
        message={t('restoreProjectConfirm')}
        confirmLabel={t('restoreProject')}
        cancelLabel={t('cancel')}
        busy={restoring}
        onConfirm={handleRestore}
        onCancel={() => setRestoringProject(null)}
      />
    </div>
  );
}
