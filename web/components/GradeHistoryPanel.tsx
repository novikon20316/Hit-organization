'use client';

// components/GradeHistoryPanel.tsx
// Read-only grade history over the `grades` + `auditLog` collections
// (apiClient.getProjectGradeHistory → GET /api/grades/history/:projectId).
// Nothing here writes anything — it just surfaces what submitMilestoneGrade/
// submitIndividualGrade/approveFinalGrade already record.

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { MILESTONE_LABEL, type MilestoneType } from '@/app/student/home/types';

interface GradeEntry {
  id: string;
  graderId: string;
  graderRole: string;
  comments: string;
  isFinalized: boolean;
  submittedAt: string | null;
  grading: Record<string, number> | null;
}

interface AuditEntry {
  id: string;
  action: string;
  userId: string;
  userRole: string;
  oldValue: unknown;
  newValue: unknown;
  explanation: string | null;
  timestamp: string | null;
}

interface MilestoneGradeHistory {
  milestoneId: string;
  type: string | null;
  status: string | null;
  finalGrade: number | null;
  gradeApproved: boolean;
  gradeApprovedBy: string | null;
  gradeApprovedAt: string | null;
  grades: GradeEntry[];
  auditTrail: AuditEntry[];
}

const AUDIT_ACTION_LABEL: Record<string, { he: string; en: string }> = {
  grade_entered: { he: 'ציון הוזן', en: 'Grade entered' },
  grade_changed: { he: 'ציון עודכן', en: 'Grade changed' },
  final_grade_approved: { he: 'ציון סופי אושר', en: 'Final grade approved' },
  grade_approval_reverted: { he: 'אישור הציון בוטל', en: 'Grade approval reverted' },
};

function formatDate(iso: string | null, lang: 'he' | 'en'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function GradeHistoryPanel({ projectId }: { projectId: string }) {
  const { lang } = useLanguage();
  const [milestones, setMilestones] = useState<MilestoneGradeHistory[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    apiClient.getProjectGradeHistory(projectId)
      .then((res) => {
        if (cancelled) return;
        setMilestones(res.milestones as unknown as MilestoneGradeHistory[]);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load grade history:', err);
        setError(lang === 'he' ? 'טעינת היסטוריית הציונים נכשלה' : 'Failed to load grade history');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, lang]);

  const withActivity = (milestones ?? []).filter((m) => m.grades.length > 0 || m.auditTrail.length > 0);

  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface p-5">
      <p className="text-base font-semibold text-ink">📊 {lang === 'he' ? 'היסטוריית ציונים' : 'Grade History'}</p>

      {loading && <p className="mt-2 text-sm text-muted">{lang === 'he' ? 'טוען…' : 'Loading…'}</p>}
      {error && <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      {!loading && !error && withActivity.length === 0 && (
        <p className="mt-2 text-sm text-muted">
          {lang === 'he' ? 'אין עדיין רישומי ציונים.' : 'No grade records yet.'}
        </p>
      )}

      {!loading && !error && withActivity.length > 0 && (
        <div className="mt-3 grid gap-2">
          {withActivity.map((m) => {
            const label = MILESTONE_LABEL[m.type as MilestoneType];
            const isOpen = openId === m.milestoneId;
            return (
              <div key={m.milestoneId} className="rounded-md border border-line">
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : m.milestoneId)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left"
                >
                  <span className="text-sm font-medium text-ink">
                    {label ? (lang === 'he' ? label.he : label.en) : m.type}
                    {m.finalGrade !== null && (
                      <span className="ms-2 text-xs text-muted">
                        {lang === 'he' ? 'ציון סופי:' : 'Final:'} {m.finalGrade}
                        {m.gradeApproved ? ' ✅' : ''}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted">{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div className="border-t border-line px-3 py-3 text-sm">
                    {m.grades.length > 0 && (
                      <div className="grid gap-2">
                        {m.grades.map((g) => (
                          <div key={g.id} className="rounded-md bg-paper px-3 py-2">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-ink">{g.graderRole}</span>
                              <span className="text-xs text-muted">{formatDate(g.submittedAt, lang)}</span>
                            </div>
                            {g.grading && (
                              <p className="mt-1 text-xs text-muted">
                                {Object.entries(g.grading).map(([k, v]) => `${k}: ${v}`).join('  ·  ')}
                              </p>
                            )}
                            {g.comments && <p className="mt-1 text-xs text-ink">{g.comments}</p>}
                          </div>
                        ))}
                      </div>
                    )}

                    {m.auditTrail.length > 0 && (
                      <div className="mt-3 grid gap-1">
                        <p className="text-xs font-medium text-muted">
                          {lang === 'he' ? 'יומן שינויים:' : 'Change log:'}
                        </p>
                        {m.auditTrail.map((a) => {
                          const actionLabel = AUDIT_ACTION_LABEL[a.action];
                          return (
                            <p key={a.id} className="text-xs text-muted">
                              {formatDate(a.timestamp, lang)} — {actionLabel ? (lang === 'he' ? actionLabel.he : actionLabel.en) : a.action}
                              {a.explanation ? ` (${a.explanation})` : ''}
                            </p>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
