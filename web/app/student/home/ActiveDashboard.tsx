'use client';

// app/student/home/ActiveDashboard.tsx
// Ported from mobile/app/(tabs)/Activedashboard.tsx.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { SubmitMilestoneModal } from './SubmitMilestoneModal';
import { AnnouncementsBanner } from './AnnouncementsBanner';
import {
  MILESTONE_LABEL,
  MILESTONE_ORDER,
  STATUS_CONFIG,
  STATUS_LABEL,
  toDate,
  daysUntil,
  gradeColor,
  type ActiveProject,
  type Milestone,
} from './types';

interface ActiveDashboardProps {
  project: ActiveProject;
  milestones: Milestone[];
  progress: number;
  onChanged: () => void;
}

export function ActiveDashboard({ project, milestones, progress, onChanged }: ActiveDashboardProps) {
  const { lang, t } = useLanguage();
  const [tab, setTab] = useState<'overview' | 'milestones' | 'grades'>('overview');
  const [submitTarget, setSubmitTarget] = useState<Milestone | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [expandedGradeIds, setExpandedGradeIds] = useState<Record<string, boolean>>({});

  const isMastersThesis = project.degreeType === 'masters' && project.projectType === 'thesis';

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const res = await apiClient.getThesisTemplate();
      if (res.url) window.open(res.url, '_blank');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const isUnlocked = (m: Milestone): boolean => {
    const idx = MILESTONE_ORDER.indexOf(m.type);
    if (idx === 0) return true;
    return milestones
      .filter((prev) => MILESTONE_ORDER.indexOf(prev.type) < idx)
      .every((prev) => prev.status === 'coordinator_approved' || prev.status === 'completed');
  };

  const actionableNextMilestone =
    milestones.find((m) => (m.status === 'pending' || m.status === 'rejected') && isUnlocked(m)) ?? null;
  const overviewDisplayMilestone =
    milestones.find((m) => (['submitted', 'supervisor_graded', 'graded'] as string[]).includes(m.status)) ?? actionableNextMilestone;
  // Is there a milestone currently waiting on staff (freshly submitted and
  // not yet even looked at, or graded and waiting on the coordinator's
  // sign-off)? Omitting 'submitted' left a just-submitted milestone showing
  // a "days left" countdown and an enabled-looking "Submit Milestone" label
  // while the button was actually disabled, indistinguishable from a
  // stuck/broken button.
  const isWaitingApproval = milestones.some((m) => (['submitted', 'graded', 'supervisor_graded'] as string[]).includes(m.status));

  return (
    <div>
      <div className="mb-5 flex gap-1 border-b border-line">
        {(['overview', 'milestones', 'grades'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {key === 'overview'
              ? lang === 'he' ? 'סקירה' : 'Overview'
              : key === 'milestones'
                ? lang === 'he' ? 'אבני דרך' : 'Milestones'
                : lang === 'he' ? 'ציונים' : 'Grades'}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4">
          <AnnouncementsBanner />

          <div className="rounded-[var(--radius)] border border-line bg-surface p-5">
            <p className="text-base font-semibold text-ink">📁 {lang === 'he' ? project.titleHe : project.titleEn}</p>
            <p className="mt-1 text-sm text-muted">
              👨‍🏫 {project.supervisorName} · {project.academicYear}
            </p>
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{lang === 'he' ? 'התקדמות' : 'Progress'}</span>
                <span>{progress}%</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper">
                <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-muted">
                {milestones.filter((m) => m.status === 'coordinator_approved').length} / {milestones.length}{' '}
                {lang === 'he' ? 'אבני דרך הושלמו' : 'milestones completed'}
              </p>
            </div>
          </div>

          {overviewDisplayMilestone && (
            <div className="role-rail rounded-[var(--radius)] bg-surface p-5" style={{ '--rail-color': 'var(--primary)' } as React.CSSProperties}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">⚡ {lang === 'he' ? 'אבן הדרך הבאה' : 'Next Milestone'}</span>
                {isWaitingApproval ? (
                  <span className="rounded-full bg-[#FBF3E3] px-2.5 py-1 text-xs font-medium text-accent">
                    {lang === 'he' ? '⏳ ממתין לאישור' : '⏳ Awaiting approval'}
                  </span>
                ) : (
                  (() => {
                    const days = daysUntil(overviewDisplayMilestone.type === 'defense' ? overviewDisplayMilestone.defenseDate : overviewDisplayMilestone.dueDate);
                    return days !== null ? (
                      <span className="rounded-full bg-[#E9F0F5] px-2.5 py-1 text-xs font-medium text-[#3E6C8C]">
                        {days} {lang === 'he' ? 'ימים' : 'days left'}
                      </span>
                    ) : null;
                  })()
                )}
              </div>

              <p className="mt-2 text-sm text-ink">
                {(() => {
                  const nextPending = milestones.find((m) => m.status === 'pending' || m.status === 'rejected');
                  const displayType = nextPending?.type ?? overviewDisplayMilestone.type;
                  return MILESTONE_LABEL[displayType]?.[lang] ?? displayType;
                })()}
              </p>

              {actionableNextMilestone?.type === 'defense' && (
                <DefenseDetails milestone={actionableNextMilestone} />
              )}

              {actionableNextMilestone?.type !== 'defense' && (
                <button
                  type="button"
                  disabled={!actionableNextMilestone || isWaitingApproval}
                  onClick={() => actionableNextMilestone && setSubmitTarget(actionableNextMilestone)}
                  className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-40"
                >
                  {isWaitingApproval ? (lang === 'he' ? 'ממתין לאישור סגל' : 'Awaiting Faculty Approval') : (lang === 'he' ? 'הגש אבן דרך' : 'Submit Milestone')}
                </button>
              )}
            </div>
          )}

          <div className="rounded-[var(--radius)] border border-line bg-surface p-5">
            <p className="text-sm font-semibold text-ink">{lang === 'he' ? 'תיאור הפרויקט' : 'Project Description'}</p>
            <p className="mt-1.5 text-sm text-muted">{lang === 'he' ? project.descriptionHe : project.descriptionEn}</p>
          </div>

          {isMastersThesis && (
            <div className="rounded-[var(--radius)] border border-line bg-surface p-5">
              <p className="text-sm font-semibold text-ink">📄 {lang === 'he' ? 'תבנית לתזה' : 'Thesis Template'}</p>
              <p className="mt-1.5 text-sm text-muted">
                {lang === 'he' ? 'תבנית ה-Word הרשמית לכתיבת עבודת התזה שלך.' : 'The official Word template for writing your thesis.'}
              </p>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                disabled={downloadingTemplate}
                className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
              >
                {downloadingTemplate ? '…' : `⬇ ${lang === 'he' ? 'הורדת התבנית' : 'Download Template'}`}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'milestones' && (
        <div className="grid gap-3">
          <p className="text-sm font-semibold text-ink">{lang === 'he' ? 'אבני הדרך שלך' : 'Your Milestones'}</p>
          {milestones.map((m, index) => {
            const unlocked = isUnlocked(m);
            const cfg = STATUS_CONFIG[m.status] ?? { color: '#6B7280', bg: '#F1F0EC', icon: '🕐' };
            const days = daysUntil(m.dueDate);
            const label = MILESTONE_LABEL[m.type]?.[lang] ?? m.type;
            const isDefense = m.type === 'defense';
            const isSubmittedInReview = (['submitted', 'supervisor_graded', 'graded'] as string[]).includes(m.status);
            const isApprovedOrDone = (['coordinator_approved', 'completed'] as string[]).includes(m.status);
            const isRejected = m.status === 'rejected';

            return (
              <div key={m.id} className="flex gap-3 rounded-[var(--radius)] border border-line bg-surface p-4">
                <div className="flex flex-col items-center">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: isApprovedOrDone ? 'var(--success)' : cfg.color }}
                  >
                    {isApprovedOrDone ? '✓' : index + 1}
                  </span>
                  {index < milestones.length - 1 && <span className="mt-1 w-px flex-1 bg-line" />}
                </div>

                <div className="flex-1 pb-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{label}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: isApprovedOrDone ? 'var(--success-bg)' : cfg.bg, color: isApprovedOrDone ? 'var(--success)' : cfg.color }}
                    >
                      {isApprovedOrDone ? '✅' : cfg.icon} {STATUS_LABEL[m.status]?.[lang] ?? m.status}
                    </span>
                  </div>

                  {!unlocked ? (
                    <p className="mt-1 text-xs text-muted">🔒 {lang === 'he' ? 'יש להשלים אבני דרך קודמות' : 'Need to complete previous milestones'}</p>
                  ) : isApprovedOrDone ? (
                    <p className="mt-1 text-xs font-medium text-success">
                      ✅ {lang === 'he' ? 'אושר ע"י הרכז' : 'Approved by coordinator'}
                      {m.finalGrade !== null && ` · ${t('grade')}: ${m.finalGrade}`}
                    </p>
                  ) : isSubmittedInReview ? (
                    <p className="mt-1 text-xs font-medium text-accent">📤 {lang === 'he' ? 'הוגש — ממתין לאישור' : 'Submitted — awaiting approval'}</p>
                  ) : isRejected ? (
                    <p className="mt-1 text-xs font-medium text-danger">
                      ↩ {lang === 'he' ? 'הוחזר לתיקון — יש להגיש גרסה מתוקנת' : 'Returned for revision — please resubmit a corrected version'}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted">
                      📅 {t('dueDate')} {toDate(m.dueDate)?.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {days !== null && m.status === 'pending' && unlocked && (
                        <span className={days < 0 ? 'text-danger' : days <= 7 ? 'text-accent' : 'text-success'}>
                          {' '}
                          ({days < 0 ? `${Math.abs(days)} ${lang === 'he' ? 'ימי איחור' : 'days overdue'}` : `${days} ${lang === 'he' ? 'ימים' : 'days left'}`})
                        </span>
                      )}
                    </p>
                  )}

                  {isDefense && m.defenseDate && (
                    <div className="mt-2 grid gap-0.5 text-xs text-muted">
                      <span>
                        📅 {t('defenseDate')} {toDate(m.defenseDate)?.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                      {m.defenseRoom && (
                        <span>
                          🏫 {t('defenseRoom')} {m.defenseRoom}
                        </span>
                      )}
                      {m.examinerNames?.length > 0 && (
                        <span>
                          👥 {t('examiners')} {m.examinerNames.join(', ')}
                        </span>
                      )}
                    </div>
                  )}
                  {isDefense && !m.defenseDate && <p className="mt-1 text-xs text-muted">{t('defenseNotScheduled')}</p>}

                  {isRejected && m.rejectionReason && (
                    <div className="mt-2 rounded-lg bg-danger-bg p-2.5">
                      <p className="text-xs font-semibold text-danger">{lang === 'he' ? 'סיבת ההחזרה:' : 'Reason for return:'}</p>
                      <p className="mt-0.5 text-xs text-danger">{m.rejectionReason}</p>
                    </div>
                  )}

                  {isApprovedOrDone && m.coordinatorComment && (
                    <div className="mt-2 rounded-lg bg-paper p-2.5">
                      <p className="text-xs font-semibold text-ink">{lang === 'he' ? 'הערת הרכז:' : "Coordinator's comment:"}</p>
                      <p className="mt-0.5 text-xs text-muted">{m.coordinatorComment}</p>
                    </div>
                  )}

                  {(m.status === 'pending' || isRejected) && !isDefense && unlocked && !m.defenseDate && (
                    <button
                      type="button"
                      onClick={() => setSubmitTarget(m)}
                      className={`mt-2 rounded-full px-3 py-1.5 text-xs font-semibold hover:opacity-90 ${
                        isRejected ? 'bg-danger text-white' : 'bg-primary text-primary-ink'
                      }`}
                    >
                      {isRejected
                        ? (lang === 'he' ? 'הגש גרסה מתוקנת' : 'Submit Corrected Version')
                        : (lang === 'he' ? 'הגש אבן דרך' : 'Submit Milestone')}
                    </button>
                  )}

                  {m.fileUrls?.length > 0 && (
                    <p className="mt-1.5 text-xs text-muted">
                      📎 {m.fileUrls.length} {lang === 'he' ? 'קבצים הוגשו' : 'files submitted'}
                    </p>
                  )}

                  {m.revisionHistory && m.revisionHistory.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium text-muted hover:text-ink">
                        {lang === 'he' ? `🕘 היסטוריית הגשות (${m.revisionHistory.length})` : `🕘 Submission History (${m.revisionHistory.length})`}
                      </summary>
                      <div className="mt-1.5 grid gap-1.5">
                        {m.revisionHistory.map((rev) => (
                          <div key={rev.version} className="rounded-md border border-line bg-paper p-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-ink">
                                {lang === 'he' ? `גרסה ${rev.version}` : `Version ${rev.version}`}
                              </span>
                              {rev.decision === 'rejected' && (
                                <span className="rounded-full bg-danger-bg px-2 py-0.5 text-[10px] font-medium text-danger">
                                  {lang === 'he' ? '❌ נדחתה' : '❌ Rejected'}
                                </span>
                              )}
                            </div>
                            {rev.decisionReason && <p className="mt-1 text-xs text-danger">{rev.decisionReason}</p>}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'grades' && (
        <div className="grid gap-3">
          <p className="text-sm font-semibold text-ink">{lang === 'he' ? 'ציונים ומשקלים' : 'Grades & Weights'}</p>
          {milestones.map((m) => {
            const label = MILESTONE_LABEL[m.type]?.[lang] ?? m.type;
            const grade = m.finalGrade ?? m.supervisorScore ?? null;
            const hasGrade = typeof grade === 'number' && !isNaN(grade);
            const isSubmittedState = !hasGrade && (['submitted', 'supervisor_graded', 'graded'] as string[]).includes(m.status);
            const isGradeVisible = (['coordinator_approved', 'completed'] as string[]).includes(m.status);
            const gradeVisible = isGradeVisible && hasGrade;
            // Anything worth expanding into — the three-rubric workflow's
            // supervisor evaluation, a staff record, or a still-pending
            // coordinator sign-off (see workflowTemplates.ts's
            // finalGradeComponents/staffRecordMode — absent for any
            // milestone/faculty that hasn't configured them).
            const hasExpandableDetail = !!(m.supervisorEvaluation || m.staffRecord || m.autoCalculatedFinalGrade != null || m.gradeOverride);
            const isExpanded = expandedGradeIds[m.id] ?? false;

            return (
              <div key={m.id} className="rounded-[var(--radius)] border border-line bg-surface p-4">
                <div
                  className={`flex items-center justify-between ${hasExpandableDetail ? 'cursor-pointer' : ''}`}
                  onClick={hasExpandableDetail ? () => setExpandedGradeIds((prev) => ({ ...prev, [m.id]: !prev[m.id] })) : undefined}
                >
                  <span className="text-sm font-semibold text-ink">
                    {hasExpandableDetail && (isExpanded ? '▾ ' : '▸ ')}{label}
                  </span>
                  {gradeVisible ? (
                    <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ color: gradeColor(grade as number), backgroundColor: '#F1F0EC' }}>
                      {grade}
                    </span>
                  ) : isSubmittedState ? (
                    <span className="text-xs font-medium text-accent">📤 {lang === 'he' ? 'הוגש' : 'Submitted'}</span>
                  ) : (
                    <span className="text-xs text-muted">📭 {lang === 'he' ? 'טרם הוגש' : 'Not submitted yet'}</span>
                  )}
                </div>

                {hasGrade ? (
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper">
                    <div className="h-full rounded-full" style={{ width: `${grade}%`, backgroundColor: gradeColor(grade as number) }} />
                  </div>
                ) : isSubmittedState ? (
                  <p className="mt-2 text-xs text-accent">⏳ {lang === 'he' ? 'ממתין לאישור ציון ע"י הרכז' : 'Awaiting grade approval by coordinator'}</p>
                ) : null}

                {isExpanded && hasExpandableDetail && (
                  <div className="mt-3 grid gap-2 border-t border-line pt-3">
                    {m.supervisorEvaluation && (
                      <div className="rounded-md bg-paper p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-ink">{lang === 'he' ? 'הערכת המנחה' : "Supervisor's evaluation"}</span>
                          <span className="text-xs font-bold text-ink">{m.supervisorEvaluation.total}</span>
                        </div>
                        {m.finalGradeComponents?.supervisorEvaluation.components.map((c) => {
                          const s = m.supervisorEvaluation!.scores[c.key];
                          if (!s) return null;
                          return (
                            <div key={c.key} className="mt-1 flex items-center justify-between text-[11px] text-muted">
                              <span>{lang === 'he' ? c.labelHe : c.labelEn}</span>
                              <span>{s.score}/{s.maxScore}</span>
                            </div>
                          );
                        })}
                        {m.supervisorEvaluation.comment && (
                          <p className="mt-1.5 text-[11px] text-ink">💬 {m.supervisorEvaluation.comment}</p>
                        )}
                      </div>
                    )}

                    {m.autoCalculatedFinalGrade != null && (
                      <div className="rounded-md bg-paper p-2.5 text-xs text-ink">
                        <div className="flex items-center justify-between">
                          <span>{lang === 'he' ? 'ציון מחושב' : 'Computed grade'}</span>
                          <span className="font-bold">{m.autoCalculatedFinalGrade}</span>
                        </div>
                        {m.gradeOverride?.status === 'pending' && (
                          <p className="mt-1 text-[11px] text-accent">⏳ {lang === 'he' ? 'ממתין לאישור סופי' : 'Awaiting final sign-off'}</p>
                        )}
                      </div>
                    )}

                    {m.staffRecord && (
                      <div className="rounded-md bg-paper p-2.5 text-xs text-ink">
                        <p className="font-semibold">{lang === 'he' ? 'רשומת מנחה' : "Supervisor's record"}</p>
                        {m.staffRecord.mode === 'upload' ? (
                          <div className="mt-1 flex flex-wrap gap-2">
                            {(m.staffRecord.fileUrls ?? []).map((url, i) => (
                              <a key={url} href={url} target="_blank" rel="noreferrer" className="text-[11px] text-accent underline">
                                📎 {lang === 'he' ? `קובץ ${i + 1}` : `File ${i + 1}`}
                              </a>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-1 grid gap-1">
                            {(m.staffFormFields ?? []).map((f) => {
                              const v = m.staffRecord!.formData?.[f.key];
                              if (v === undefined || v === null || v === '') return null;
                              return (
                                <div key={f.key} className="flex items-start justify-between gap-2 text-[11px]">
                                  <span className="text-muted">{lang === 'he' ? f.labelHe : f.labelEn}</span>
                                  <span className="text-ink text-right">{String(v)}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {project.overallFinalGrade != null && (
            <div className="rounded-[var(--radius)] border border-line bg-surface p-5 text-center">
              <p className="text-sm text-muted">{t('finalGrade')}</p>
              <p className="text-3xl font-bold text-ink">{project.overallFinalGrade}</p>
              <p className="mt-1 text-xs text-muted">
                {lang === 'he' ? '* הציון מחושב לפי האחוזים שנקבעו לכל אבן דרך בתבנית התהליך המאושרת' : "* Grade calculated using each milestone's percentage in the approved workflow template"}
              </p>
            </div>
          )}
        </div>
      )}

      {submitTarget && (
        <SubmitMilestoneModal
          key={submitTarget.id}
          milestone={submitTarget}
          projectId={project.id}
          onClose={() => setSubmitTarget(null)}
          onSubmitted={onChanged}
        />
      )}
    </div>
  );
}

function DefenseDetails({ milestone: m }: { milestone: Milestone }) {
  const { lang, t } = useLanguage();
  const notSetYet = lang === 'he' ? 'טרם נקבע' : 'Not set yet';
  const defenseDate = toDate(m.defenseDate);
  const formattedDate = defenseDate
    ? defenseDate.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })
    : notSetYet;

  const rows = [
    { label: lang === 'he' ? 'בוחן 1' : 'Examiner 1', value: m.examinerNames?.[0] ?? (lang === 'he' ? 'טרם שובץ' : 'Not assigned yet') },
    { label: lang === 'he' ? 'בוחן 2' : 'Examiner 2', value: m.examinerNames?.[1] ?? (lang === 'he' ? 'טרם שובץ' : 'Not assigned yet') },
    { label: lang === 'he' ? 'תאריך' : 'Date', value: formattedDate },
    { label: t('time'), value: m.defenseTime ?? notSetYet },
    { label: lang === 'he' ? 'בניין' : 'Building', value: m.defenseBuilding ?? notSetYet },
    { label: lang === 'he' ? 'חדר' : 'Room', value: m.defenseRoom ?? notSetYet },
  ];

  return (
    <div className="role-rail mt-3 grid gap-1.5 rounded-lg bg-[#EFEBF6] p-3.5" style={{ '--rail-color': '#6E5A99' } as React.CSSProperties}>
      <p className="mb-1 text-xs font-semibold text-[#5B3E99]">🎓 {lang === 'he' ? 'פרטי ההגנה' : 'Defense Details'}</p>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between border-b border-[#DCD3EE] py-1 last:border-0">
          <span className="text-xs font-medium text-[#6E5A99]">{row.label}</span>
          <span className="text-xs font-medium text-ink">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
