'use client';

// app/coordinator/home/PendingMilestoneCard.tsx
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getFacultyColor } from '@/lib/facultyColors';
import { facultyLabel } from '@/lib/i18n';
import { apiClient } from '@/lib/apiClient';
import { ApproveMilestoneModal } from './ApproveMilestoneModal';
import { RejectMilestoneModal } from './RejectMilestoneModal';
import { MILESTONE_LABEL, type CoordinatorPendingMilestone } from './types';

interface PendingMilestoneCardProps {
  milestone: CoordinatorPendingMilestone;
  onChanged: () => void;
  onApproveFinalReport: (milestone: CoordinatorPendingMilestone) => void;
}

export function PendingMilestoneCard({ milestone: m, onChanged, onApproveFinalReport }: PendingMilestoneCardProps) {
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rowError, setRowError] = useState('');
  const facultyColor = getFacultyColor(m.facultyId);
  const isFinalReport = m.type === 'final_report';

  const handleApproveClick = () => {
    if (isFinalReport) {
      onApproveFinalReport(m);
      return;
    }
    setShowApprove(true);
  };

  const handleApprove = async (comment: string) => {
    setApproving(true);
    setRowError('');
    try {
      await apiClient.coordinatorApproveMilestone(m.id, comment || undefined);
      setShowApprove(false);
      onChanged();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Failed to approve milestone');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (reason: string) => {
    setRejecting(true);
    setRowError('');
    try {
      await apiClient.coordinatorRejectMilestone(m.id, reason);
      setShowReject(false);
      onChanged();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Failed to reject milestone');
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': facultyColor } as React.CSSProperties}>
      <button type="button" onClick={() => setExpanded((v) => !v)} className="w-full text-start">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted">{MILESTONE_LABEL[m.type]?.[lang] ?? m.type}</span>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: `${facultyColor}1F`, color: facultyColor }}
          >
            {facultyLabel(m.facultyId, lang)}
          </span>
        </div>
        <p className="mt-1 text-sm font-semibold text-ink">{lang === 'he' ? m.projectTitleHe : m.projectTitleEn}</p>
        <p className="mt-0.5 text-xs text-muted">👤 {m.studentNames.join(', ')}</p>
        {m.supervisorScore !== null && (
          <p className="mt-0.5 text-xs text-muted">
            ✏️ {lang === 'he' ? 'ציון מנחה:' : 'Supervisor score:'} {m.supervisorScore}
          </p>
        )}
      </button>

      {expanded && (
        <div className="mt-3 grid gap-2 border-t border-line pt-3">
          {(m.supervisorScore !== null || m.supervisorComment) && (
            <div className="rounded-lg bg-paper p-2.5">
              <p className="text-xs font-semibold text-ink">{lang === 'he' ? '💬 מנחה' : '💬 Supervisor'}</p>
              {m.supervisorScore !== null && (
                <p className="text-xs text-muted">
                  {lang === 'he' ? 'ציון:' : 'Score:'} {m.supervisorScore}/100
                </p>
              )}
              {m.supervisorComment && <p className="text-xs text-muted">{m.supervisorComment}</p>}
            </div>
          )}

          {m.submissionNote && (
            <div className="rounded-lg bg-paper p-2.5">
              <p className="text-xs font-semibold text-ink">{lang === 'he' ? '📝 הערת סטודנט' : '📝 Student Note'}</p>
              <p className="text-xs text-muted">{m.submissionNote}</p>
            </div>
          )}

          {m.fileUrls && m.fileUrls.length > 0 && (
            <div className="rounded-lg bg-paper p-2.5">
              <p className="mb-1.5 text-xs font-semibold text-ink">{lang === 'he' ? '📎 קבצים שהועלו' : '📎 Uploaded Files'}</p>
              <div className="flex flex-wrap gap-1.5">
                {m.fileUrls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink hover:border-primary hover:text-primary"
                  >
                    📄 {lang === 'he' ? `קובץ ${i + 1}` : `File ${i + 1}`}
                  </a>
                ))}
              </div>
            </div>
          )}

          {m.revisionHistory && m.revisionHistory.length > 0 && (
            <div className="rounded-lg bg-paper p-2.5">
              <p className="mb-1.5 text-xs font-semibold text-ink">
                {lang === 'he' ? `🕘 היסטוריית הגשות (${m.revisionHistory.length})` : `🕘 Submission History (${m.revisionHistory.length})`}
              </p>
              <div className="grid gap-2">
                {m.revisionHistory.map((rev) => (
                  <div key={rev.version} className="rounded-md border border-line bg-surface p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-ink">
                        {lang === 'he' ? `גרסה ${rev.version}` : `Version ${rev.version}`}
                      </span>
                      {rev.decision && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={
                            rev.decision === 'rejected'
                              ? { backgroundColor: 'var(--danger-bg)', color: 'var(--danger)' }
                              : { backgroundColor: 'var(--success-bg)', color: 'var(--success)' }
                          }
                        >
                          {rev.decision === 'rejected'
                            ? (lang === 'he' ? '❌ נדחתה' : '❌ Rejected')
                            : (lang === 'he' ? '✅ אושרה' : '✅ Approved')}
                        </span>
                      )}
                    </div>
                    {rev.submissionNote && <p className="mt-1 text-xs text-muted">📝 {rev.submissionNote}</p>}
                    {rev.decisionReason && (
                      <p className="mt-1 text-xs text-danger">
                        {lang === 'he' ? 'סיבת דחייה: ' : 'Rejection reason: '}
                        {rev.decisionReason}
                      </p>
                    )}
                    {rev.fileUrls.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {rev.fileUrls.map((url, i) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink hover:border-primary hover:text-primary"
                          >
                            📄 {lang === 'he' ? `קובץ ${i + 1}` : `File ${i + 1}`}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {rowError && <p className="mt-2 rounded-md bg-danger-bg px-2.5 py-1.5 text-xs text-danger" role="alert">{rowError}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleApproveClick}
          disabled={approving}
          className="flex-1 rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {isFinalReport
            ? lang === 'he'
              ? '👥 אשר + הקצה בוחנים'
              : '👥 Approve + Assign Examiners'
            : lang === 'he'
              ? '✅ אשר'
              : '✅ Approve'}
        </button>
        <button
          type="button"
          onClick={() => setShowReject(true)}
          className="flex-1 rounded-lg border border-danger px-3 py-2 text-xs font-semibold text-danger hover:bg-danger-bg"
        >
          {isFinalReport ? (lang === 'he' ? '👥 דחה' : '👥 Reject') : lang === 'he' ? '❌ דחה' : '❌ Reject'}
        </button>
      </div>

      <ApproveMilestoneModal open={showApprove} busy={approving} onCancel={() => setShowApprove(false)} onConfirm={handleApprove} />
      <RejectMilestoneModal open={showReject} busy={rejecting} onCancel={() => setShowReject(false)} onConfirm={handleReject} />
    </div>
  );
}
