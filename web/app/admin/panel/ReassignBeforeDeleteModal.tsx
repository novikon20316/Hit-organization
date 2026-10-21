'use client';

// app/admin/panel/ReassignBeforeDeleteModal.tsx
// Opened by UserRow.tsx's handleErase when eraseUserBySystemAdmin 409s with
// code: 'SUPERVISOR_ACTIVE_PROJECTS' (see server/src/services/
// accountDeletion.ts's checkDeletionEligibility and server/src/services/
// projectReassignment.ts) — instead of a dead-end inline error, lets the
// admin pick a replacement supervisor for each blocking project, then
// retries the delete. Not built on ConfirmDialog (that's a single-message
// yes/no); this needs a per-project supervisor picker, so it's its own
// dialog mirroring ConfirmDialog's shell/a11y conventions instead.

import { Select } from '@/components/ui/Select';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModalA11y } from '@/hooks/useModalA11y';
import { apiClient, type SupervisorBlockingProject } from '@/lib/apiClient';
import type { SupervisorOption } from '@/components/SupervisorCheckboxes';

interface ReassignBeforeDeleteModalProps {
  open: boolean;
  userDisplayName: string;
  userId: string;
  blockingProjects: SupervisorBlockingProject[];
  onDone: () => void;
  onCancel: () => void;
}

export function ReassignBeforeDeleteModal({
  open, userDisplayName, userId, blockingProjects, onDone, onCancel,
}: ReassignBeforeDeleteModalProps) {
  const { lang } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, open, onCancel);

  // Candidates per facultyId, fetched once per distinct faculty among the
  // blocking projects (several projects often share one) rather than once
  // per project. The parent gives this component a fresh `key` every time it
  // opens with a new set of blockingProjects (see UserRow.tsx), so every
  // piece of state below naturally starts clean on each open — no effect
  // needs to reset anything synchronously, only the async fetch below.
  const [candidatesByFaculty, setCandidatesByFaculty] = useState<Record<string, SupervisorOption[]>>({});
  const [loadingCandidates, setLoadingCandidates] = useState(() => blockingProjects.some((p) => p.facultyId));
  // projectId -> chosen replacement uid, or '' for "not picked yet" /
  // "leave unassigned" (only valid for a 'secondary' row).
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const facultyIds = [...new Set(blockingProjects.map((p) => p.facultyId).filter(Boolean))];
    if (facultyIds.length === 0) return; // nothing to fetch — loadingCandidates already starts false in this case
    let cancelled = false;
    Promise.all(facultyIds.map((id) => apiClient.getAdminSupervisors([id]).then((list) => [id, list] as const)))
      .then((pairs) => {
        if (cancelled) return;
        const next: Record<string, SupervisorOption[]> = {};
        pairs.forEach(([id, list]) => { next[id] = list as unknown as SupervisorOption[]; });
        setCandidatesByFaculty(next);
      })
      .catch(() => { if (!cancelled) setCandidatesByFaculty({}); })
      .finally(() => { if (!cancelled) setLoadingCandidates(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keying off the joined project ids avoids refetching on every unrelated parent re-render
  }, [blockingProjects.map((p) => p.id).join(',')]);

  if (!open) return null;

  const allPrimaryPicked = blockingProjects
    .filter((p) => p.role === 'primary')
    .every((p) => !!selections[p.id]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      for (const project of blockingProjects) {
        const picked = selections[project.id] || null;
        await apiClient.reassignProjectSupervisor(project.id, project.role, picked);
      }
      await apiClient.eraseUserBySystemAdmin(userId);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'ההחלפה נכשלה' : 'Reassignment failed');
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
        aria-labelledby="reassign-modal-title"
        className="w-full max-w-md rounded-[var(--radius)] bg-surface p-5 shadow-lg outline-none"
      >
        <h2 id="reassign-modal-title" className="text-base font-semibold text-ink">
          {lang === 'he' ? 'העברת אחריות לפני מחיקה' : 'Reassign Before Deleting'}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {lang === 'he'
            ? `${userDisplayName} מנחה/ה פרויקט${blockingProjects.length === 1 ? '' : 'ים'} פעיל${blockingProjects.length === 1 ? '' : 'ים'}. בחר/י מי ייקח אחריות על כל אחד לפני שניתן יהיה למחוק את החשבון.`
            : `${userDisplayName} supervises ${blockingProjects.length} active project${blockingProjects.length === 1 ? '' : 's'}. Pick who takes over each one before the account can be deleted.`}
        </p>

        <div className="mt-4 grid gap-3">
          {blockingProjects.map((project) => {
            const options = candidatesByFaculty[project.facultyId] ?? [];
            // Never offer the departing supervisor themself as their own
            // replacement — they're still in the candidate list until deleted.
            const filteredOptions = options.filter((o) => o.id !== userId);
            return (
              <div key={project.id} className="rounded-lg border border-line p-3">
                <p className="text-sm font-medium text-ink">
                  {lang === 'he' ? project.titleHe || project.titleEn : project.titleEn || project.titleHe}
                </p>
                <p className="text-xs text-muted">
                  {project.role === 'primary'
                    ? (lang === 'he' ? 'מנחה ראשי' : 'Primary supervisor')
                    : (lang === 'he' ? 'מנחה משני' : 'Secondary supervisor')}
                </p>
                <Select
                  className="mt-2 w-full rounded-lg border border-line bg-paper px-2.5 py-1.5 text-sm text-ink"
                  value={selections[project.id] ?? ''}
                  disabled={loadingCandidates || submitting}
                  onChange={(e) => setSelections((prev) => ({ ...prev, [project.id]: e.target.value }))}
                >
                  <option value="">
                    {loadingCandidates
                      ? '…'
                      : project.role === 'secondary'
                      ? (lang === 'he' ? 'ללא מנחה משני' : 'No secondary supervisor')
                      : (lang === 'he' ? 'בחר/י מנחה חלופי' : 'Select a replacement')}
                  </option>
                  {filteredOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.displayName}</option>
                  ))}
                </Select>
              </div>
            );
          })}
        </div>

        {error && <p className="mt-3 rounded-md bg-danger-bg px-2.5 py-1.5 text-xs text-danger" role="alert">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper"
          >
            {lang === 'he' ? 'ביטול' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || loadingCandidates || !allPrimaryPicked}
            className="rounded-lg bg-danger px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? '…' : lang === 'he' ? 'העבר ומחק' : 'Reassign & Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
