'use client';

// app/student/home/ActiveDashboard.tsx
// Ported from mobile/app/(tabs)/Activedashboard.tsx.

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { SubmitMilestoneModal } from './SubmitMilestoneModal';
import { AnnouncementsBanner } from './AnnouncementsBanner';
import {
  MILESTONE_LABEL,
  resolveMilestoneOrder,
  STATUS_CONFIG,
  STATUS_LABEL,
  toDate,
  daysUntil,
  gradeColor,
  type ActiveProject,
  type Milestone,
} from './types';

// File URLs carry no separate filename field — derive a human-readable one
// from the URL itself, same approach as components/MilestoneTimeline.tsx's
// fileNameFromUrl (that helper isn't exported, so duplicated here).
function fileNameFromUrl(url: string, index: number, lang: 'he' | 'en'): string {
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    const last = path.split('/').filter(Boolean).pop();
    if (last) return last;
  } catch {
    // fall through to generic label below
  }
  return lang === 'he' ? `קובץ ${index + 1}` : `File ${index + 1}`;
}

interface ActiveDashboardProps {
  project: ActiveProject;
  milestones: Milestone[];
  progress: number;
  onChanged: () => void;
  /** Driven by the page's `?tab=` — see app/student/home/page.tsx and
   *  app/student/layout.tsx's sidebar entries. */
  tab: 'overview' | 'milestones' | 'grades';
}

// Staff-attached, project-scoped Info Files (see app/info-files/page.tsx and
// server/src/controllers/infoFilesController.ts) — the server already
// filters getInfoFiles() to only what this student may currently see
// (enrolled in the project, visible, and milestone-reached-or-later when
// tagged); this component just groups the result by which milestone (if
// any) each file was tagged for.
interface ProjectInfoFile {
  id: string;
  titleHe: string;
  titleEn: string;
  fileUrl: string;
  projectIds: string[];
  milestoneType: string | null;
}

