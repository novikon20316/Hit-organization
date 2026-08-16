'use client';

// components/ProjectStageChain.tsx
// Additive per-student "stages of the project" view — groups a student's
// real milestones (whatever the faculty's workflow template actually
// configured: research_proposal/progress_report/final_report/defense/poster,
// or a custom template's own types) into four visual buckets modeled after
// the requested design: Supervisor & Topic Approval (synthetic — there's no
// separate milestone doc for this, it's implied by the project/enrollment
// existing at all), Pre-Project Approval, Milestones, and Final Submission.
// No new schema — every field here already exists (see
// server/src/controllers/projectController.ts's getActiveProjects and
// supervisorController.ts's getSupervisorProjectDetail, both of which now
// return percentOfFinalGrade/dueDate/submittedAt per milestone and the
// project's own createdAt). Rendered BELOW whatever per-student view a page
// already has — see ProjectWorkflowSection.tsx and coordinator/home/
// InProgressTab.tsx, its two call sites.

import { useLanguage } from '@/contexts/LanguageContext';

export interface StageChainMilestone {
  type: string;
  status: string;
  nameHe?: string;
  nameEn?: string;
  percentOfFinalGrade?: number;
  grade?: number | null;
  dueDate?: string | null;
  submittedAt?: string | null;
}

interface ProjectStageChainProps {
  createdAt?: string | null;
  milestones: StageChainMilestone[];
}

// Falls back to this when a milestone has no nameHe/nameEn of its own (the
// coordinator's InProgress feed only ever returns bare {type, status,
// score} — see getActiveProjects — so it has no live template names to
// join against, unlike the supervisor's own project detail endpoint).
const FALLBACK_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר', en: 'Research Proposal' },
  progress_report: { he: 'דו"ח התקדמות', en: 'Progress Report' },
  final_report: { he: 'דו"ח מסכם', en: 'Final Report' },
  defense: { he: 'הגנה', en: 'Defense' },
  poster: { he: 'פוסטר', en: 'Poster Session' },
};

// Milestone TYPE isn't grouped by any stored "category"/"section" field
// (none exists) — bucketed here by what the type itself represents. Anything
// not recognized (a custom template's own type) falls into the middle
// "Milestones" bucket, the safest default for an unknown mid-project step.
const PRE_PROJECT_TYPES = new Set(['research_proposal', 'track_selection', 'specification']);
const FINAL_TYPES = new Set(['final_report', 'defense', 'closure', 'judgment', 'submit_for_judgment', 'oral_exam']);

function bucketFor(type: string): 'preProject' | 'milestones' | 'final' {
  if (PRE_PROJECT_TYPES.has(type)) return 'preProject';
  if (FINAL_TYPES.has(type)) return 'final';
  return 'milestones';
}

function statusInfo(status: string, lang: 'he' | 'en') {
  if (status === 'coordinator_approved' || status === 'completed') {
    return { icon: '✓', color: 'var(--success)', bg: 'var(--success-bg)', label: lang === 'he' ? 'אושר' : 'Approved' };
  }
  if (status === 'submitted' || status === 'supervisor_graded' || status === 'graded') {
    return { icon: '⏳', color: 'var(--accent)', bg: '#FBF3E3', label: lang === 'he' ? 'הועבר לאישור' : 'Forwarded for approval' };
  }
  if (status === 'rejected') {
    return { icon: '↩', color: 'var(--danger)', bg: 'var(--danger-bg)', label: lang === 'he' ? 'הוחזר לתיקון' : 'Returned for revision' };
  }
  // 'pending' (due but not yet submitted) and 'not_created' (template row
  // with no doc yet) both read the same to a viewer: nothing to see yet.
  return { icon: '⏳', color: 'var(--muted)', bg: '#F1F0EC', label: lang === 'he' ? 'עתידי' : 'Upcoming' };
}

function formatDate(iso: string | null | undefined, lang: 'he' | 'en'): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ProjectStageChain({ createdAt, milestones }: ProjectStageChainProps) {
  const { lang } = useLanguage();

  const groups: { key: string; titleHe: string; titleEn: string; rows: (StageChainMilestone & { syntheticDate?: string | null })[] }[] = [
    {
      key: 'topicApproval',
      titleHe: 'אישור מנחה ונושא',
      titleEn: 'Supervisor & Topic Approval',
      rows: createdAt
        ? [{ type: '__topic_approval__', status: 'coordinator_approved', syntheticDate: createdAt }]
        : [],
    },
    { key: 'preProject', titleHe: 'קדם אישור פרויקט', titleEn: 'Pre-Project Approval', rows: milestones.filter((m) => bucketFor(m.type) === 'preProject') },
    { key: 'milestones', titleHe: 'אבני דרך', titleEn: 'Milestones', rows: milestones.filter((m) => bucketFor(m.type) === 'milestones') },
    { key: 'final', titleHe: 'הגשת פרויקט', titleEn: 'Final Submission', rows: milestones.filter((m) => bucketFor(m.type) === 'final') },
  ].filter((g) => g.rows.length > 0);

  if (groups.length === 0) return null;

  return (
    <div className="mt-3 grid gap-3">
      <p className="text-xs font-semibold text-muted">{lang === 'he' ? 'שלבי הפרויקט' : 'Project Stages'}</p>
      {groups.map((g) => {
        const allApproved = g.rows.every((r) => r.status === 'coordinator_approved' || r.status === 'completed');
        return (
          <div key={g.key} className="rounded-lg border border-line bg-paper p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-ink">{lang === 'he' ? g.titleHe : g.titleEn}</span>
              {allApproved ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: 'var(--success)' }}>
                  ✓
                </span>
              ) : (
                <span className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: 'var(--accent)' }}>
                  {g.rows.length}
                </span>
              )}
            </div>
            <div className="grid gap-1.5">
              {g.rows.map((m, idx) => {
                const label = m.type === '__topic_approval__'
                  ? (lang === 'he' ? 'אישור מנחה ונושא' : 'Supervisor & Topic Approval')
                  : m.nameHe && m.nameEn
                    ? (lang === 'he' ? m.nameHe : m.nameEn)
                    : (FALLBACK_LABEL[m.type]?.[lang] ?? m.type);
                const info = statusInfo(m.status, lang);
                const isDone = m.status === 'coordinator_approved' || m.status === 'completed';
                const date = m.syntheticDate ? formatDate(m.syntheticDate, lang) : formatDate(isDone ? m.submittedAt : m.dueDate, lang);
                return (
                  <div key={`${m.type}-${idx}`} className="flex items-center justify-between gap-2 rounded-md bg-surface p-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{label}</p>
                      {date && (
                        <p className="mt-0.5 text-[11px] text-muted">
                          {isDone ? (lang === 'he' ? 'תאריך ביצוע: ' : 'Completed: ') : (lang === 'he' ? 'תאריך יעד: ' : 'Due: ')}
                          {date}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {typeof m.percentOfFinalGrade === 'number' && m.percentOfFinalGrade > 0 && (
                        <span className="rounded-full bg-[#EDE9FE] px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          {lang === 'he' ? `משקל ${m.percentOfFinalGrade}` : `${m.percentOfFinalGrade}% weight`}
                        </span>
                      )}
                      {typeof m.grade === 'number' && (
                        <span className="rounded-full bg-[#EDE9FE] px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          {lang === 'he' ? `ציון ${m.grade}` : `Grade ${m.grade}`}
                        </span>
                      )}
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: info.bg, color: info.color }}>
                        {info.icon} {info.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
