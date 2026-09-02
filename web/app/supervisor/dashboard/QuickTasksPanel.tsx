'use client';

// app/supervisor/dashboard/QuickTasksPanel.tsx
// "What needs my attention" summary — Academic Precision's quick tasks
// panel, built from data already on the page (no new API calls). Surfaces
// submissions awaiting grading first (they're blocking a student right
// now), then the soonest project deadlines, then the oldest pending
// applications — capped at 3 items total. Every item is a jump straight to
// where the supervisor can act on it: a grade-pending row opens the grading
// form directly (same modal ProjectWorkflowSection's own "Grade" button
// opens), the other two rows switch to the tab that shows them, since
// there's no single project/application card to deep-link to on the page.
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import type { MyProject, Application, SupervisorPendingMilestone } from './types';
import { MILESTONE_LABEL } from './types';

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
}

export function QuickTasksPanel({ myProjects, applications, pendingGrades, onGrade }: QuickTasksPanelProps) {
  const { lang } = useLanguage();

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
    ...gradesAwaitingReview.map((m) => ({
      key: `g-${m.id}`,
      icon: URGENCY_ICON.red,
      color: URGENCY_TEXT.red,
      label: lang === 'he' ? 'ציון ממתין לבדיקה' : 'Grade pending review',
      title: MILESTONE_LABEL[m.type] ? (lang === 'he' ? MILESTONE_LABEL[m.type].he : MILESTONE_LABEL[m.type].en) : m.type,
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
        href: '/supervisor/dashboard?tab=projects',
      };
    }),
    ...pendingApps.map((a) => ({
      key: `a-${a.id}`,
      icon: '📨',
      color: '#505f76',
      label: lang === 'he' ? 'מועמדות ממתינה' : 'New Applicant',
      title: a.studentName || (lang === 'he' ? 'שם לא זמין' : 'Name unavailable'),
      sub: lang === 'he' ? a.projectTitleHe : a.projectTitleEn,
      href: '/supervisor/dashboard?tab=applications',
    })),
  ].slice(0, 3);

  return (
    <div className="rounded-[8px] border border-[#c5c5d3] bg-white p-4">
      <h4 className="mb-3 border-b border-[#c5c5d3] pb-2 text-sm font-semibold text-[#1a1b21]">
        {lang === 'he' ? 'משימות מהירות' : 'Quick Tasks'}
      </h4>
      {items.length === 0 ? (
        <p className="text-xs text-[#444651]">{lang === 'he' ? 'אין משימות דחופות כרגע' : 'Nothing urgent right now'}</p>
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
                  <p className="truncate text-sm font-medium leading-tight text-[#1a1b21]">{item.title}</p>
                  {item.sub && <p className="truncate text-xs leading-tight text-[#444651]">{item.sub}</p>}
                </div>
              </div>
            );
            const wrapperClassName = `-m-1 rounded-md p-1 text-start transition-colors hover:bg-[#f4f3fa] ${
              i > 0 ? 'border-t border-dashed border-[#c5c5d3] pt-3' : ''
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
