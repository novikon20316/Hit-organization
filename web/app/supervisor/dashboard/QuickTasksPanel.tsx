'use client';

// app/supervisor/dashboard/QuickTasksPanel.tsx
// "What needs my attention" summary — Academic Precision's quick tasks
// panel, built from data already on the page (no new API calls). Surfaces
// submissions awaiting grading first (they're blocking a student right
// now), then the soonest project deadlines, then the oldest pending
// applications — capped at 3 items total. Every item is a jump straight to
// where the supervisor can act on it — never a bare tab switch, which looked
// like a dead click whenever the tab was already open, filtered, or (below
// the lg breakpoint, where this panel sits under the tab content) off-screen:
//  - grade-pending and deadline rows expand that project's card, scroll to
//    the milestone and open the same form its own button would (grade modal,
//    research-proposal sign-off, evaluation, opinion form…) — see
//    OpenMilestoneRequest / ProjectWorkflowSection;
//  - a deadline row for a CS thesis exam already in its exam_* steps goes to
//    that exam's card on /thesis-exam, where that work happens;
//  - an application row opens the Applications tab with the filter cleared
//    and scrolls to/highlights that application;
//  - a committee row opens that review on /committees.
// One exception to "no new API calls": committee reviews, fetched here only
// for a supervisor with no higher role who's been substituted onto a
// committee (see lib/roles.ts's isSupervisorWithoutHigherRole).
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import { apiClient, type CommitteePendingReview } from '@/lib/apiClient';
import { isSupervisorWithoutHigherRole } from '@/lib/roles';
import type { MyProject, Application, SupervisorPendingMilestone, OpenMilestoneTarget } from './types';
import { MILESTONE_LABEL, isThesisExamStep } from './types';
import { milestoneDisplayName } from '@/lib/milestoneLabel';
import { underADayLeftLabel } from '@/lib/timeLeft';

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
  /** Expands the project's card on the Projects tab, scrolls to the
   *  milestone and opens whatever its own row's action button would (grade
   *  modal, research-proposal sign-off, defense evaluation, opinion form…).
   *  Used for both grade-pending and deadline rows, so a milestone whose
   *  supervisor action isn't the plain grade modal still lands on the right
   *  form. */
  onOpenMilestone: (target: OpenMilestoneTarget) => void;
  /** Switches to the Applications tab with the status filter cleared, then
   *  scrolls to and highlights this application. */
  onOpenApplication: (application: Application) => void;
  /** Opens the full grading inbox (GradingInboxModal) — every pending
   *  grade, oldest first, with file preview. */
  onOpenInbox: () => void;
}

export function QuickTasksPanel({ myProjects, applications, pendingGrades, onOpenMilestone, onOpenApplication, onOpenInbox }: QuickTasksPanelProps) {
  const { lang } = useLanguage();
  const router = useRouter();
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
      // app/committees/page.tsx opens this milestone's review form.
      href: `/committees?milestoneId=${encodeURIComponent(r.milestoneId)}`,
    })),
    ...gradesAwaitingReview.map((m) => ({
      key: `g-${m.id}`,
      icon: URGENCY_ICON.red,
      color: URGENCY_TEXT.red,
      label: lang === 'he' ? 'ציון ממתין לבדיקה' : 'Grade pending review',
      title: milestoneDisplayName(m, lang, MILESTONE_LABEL),
      sub: lang === 'he' ? m.projectTitleHe : m.projectTitleEn,
      onClick: () => onOpenMilestone({ projectId: m.projectId, milestoneId: m.id, milestoneType: m.type }),
    })),
    ...urgentProjects.map((p) => {
      const cm = p.currentMilestone!;
      const urgency = cm.urgency as 'red' | 'orange';
      const daysLeft = cm.daysLeft;
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
              : (p.currentMilestone!.type !== 'defense' && underADayLeftLabel(p.currentMilestone!.dueDate, lang)) || (lang === 'he'
                ? `${daysLeft} ימים נותרו`
                : `${daysLeft} days left`),
        // A CS thesis exam in its exam_* steps has nothing to act on in the
        // project card — its nominations/dates/exam form live on /thesis-exam.
        onClick: isThesisExamStep(cm) && cm.id
          ? () => router.push(`/thesis-exam?milestoneId=${encodeURIComponent(cm.id!)}`)
          : () => onOpenMilestone({ projectId: p.id, milestoneId: cm.id ?? null, milestoneType: cm.type }),
      };
    }),
    ...pendingApps.map((a) => ({
      key: `a-${a.id}`,
      icon: '📨',
      color: 'var(--supervisor-secondary)',
      label: lang === 'he' ? 'מועמדות ממתינה' : 'New Applicant',
      title: a.studentName || (lang === 'he' ? 'שם לא זמין' : 'Name unavailable'),
      sub: lang === 'he' ? a.projectTitleHe : a.projectTitleEn,
      onClick: () => onOpenApplication(a),
    })),
  ].slice(0, 3);

  return (
    <div className="rounded-supervisor-lg border border-supervisor-outline-variant bg-supervisor-surface-container-lowest p-4">
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-supervisor-outline-variant pb-2">
        <h4 className="text-sm font-semibold text-supervisor-on-surface">
          {lang === 'he' ? 'משימות מהירות' : 'Quick Tasks'}
        </h4>
        {pendingGrades.length > 0 && (
          <button type="button" onClick={onOpenInbox} className="text-xs font-medium text-supervisor-primary hover:underline">
            {lang === 'he' ? `כל הממתינות לציון (${pendingGrades.length})` : `All awaiting grade (${pendingGrades.length})`}
          </button>
        )}
      </div>
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
