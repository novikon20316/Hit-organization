'use client';

// app/supervisor/dashboard/QuickTasksPanel.tsx
// "What needs my attention" summary — Academic Precision's quick tasks
// panel, built from data already on the page (no new API calls). Surfaces
// submissions awaiting grading first (they're blocking a student right
// now), then the soonest project deadlines, then the oldest pending
// applications — capped at 3 items total. Every item is a jump straight to
// where the supervisor can act on it: a grade-pending row opens the grading
// form directly (same modal ProjectWorkflowSection's own "Grade" button
// opens), a deadline row expands that project's card and opens its current
// milestone's form (see OpenMilestoneRequest), and an application row
// switches to the Applications tab.
// One exception to "no new API calls": committee reviews, fetched here only
// for a supervisor with no higher role who's been substituted onto a
// committee (see lib/roles.ts's isSupervisorWithoutHigherRole).
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import { apiClient, type CommitteePendingReview } from '@/lib/apiClient';
import { isSupervisorWithoutHigherRole } from '@/lib/roles';
import type { MyProject, Application, SupervisorPendingMilestone } from './types';
import { MILESTONE_LABEL } from './types';
import { milestoneDisplayName } from '@/lib/milestoneLabel';

const URGENCY_ICON: Record<'red' | 'orange', string> = { red: '🔴', orange: '🟠' };
const URGENCY_TEXT: Record<'red' | 'orange', string> = { red: '#a8433a', orange: '#b8862e' };

function toMs(v: string | { seconds: number } | null): number {
  if (!v) return 0;
  return typeof v === 'object' ? v.seconds * 1000 : new Date(v).getTime();
}

interface QuickTasksPanelProps {
  myProjects: MyProject[];
  applications: Application[];
  /** Milestones a student already submitted and this supervisor hasn't
   *  graded yet — the most actionable item there is (it's blocking the
   *  student), so these are listed first, ahead of upcoming-deadline
   *  projects and pending applications. */
  pendingGrades: SupervisorPendingMilestone[];
  /** Opens GradeMilestoneModal for a given pending milestone — same handler
   *  the Projects tab's own "Grade" button uses (page.tsx's setGradingTarget) —
   *  so a "Grade pending review" row jumps straight into the grading form
   *  instead of just pointing at the Projects tab and leaving the supervisor
   *  to find the right row themselves. */
  onGrade: (milestone: SupervisorPendingMilestone) => void;
  /** Expands the project's card on the Projects tab and opens the form for
   *  its current milestone (e.g. the defense evaluation form) — a bare link
   *  to the tab left every card collapsed, so nothing actually opened. */
  onOpenMilestone: (project: MyProject) => void;
}