export function ActiveDashboard({ project, milestones, progress, onChanged, tab }: ActiveDashboardProps) {
  const { lang, t } = useLanguage();
  const [submitTarget, setSubmitTarget] = useState<Milestone | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [expandedGradeIds, setExpandedGradeIds] = useState<Record<string, boolean>>({});
  const [projectFiles, setProjectFiles] = useState<ProjectInfoFile[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiClient.getInfoFiles()
      .then((res) => {
        if (cancelled) return;
        setProjectFiles((res.files ?? []).filter((f) => f.projectIds?.includes(project.id)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const filesForMilestone = (type: string) => projectFiles.filter((f) => f.milestoneType === type);
  const untaggedProjectFiles = projectFiles.filter((f) => !f.milestoneType);

  const InfoFileChip = ({ f }: { f: ProjectInfoFile }) => (
    <a
      href={f.fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 rounded-student border border-student-outline-variant bg-student-surface-container-low px-2.5 py-1.5 text-xs text-student-on-surface transition-colors hover:border-student-primary hover:text-student-primary"
    >
      📎 <span className="max-w-[12rem] truncate">{lang === 'he' ? f.titleHe || f.titleEn : f.titleEn || f.titleHe}</span>
    </a>
  );

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
    const order = resolveMilestoneOrder(m);
    return milestones
      .filter((prev) => resolveMilestoneOrder(prev) < order)
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

  // Real "Recent Feedback" source for the Milestones tab's right-column
  // panel — never fabricated: prefer the most recently reached milestone
  // that has a rejectionReason, falling back to the most recently reached
  // one with a coordinatorComment. Milestones are order-gated (see
  // isUnlocked above), so "most recent" == highest resolveMilestoneOrder.
  const mostRecentWith = (pred: (m: Milestone) => boolean): Milestone | null =>
    milestones.filter(pred).reduce<Milestone | null>(
      (best, m) => (best === null || resolveMilestoneOrder(m) > resolveMilestoneOrder(best) ? m : best),
      null,
    );
  const feedbackMilestone =
    mostRecentWith((m) => m.status === 'rejected' && !!m.rejectionReason) ??
    mostRecentWith((m) => !!m.coordinatorComment);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-student-on-surface md:text-3xl">
          {lang === 'he' ? 'התקדמות הפרויקט הפעיל' : 'Active Project Progress'}
        </h1>
        <p className="mt-1 text-sm text-student-on-surface-variant">
          {lang === 'he'
            ? `מעקב אחר אבני הדרך והמשוב האחרון של המנחה לפרויקט '${project.titleHe}'.`
            : `Track your milestones and recent supervisor feedback for '${project.titleEn}'.`}
        </p>
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4">
          <AnnouncementsBanner />

          <div className="rounded-student-lg border border-student-outline-variant bg-student-surface-container-lowest p-5 shadow-sm">
            <p className="text-base font-semibold text-student-on-surface">📁 {lang === 'he' ? project.titleHe : project.titleEn}</p>
            <p className="mt-1 text-sm text-student-on-surface-variant">
              👨‍🏫 {project.supervisorName} · {project.academicYear}
            </p>
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-student-on-surface-variant">
                <span>{lang === 'he' ? 'התקדמות' : 'Progress'}</span>
                <span>{progress}%</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-student-surface-container">
                <div className="h-full rounded-full bg-student-primary" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-student-on-surface-variant">
                <span dir="ltr">{milestones.filter((m) => m.status === 'coordinator_approved').length} / {milestones.length}</span>{' '}
                {lang === 'he' ? 'אבני דרך הושלמו' : 'milestones completed'}
              </p>
            </div>
          </div>

          {overviewDisplayMilestone && (
            <div
              className="role-rail rounded-student-lg border border-student-outline-variant bg-student-surface-container-lowest p-5 shadow-sm"
              style={{ '--rail-color': 'var(--student-primary)' } as React.CSSProperties}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-student-on-surface">⚡ {lang === 'he' ? 'אבן הדרך הבאה' : 'Next Milestone'}</span>
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

              <p className="mt-2 text-sm text-student-on-surface">
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
                  className="mt-4 w-full rounded-student-lg bg-student-primary py-2.5 text-sm font-semibold text-student-on-primary hover:bg-student-primary-container disabled:opacity-40"
                >
                  {isWaitingApproval ? (lang === 'he' ? 'ממתין לאישור סגל' : 'Awaiting Faculty Approval') : (lang === 'he' ? 'הגש אבן דרך' : 'Submit Milestone')}
                </button>
              )}
            </div>
          )}

          <div className="rounded-student-lg border border-student-outline-variant bg-student-surface-container-lowest p-5 shadow-sm">
            <p className="text-sm font-semibold text-student-on-surface">{lang === 'he' ? 'תיאור הפרויקט' : 'Project Description'}</p>
            <p className="mt-1.5 text-sm text-student-on-surface-variant">{lang === 'he' ? project.descriptionHe : project.descriptionEn}</p>
          </div>
        </div>
      )}

      {tab === 'milestones' && (
        <div className="grid gap-4 xl:grid-cols-12">
          <div className="xl:col-span-8 rounded-student-lg border border-student-outline-variant bg-student-surface-container-lowest p-5 shadow-sm">
            <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-student-on-surface">
              {lang === 'he' ? 'אבני הדרך שלך' : 'Your Milestones'}
            </p>
            <div className="grid">
              {milestones.map((m, index) => {
                const unlocked = isUnlocked(m);
                const cfg = STATUS_CONFIG[m.status] ?? { color: '#6B7280', bg: '#F1F0EC', icon: '🕐' };
                const days = daysUntil(m.dueDate);
                const label = MILESTONE_LABEL[m.type]?.[lang] ?? m.type;
                const isDefense = m.type === 'defense';
                const isSubmittedInReview = (['submitted', 'supervisor_graded', 'graded'] as string[]).includes(m.status);
                const isApprovedOrDone = (['coordinator_approved', 'completed'] as string[]).includes(m.status);
                const isRejected = m.status === 'rejected';
                const isCurrent = unlocked && !isApprovedOrDone;

                return (
                  <div key={m.id} className={`flex gap-3 ${!unlocked ? 'opacity-60' : ''}`}>
                    <div className="flex flex-col items-center">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                          isCurrent
                            ? 'border-student-primary bg-student-primary-fixed ring-4 ring-student-primary/10'
                            : 'border-student-outline-variant bg-student-surface-container-lowest'
                        }`}
                      >
                        {isApprovedOrDone && <span className="text-xs text-student-on-surface-variant">✓</span>}
                        {isCurrent && <span className="h-2 w-2 rounded-full bg-student-primary" />}
                      </span>
                      {index < milestones.length - 1 && <span className="mt-1 w-px flex-1 bg-student-outline-variant" />}
                    </div>

                    <div
                      className={`role-rail flex-1 pb-6 ${isCurrent ? 'rounded-student-lg border border-student-primary/20 bg-student-primary/5 p-3 -mt-1' : 'ps-3'}`}
                      style={!isCurrent ? ({ '--rail-color': isApprovedOrDone ? 'var(--success)' : cfg.color } as React.CSSProperties) : undefined}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-student-on-surface">{label}</span>
                        <span
                          className="shrink-0 whitespace-nowrap rounded-student px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
                          style={{ backgroundColor: isApprovedOrDone ? 'var(--success-bg)' : cfg.bg, color: isApprovedOrDone ? 'var(--success)' : cfg.color }}
                        >
                          {isApprovedOrDone ? '✅' : cfg.icon} {STATUS_LABEL[m.status]?.[lang] ?? m.status}
                        </span>
                      </div>

                      {!unlocked ? (
                        <p className="mt-1 text-xs text-student-on-surface-variant">🔒 {lang === 'he' ? 'יש להשלים אבני דרך קודמות' : 'Need to complete previous milestones'}</p>
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
                        <p className="mt-1 text-xs text-student-on-surface-variant">
                          📅 {t('dueDate')} {toDate(m.dueDate)?.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {days !== null && m.status === 'pending' && unlocked && (
                            <span className={days < 0 ? 'text-danger' : days <= 7 ? 'text-accent' : 'text-success'}>
                              {' '}
                              ({days < 0 ? `${Math.abs(days)} ${lang === 'he' ? 'ימי איחור' : 'days overdue'}` : `${days} ${lang === 'he' ? 'ימים' : 'days left'}`})
                            </span>
                          )}
                        </p>
                      )}

                      {unlocked && (m.submittedAt || (isApprovedOrDone && m.finalGrade !== null)) && (
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-student-outline-variant/60 pt-2">
                          {m.submittedAt && (
                            <span className="text-xs text-student-on-surface-variant">
                              📤 {lang === 'he' ? 'הוגש:' : 'Submitted:'}{' '}
                              {toDate(m.submittedAt)?.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                          {isApprovedOrDone && m.finalGrade !== null && (
                            <span className="text-xs font-bold text-student-on-surface">🏆 {t('grade')}: {m.finalGrade}</span>
                          )}
                        </div>
                      )}

                      {isDefense && m.defenseDate && (
                        <div className="mt-2 grid gap-0.5 text-xs text-student-on-surface-variant">
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
                      {isDefense && !m.defenseDate && <p className="mt-1 text-xs text-student-on-surface-variant">{t('defenseNotScheduled')}</p>}

                      {isRejected && m.rejectionReason && (
                        <div className="mt-2 rounded-student bg-danger-bg p-2.5">
                          <p className="text-xs font-semibold text-danger">{lang === 'he' ? 'סיבת ההחזרה:' : 'Reason for return:'}</p>
                          <p className="mt-0.5 text-xs text-danger">{m.rejectionReason}</p>
                        </div>
                      )}

                      {isApprovedOrDone && m.coordinatorComment && (
                        <div className="mt-2 rounded-student bg-student-surface-container-low p-2.5">
                          <p className="text-xs font-semibold text-student-on-surface">{lang === 'he' ? 'הערת הרכז:' : "Coordinator's comment:"}</p>
                          <p className="mt-0.5 text-xs text-student-on-surface-variant">{m.coordinatorComment}</p>
                        </div>
                      )}

                      {(m.status === 'pending' || isRejected) && !isDefense && unlocked && !m.defenseDate && (
                        <button
                          type="button"
                          onClick={() => setSubmitTarget(m)}
                          className={`mt-2 rounded-student px-3 py-1.5 text-xs font-semibold hover:opacity-90 ${
                            isRejected ? 'bg-danger text-white' : 'bg-student-primary text-student-on-primary'
                          }`}
                        >
                          {isRejected
                            ? (lang === 'he' ? 'הגש גרסה מתוקנת' : 'Submit Corrected Version')
                            : (lang === 'he' ? 'הגש אבן דרך' : 'Submit Milestone')}
                        </button>
                      )}

                      {m.fileUrls?.length > 0 && (
                        <div className="mt-2">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-student-on-surface-variant">
                            {lang === 'he' ? 'קבצים שהוגשו' : 'Submitted Files'}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {m.fileUrls.map((url, i) => (
                              <a
                                key={i}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 rounded-student border border-student-outline-variant bg-student-surface-container-low px-2.5 py-1.5 text-xs text-student-on-surface transition-colors hover:border-student-primary hover:text-student-primary"
                              >
                                📄 <span className="max-w-[12rem] truncate">{fileNameFromUrl(url, i, lang)}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {filesForMilestone(m.type).length > 0 && (
                        <div className="mt-2">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-student-on-surface-variant">
                            {lang === 'he' ? 'מסמכים לאבן דרך זו' : 'Files for this milestone'}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {filesForMilestone(m.type).map((f) => (
                              <InfoFileChip key={f.id} f={f} />
                            ))}
                          </div>
                        </div>
                      )}

                      {m.revisionHistory && m.revisionHistory.length > 0 && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-medium text-student-on-surface-variant hover:text-student-on-surface">
                            {lang === 'he' ? `🕘 היסטוריית הגשות (${m.revisionHistory.length})` : `🕘 Submission History (${m.revisionHistory.length})`}
                          </summary>
                          <div className="mt-1.5 grid gap-1.5">
                            {m.revisionHistory.map((rev) => (
                              <div key={rev.version} className="rounded-student border border-student-outline-variant bg-student-surface-container-low p-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-student-on-surface">
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
          </div>

          <div className="xl:col-span-4 flex flex-col gap-4">
            {untaggedProjectFiles.length > 0 && (
              <div className="rounded-student-lg border border-student-outline-variant bg-student-surface-container-low p-5 shadow-sm">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-student-on-surface">
                  📎 {lang === 'he' ? 'מסמכי הפרויקט' : 'Project Resources'}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {untaggedProjectFiles.map((f) => (
                    <InfoFileChip key={f.id} f={f} />
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-student-lg border border-student-outline-variant bg-student-surface-container-low p-5 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-student-on-surface">
                💬 {lang === 'he' ? 'משוב אחרון' : 'Recent Feedback'}
              </h3>
              {feedbackMilestone ? (
                <div className="rounded-student border border-student-outline-variant bg-student-surface-container-lowest p-3">
                  <p className="text-xs font-semibold text-student-on-surface">
                    {MILESTONE_LABEL[feedbackMilestone.type]?.[lang] ?? feedbackMilestone.type}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-student-on-surface-variant">
                    {feedbackMilestone.rejectionReason
                      ? (lang === 'he' ? 'סיבת ההחזרה:' : 'Reason for return:')
                      : (lang === 'he' ? 'הערת הרכז:' : "Coordinator's comment:")}
                  </p>
                  <p className={`mt-2 text-sm italic ${feedbackMilestone.rejectionReason ? 'text-danger' : 'text-student-on-surface'}`}>
                    “{feedbackMilestone.rejectionReason ?? feedbackMilestone.coordinatorComment}”
                  </p>
                </div>
              ) : (
                <p className="text-sm text-student-on-surface-variant">
                  {lang === 'he' ? 'אין עדיין משוב כתוב על אבני הדרך שלך.' : 'No written feedback on your milestones yet.'}
                </p>
              )}
            </div>

            {isMastersThesis && (
              <div className="rounded-student-lg border border-student-outline-variant bg-student-surface-container-lowest p-5 shadow-sm">
                <h3 className="mb-3 border-b border-student-outline-variant pb-2 text-sm font-semibold text-student-on-surface">
                  📄 {lang === 'he' ? 'תבנית לתזה' : 'Thesis Template'}
                </h3>
                <p className="text-xs text-student-on-surface-variant">
                  {lang === 'he' ? 'תבנית ה-Word הרשמית לכתיבת עבודת התזה שלך.' : 'The official Word template for writing your thesis.'}
                </p>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  disabled={downloadingTemplate}
                  className="mt-3 flex w-full items-center gap-2 rounded-student p-2 text-sm font-medium text-student-primary hover:bg-student-surface-container-low disabled:opacity-60"
                >
                  <span>⬇</span>
                  <span>{downloadingTemplate ? '…' : (lang === 'he' ? 'הורדת התבנית' : 'Download Template')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'grades' && (
        <div className="grid gap-3">
          <p className="text-sm font-semibold text-student-on-surface">{lang === 'he' ? 'ציונים ומשקלים' : 'Grades & Weights'}</p>
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
            const hasExpandableDetail = !!(m.supervisorEvaluation || m.staffRecord || m.autoCalculatedFinalGrade != null || m.gradeOverride || m.committeeReviewHistory?.length);
            const isExpanded = expandedGradeIds[m.id] ?? false;

            return (
              <div key={m.id} className="rounded-student-lg border border-student-outline-variant bg-student-surface-container-lowest p-4 shadow-sm">
                <div
                  className={`flex items-center justify-between ${hasExpandableDetail ? 'cursor-pointer' : ''}`}
                  onClick={hasExpandableDetail ? () => setExpandedGradeIds((prev) => ({ ...prev, [m.id]: !prev[m.id] })) : undefined}
                >
                  <span className="text-sm font-semibold text-student-on-surface">
                    {hasExpandableDetail && (isExpanded ? '▾ ' : '▸ ')}{label}
                  </span>
                  {gradeVisible ? (
                    <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ color: gradeColor(grade as number), backgroundColor: 'var(--student-surface-container)' }}>
                      {grade}
                    </span>
                  ) : isSubmittedState ? (
                    <span className="text-xs font-medium text-accent">📤 {lang === 'he' ? 'הוגש' : 'Submitted'}</span>
                  ) : (
                    <span className="text-xs text-student-on-surface-variant">📭 {lang === 'he' ? 'טרם הוגש' : 'Not submitted yet'}</span>
                  )}
                </div>

                {hasGrade ? (
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-student-surface-container">
                    <div className="h-full rounded-full" style={{ width: `${grade}%`, backgroundColor: gradeColor(grade as number) }} />
                  </div>
                ) : isSubmittedState ? (
                  <p className="mt-2 text-xs text-accent">⏳ {lang === 'he' ? 'ממתין לאישור ציון ע"י הרכז' : 'Awaiting grade approval by coordinator'}</p>
                ) : null}

                {isExpanded && hasExpandableDetail && (
                  <div className="mt-3 grid gap-2 border-t border-student-outline-variant pt-3">
                    {m.supervisorEvaluation && (
                      <div className="rounded-student bg-student-surface-container-low p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-student-on-surface">{lang === 'he' ? 'הערכת המנחה' : "Supervisor's evaluation"}</span>
                          <span className="text-xs font-bold text-student-on-surface">{m.supervisorEvaluation.total}</span>
                        </div>
                        {m.finalGradeComponents?.supervisorEvaluation.components.map((c) => {
                          const s = m.supervisorEvaluation!.scores[c.key];
                          if (!s) return null;
                          return (
                            <div key={c.key} className="mt-1 flex items-center justify-between text-[11px] text-student-on-surface-variant">
                              <span>{lang === 'he' ? c.labelHe : c.labelEn}</span>
                              <span>{s.score}/{s.maxScore}</span>
                            </div>
                          );
                        })}
                        {m.supervisorEvaluation.comment && (
                          <p className="mt-1.5 text-[11px] text-student-on-surface">💬 {m.supervisorEvaluation.comment}</p>
                        )}
                      </div>
                    )}

                    {m.autoCalculatedFinalGrade != null && (
                      <div className="rounded-student bg-student-surface-container-low p-2.5 text-xs text-student-on-surface">
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
                      <div className="rounded-student bg-student-surface-container-low p-2.5 text-xs text-student-on-surface">
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
                                  <span className="text-student-on-surface-variant">{lang === 'he' ? f.labelHe : f.labelEn}</span>
                                  <span className="text-student-on-surface text-right">{String(v)}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {m.committeeReviewHistory && m.committeeReviewHistory.length > 0 && (
                      <div className="rounded-student bg-student-surface-container-low p-2.5 text-xs text-student-on-surface">
                        <p className="font-semibold">{lang === 'he' ? 'ביקורת הוועדה' : 'Committee Review'}</p>
                        <div className="mt-1.5 grid gap-2">
                          {m.committeeReviewHistory.map((round, i) => (
                            <div key={`${round.committeeId}-${round.decidedAt}-${i}`} className="rounded-student border border-student-outline-variant bg-student-surface-container-lowest p-2">
                              <p className="text-[11px] font-semibold text-student-on-surface-variant">
                                {lang === 'he' ? `סבב ${i + 1} — ${round.memberVotes.length} חברי ועדה הביעו דעה` : `Round ${i + 1} — ${round.memberVotes.length} members weighed in`}
                              </p>
                              {round.memberVotes.map((v, vi) => (
                                <div key={vi} className="mt-1 flex items-start justify-between gap-2 text-[11px]">
                                  <span className="text-student-on-surface-variant">{lang === 'he' ? `חבר ועדה ${vi + 1}` : `Member ${vi + 1}`}</span>
                                  <span className={v.vote === 'approve' ? 'font-medium text-success' : 'font-medium text-danger'}>
                                    {v.vote === 'approve' ? (lang === 'he' ? '✓ בעד' : '✓ Approved') : (lang === 'he' ? '✗ נגד' : '✗ Rejected')}
                                    {v.comment ? ` — ${v.comment}` : ''}
                                  </span>
                                </div>
                              ))}
                              <div className="mt-1.5 border-t border-student-outline-variant pt-1.5">
                                <p className="text-[11px]">
                                  <span className="font-semibold">{lang === 'he' ? 'החלטת היו"ר: ' : "Chairman's decision: "}</span>
                                  <span className={round.chairmanDecision === 'approve' ? 'font-medium text-success' : 'font-medium text-danger'}>
                                    {round.chairmanDecision === 'approve' ? (lang === 'he' ? '✓ אושר' : '✓ Approved') : (lang === 'he' ? '✗ נדחה' : '✗ Rejected')}
                                  </span>
                                </p>
                                {round.chairmanComment && <p className="mt-0.5 text-student-on-surface-variant">{round.chairmanComment}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {project.overallFinalGrade != null && (
            <div className="rounded-student-lg border border-student-outline-variant bg-student-surface-container-lowest p-5 text-center shadow-sm">
              <p className="text-sm text-student-on-surface-variant">{t('finalGrade')}</p>
              <p className="text-3xl font-bold text-student-on-surface">{project.overallFinalGrade}</p>
              <p className="mt-1 text-xs text-student-on-surface-variant">
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
    <div className="role-rail mt-3 grid gap-1.5 rounded-student-lg bg-[#EFEBF6] p-3.5" style={{ '--rail-color': '#6E5A99' } as React.CSSProperties}>
      <p className="mb-1 text-xs font-semibold text-[#5B3E99]">🎓 {lang === 'he' ? 'פרטי ההגנה' : 'Defense Details'}</p>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between border-b border-[#DCD3EE] py-1 last:border-0">
          <span className="text-xs font-medium text-[#6E5A99]">{row.label}</span>
          <span className="text-xs font-medium text-student-on-surface">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