export function QuickTasksPanel({ myProjects, applications, pendingGrades, onGrade, onOpenMilestone }: QuickTasksPanelProps) {
  const { lang } = useLanguage();
  const { userData } = useAuth();
  const { isCommitteeSubstitute } = useNotifications();
  const showCommittee = isCommitteeSubstitute && isSupervisorWithoutHigherRole(userData);
  const [committeeReviews, setCommitteeReviews] = useState<CommitteePendingReview[]>([]);

  const fetchCommitteeReviews = useCallback(() => {
    if (!showCommittee) return;
    apiClient.getMyPendingCommitteeReviews().then((r) => setCommitteeReviews(r.reviews)).catch(() => setCommitteeReviews([]));
  }, [showCommittee]);
  useEffect(fetchCommitteeReviews, [fetchCommitteeReviews]);
  useLiveRefresh(fetchCommitteeReviews);

  // Oldest submission first — the longer it's sat waiting, the more urgent.
  const gradesAwaitingReview = pendingGrades
    .slice()
    .sort((a, b) => toMs(a.submittedAt) - toMs(b.submittedAt));

  const urgentProjects = myProjects
    .filter((p) => p.currentMilestone?.urgency === 'red' || p.currentMilestone?.urgency === 'orange')
    .sort((a, b) => (a.currentMilestone!.daysLeft ?? 0) - (b.currentMilestone!.daysLeft ?? 0));

  const pendingApps = applications
    .filter((a) => a.status === 'applied')
    .sort((a, b) => toMs(a.submittedAt) - toMs(b.submittedAt));

  const items = [
    // A committee review someone else is waiting on (the chairman can't
    // decide until every member voted) — listed first.
    ...(showCommittee ? committeeReviews : []).map((r) => ({
      key: `c-${r.milestoneId}`,
      icon: '🧑‍⚖️',
      color: URGENCY_TEXT.red,
      label: lang === 'he' ? 'בדיקת ועדה ממתינה' : 'Committee review pending',
      title: lang === 'he' ? r.projectTitleHe : r.projectTitleEn,
      sub: lang === 'he' ? `${r.voteCount}/${r.memberCount} הצביעו` : `${r.voteCount}/${r.memberCount} voted`,
      href: '/committees',
    })),
    ...gradesAwaitingReview.map((m) => ({
      key: `g-${m.id}`,
      icon: URGENCY_ICON.red,
      color: URGENCY_TEXT.red,
      label: lang === 'he' ? 'ציון ממתין לבדיקה' : 'Grade pending review',
      title: milestoneDisplayName(m, lang, MILESTONE_LABEL),
      sub: lang === 'he' ? m.projectTitleHe : m.projectTitleEn,
      onClick: () => onGrade(m),
    })),
    ...urgentProjects.map((p) => {
      const urgency = p.currentMilestone!.urgency as 'red' | 'orange';
      const daysLeft = p.currentMilestone!.daysLeft;
      return {
        key: `p-${p.id}`,
        icon: URGENCY_ICON[urgency],
        color: URGENCY_TEXT[urgency],
        label: lang === 'he' ? p.currentMilestone!.nameHe : p.currentMilestone!.nameEn,
        title: lang === 'he' ? p.titleHe : p.titleEn,
        sub:
          daysLeft === null
            ? ''
            : daysLeft < 0
              ? lang === 'he'
                ? `באיחור של ${Math.abs(daysLeft)} ימים`
                : `${Math.abs(daysLeft)} days overdue`
              : lang === 'he'
                ? `${daysLeft} ימים נותרו`
                : `${daysLeft} days left`,
        onClick: () => onOpenMilestone(p),
      };
    }),
    ...pendingApps.map((a) => ({
      key: `a-${a.id}`,
      icon: '📨',
      color: 'var(--supervisor-secondary)',
      label: lang === 'he' ? 'מועמדות ממתינה' : 'New Applicant',
      title: a.studentName || (lang === 'he' ? 'שם לא זמין' : 'Name unavailable'),
      sub: lang === 'he' ? a.projectTitleHe : a.projectTitleEn,
      href: '/supervisor/dashboard?tab=applications',
    })),
  ].slice(0, 3);

  return (
    <div className="rounded-supervisor-lg border border-supervisor-outline-variant bg-supervisor-surface-container-lowest p-4">
      <h4 className="mb-3 border-b border-supervisor-outline-variant pb-2 text-sm font-semibold text-supervisor-on-surface">
        {lang === 'he' ? 'משימות מהירות' : 'Quick Tasks'}
      </h4>
      {items.length === 0 ? (
        <p className="text-xs text-supervisor-on-surface-variant">{lang === 'he' ? 'אין משימות דחופות כרגע' : 'Nothing urgent right now'}</p>
      ) : (
        <div className="grid gap-3">
          {items.map((item, i) => {
            const content = (
              <div className="flex items-start gap-2">
                <span className="mt-0.5">{item.icon}</span>
                <div className="min-w-0">
                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: item.color }}>
                    {item.label}
                  </p>
                  <p className="truncate text-sm font-medium leading-tight text-supervisor-on-surface">{item.title}</p>
                  {item.sub && <p className="truncate text-xs leading-tight text-supervisor-on-surface-variant">{item.sub}</p>}
                </div>
              </div>
            );
            const wrapperClassName = `-m-1 rounded-md p-1 text-start transition-colors hover:bg-supervisor-surface-container-low ${
              i > 0 ? 'border-t border-dashed border-supervisor-outline-variant pt-3' : ''
            }`;
            return (
              <div key={item.key}>
                {'onClick' in item ? (
                  <button type="button" onClick={item.onClick} className={`w-full ${wrapperClassName}`}>
                    {content}
                  </button>
                ) : (
                  <Link href={item.href} className={`block ${wrapperClassName}`}>
                    {content}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
