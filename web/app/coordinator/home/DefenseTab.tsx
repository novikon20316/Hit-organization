'use client';

// app/coordinator/home/DefenseTab.tsx
// Ported from mobile/app/coordinator/home.tsx's 'defense' tab — merges six
// derived buckets (setup / stuckPending / awaitingDate / conflict / dateSet /
// scheduledUpcoming / expiredUngraded) into one sortable list, computed
// entirely client-side from data already fetched for the Pending tab
// (dashboard.projects, embedded milestones) — no dedicated endpoint.

import { useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getFacultyColor } from '@/lib/facultyColors';
import { facultyLabel } from '@/lib/i18n';
import { PendingMilestoneCard } from './PendingMilestoneCard';
import { DefenseLogisticsModal } from './DefenseLogisticsModal';
import { DateConflictModal } from './DateConflictModal';
import type { AssignedMilestone, CoordinatorPendingMilestone, ExaminerUser, Project } from './types';

// The matched defense date lives on the milestone's `dueDate` field (set by
// the date-matching flow), not `defenseDate` — and it can arrive either as
// an ISO string, a client Timestamp instance, or an Admin-SDK-serialized
// `{ _seconds, _nanoseconds }` object depending on the code path, so
// normalize all three shapes here.
export function parseServerDate(value: AssignedMilestone['dueDate']): Date | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
  return null;
}

type DefenseCardKind =
  | 'setup'
  | 'stuckPending'
  | 'awaitingDate'
  | 'conflict'
  | 'dateSet'
  | 'scheduledUpcoming'
  | 'expiredUngraded';

export interface DefenseCard {
  kind: DefenseCardKind;
  key: string;
  titleHe: string;
  titleEn: string;
  daysLeft: number | null;
  needsExaminers: boolean;
  setup?: CoordinatorPendingMilestone;
  project?: Project;
  milestone?: AssignedMilestone;
}

const daysUntil = (date: Date | null): number | null =>
  date ? Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

/** Pure builder — also used by page.tsx just to get a count for the tab badge. */
export function buildDefenseCards(allMilestones: CoordinatorPendingMilestone[], projects: Project[]): DefenseCard[] {
  const now = Date.now();

  const defenseSetups = allMilestones.filter((m) => m.type === 'final_report' && (m.status === 'graded' || m.status === 'coordinator_approved'));

  // 'defense' milestones for workflow chains with no 'final_report' gate
  // (e.g. data_science's own template — see seedDataScienceWorkflowTemplate.ts)
  // start life directly at 'pending' with no examiners yet, and 'pending'
  // isn't a status any other bucket looks for — without this bucket they're
  // permanently invisible on this tab (and on Pending, since the server's
  // pendingMilestones array only includes submitted/supervisor_graded/
  // graded/coordinator_approved). This also still catches the case where
  // examiners were already assigned but the panel never opened (e.g.
  // openDefenseSchedulingIfPanelReady threw) — the render branch below
  // distinguishes the two with different copy.
  const stuckPendingItems = projects.flatMap((p) =>
    (p.milestones ?? [])
      .filter((m) => m.type === 'defense' && m.status === 'pending')
      .map((m) => ({ project: p, milestone: m }))
  );

  const awaitingDateItems = projects.flatMap((p) =>
    (p.milestones ?? []).filter((m) => m.type === 'defense' && m.status === 'awaiting_defense_date').map((m) => ({ project: p, milestone: m }))
  );

  const defenseSchedulingItems = projects.flatMap((p) =>
    (p.milestones ?? [])
      .filter((m) => m.type === 'defense' && (m.status === 'date_conflict' || m.status === 'defense_date_set'))
      .map((m) => ({ project: p, milestone: m }))
  );

  const scheduledUpcomingItems = projects.flatMap((p) =>
    (p.milestones ?? [])
      .filter((m) => {
        if (m.type !== 'defense' || m.status !== 'scheduled') return false;
        const d = parseServerDate(m.dueDate);
        return !!d && d.getTime() >= now;
      })
      .map((m) => ({ project: p, milestone: m }))
  );

  const expiredUngradedItems = projects.flatMap((p) =>
    (p.milestones ?? [])
      .filter((m) => {
        if (m.type !== 'defense' || m.status !== 'scheduled') return false;
        const d = parseServerDate(m.dueDate);
        if (!d || d.getTime() >= now) return false;
        const grading = m.examinerGrading ?? {};
        return (m.defensePanel ?? []).some((member) => !grading[member.ref]?.gradedAt);
      })
      .map((m) => ({ project: p, milestone: m }))
  );

  return [
    ...defenseSetups.map(
      (m): DefenseCard => ({
        kind: 'setup',
        key: m.id,
        titleHe: m.projectTitleHe,
        titleEn: m.projectTitleEn,
        daysLeft: null,
        needsExaminers: true,
        setup: m,
      })
    ),
    ...stuckPendingItems.map(
      ({ project, milestone }): DefenseCard => ({
        kind: 'stuckPending',
        key: milestone.id,
        titleHe: project.titleHe,
        titleEn: project.titleEn,
        daysLeft: null,
        needsExaminers: true,
        project,
        milestone,
      })
    ),
    ...awaitingDateItems.map(
      ({ project, milestone }): DefenseCard => ({
        kind: 'awaitingDate',
        key: milestone.id,
        titleHe: project.titleHe,
        titleEn: project.titleEn,
        daysLeft: null,
        needsExaminers: false,
        project,
        milestone,
      })
    ),
    ...defenseSchedulingItems.map(
      ({ project, milestone }): DefenseCard => ({
        kind: milestone.status === 'date_conflict' ? 'conflict' : 'dateSet',
        key: milestone.id,
        titleHe: project.titleHe,
        titleEn: project.titleEn,
        daysLeft: milestone.status === 'defense_date_set' ? daysUntil(parseServerDate(milestone.dueDate)) : null,
        needsExaminers: false,
        project,
        milestone,
      })
    ),
    ...scheduledUpcomingItems.map(
      ({ project, milestone }): DefenseCard => ({
        kind: 'scheduledUpcoming',
        key: milestone.id,
        titleHe: project.titleHe,
        titleEn: project.titleEn,
        daysLeft: daysUntil(parseServerDate(milestone.dueDate)),
        needsExaminers: false,
        project,
        milestone,
      })
    ),
    ...expiredUngradedItems.map(
      ({ project, milestone }): DefenseCard => ({
        kind: 'expiredUngraded',
        key: milestone.id,
        titleHe: project.titleHe,
        titleEn: project.titleEn,
        daysLeft: daysUntil(parseServerDate(milestone.dueDate)),
        needsExaminers: false,
        project,
        milestone,
      })
    ),
  ];
}

function getDefenseAccent(card: DefenseCard): string {
  if (card.kind === 'conflict' || card.kind === 'expiredUngraded') return '#EF4444';
  if (card.kind === 'setup' || card.kind === 'awaitingDate' || card.kind === 'stuckPending') return '#F59E0B';
  if (card.daysLeft === null) return '#F59E0B';
  if (card.daysLeft <= 3) return '#EF4444';
  if (card.daysLeft <= 7) return '#F59E0B';
  return '#10B981';
}

interface DefenseTabProps {
  cards: DefenseCard[];
  examiners: ExaminerUser[];
  onChanged: () => void;
  onApproveFinalReport: (milestone: CoordinatorPendingMilestone) => void;
  onOpenAssignExaminers: (milestone: CoordinatorPendingMilestone) => void;
}

export function DefenseTab({ cards, examiners, onChanged, onApproveFinalReport, onOpenAssignExaminers }: DefenseTabProps) {
  const { lang } = useLanguage();
  const [sort, setSort] = useState<'daysLeft' | 'needsExaminers' | 'name'>('daysLeft');
  const [logisticsTarget, setLogisticsTarget] = useState<{ project: Project; milestone: AssignedMilestone } | null>(null);
  const [conflictTarget, setConflictTarget] = useState<AssignedMilestone | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  // Only these three kinds carry a real, confirmed defense date — the rest
  // (setup/stuckPending/awaitingDate/conflict) have no date yet, so a
  // calendar can't place them; they stay in the list below.
  const datedCards = useMemo(
    () => cards.filter((c) => (c.kind === 'dateSet' || c.kind === 'scheduledUpcoming' || c.kind === 'expiredUngraded') && c.milestone),
    [cards]
  );

  const sortedCards = useMemo(() => {
    const copy = [...cards];
    copy.sort((a, b) => {
      if (sort === 'name') {
        const an = (lang === 'he' ? a.titleHe : a.titleEn) || '';
        const bn = (lang === 'he' ? b.titleHe : b.titleEn) || '';
        return an.localeCompare(bn);
      }
      if (sort === 'needsExaminers' && a.needsExaminers !== b.needsExaminers) return a.needsExaminers ? -1 : 1;
      if (a.daysLeft === null && b.daysLeft === null) return 0;
      if (a.daysLeft === null) return 1;
      if (b.daysLeft === null) return -1;
      return a.daysLeft - b.daysLeft;
    });
    return copy;
  }, [cards, sort, lang]);

  // Re-opens the same assign-examiners flow that actually opens the defense
  // panel on the milestone (see AssignExaminersModal) — its examiner-picker
  // starts blank; this only supplies the milestone/project identifiers it
  // needs to submit against.
  const handleReopenScheduling = (project: Project, milestone: AssignedMilestone) => {
    onOpenAssignExaminers({
      id: milestone.id,
      projectId: project.id,
      projectTitleHe: project.titleHe,
      projectTitleEn: project.titleEn,
      type: 'defense',
      status: milestone.status,
      studentNames: milestone.studentNames,
      studentIds: project.enrolledStudentIds ?? [],
      supervisorId: project.supervisorId ?? '',
      supervisorScore: null,
      facultyId: project.facultyId,
      examinerIds: project.examinerIds ?? [],
    });
  };

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sunday
  const monthLabel = calendarMonth.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { month: 'long', year: 'numeric' });
  const weekdayLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, 7 + i); // a known Sun..Sat week
    return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { weekday: 'short' });
  });

  const cardsByDay = useMemo(() => {
    const map = new Map<number, DefenseCard[]>();
    for (const c of datedCards) {
      const d = parseServerDate(c.milestone!.dueDate);
      if (!d || d.getFullYear() !== year || d.getMonth() !== month) continue;
      const day = d.getDate();
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(c);
    }
    return map;
  }, [datedCards, year, month]);

  const totalCells = firstWeekday + daysInMonth;
  const cellCount = Math.ceil(totalCells / 7) * 7;

  return (
    <div>
      {/* Defense date calendar — visualizes every confirmed/scheduled defense date this month */}
      <div className="mb-5 overflow-hidden rounded-coordinator-lg border border-coordinator-outline-variant bg-coordinator-surface-container-lowest">
        <div className="flex items-center justify-between border-b border-coordinator-outline-variant bg-coordinator-surface-container-low px-4 py-2.5">
          <h3 className="text-sm font-bold text-coordinator-on-surface">{monthLabel}</h3>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setCalendarMonth(new Date(year, month - 1, 1))}
              className="rounded-coordinator border border-coordinator-outline-variant px-2 py-1 text-xs text-coordinator-secondary hover:bg-coordinator-surface-container-lowest"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setCalendarMonth(new Date())}
              className="rounded-coordinator border border-coordinator-outline-variant px-2 py-1 text-xs text-coordinator-secondary hover:bg-coordinator-surface-container-lowest"
            >
              {lang === 'he' ? 'היום' : 'Today'}
            </button>
            <button
              type="button"
              onClick={() => setCalendarMonth(new Date(year, month + 1, 1))}
              className="rounded-coordinator border border-coordinator-outline-variant px-2 py-1 text-xs text-coordinator-secondary hover:bg-coordinator-surface-container-lowest"
            >
              ›
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-coordinator-outline-variant bg-coordinator-surface-container-low">
          {weekdayLabels.map((wd) => (
            <div
              key={wd}
              className="border-e border-coordinator-outline-variant py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-coordinator-secondary last:border-e-0"
            >
              {wd}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-coordinator-outline-variant">
          {Array.from({ length: cellCount }, (_, i) => {
            const dayNum = i - firstWeekday + 1;
            const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
            const dayCards = inMonth ? (cardsByDay.get(dayNum) ?? []) : [];
            return (
              <div
                key={i}
                className={`min-h-[86px] p-1.5 ${inMonth ? 'bg-coordinator-surface-container-lowest' : 'bg-coordinator-surface-container-low text-coordinator-outline-variant'}`}
              >
                {inMonth && <span className="text-xs text-coordinator-on-surface-variant">{dayNum}</span>}
                <div className="mt-1 grid gap-1">
                  {dayCards.map((c) => {
                    const accent = getDefenseAccent(c);
                    const title = lang === 'he' ? c.titleHe : c.titleEn;
                    const clickable = c.kind === 'dateSet' && c.project && c.milestone;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        disabled={!clickable}
                        onClick={() => clickable && setLogisticsTarget({ project: c.project!, milestone: c.milestone! })}
                        title={title}
                        className="truncate rounded-coordinator-sm px-1 py-0.5 text-start text-[10px] leading-tight text-white disabled:cursor-default"
                        style={{ backgroundColor: accent }}
                      >
                        {c.milestone?.defenseTime ? `${c.milestone.defenseTime} ` : ''}
                        {title}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {(
          [
            { key: 'daysLeft' as const, he: 'ימים להגנה', en: 'Days left' },
            { key: 'needsExaminers' as const, he: 'טרם הוקצו בוחנים', en: 'Needs examiners' },
            { key: 'name' as const, he: 'שם פרויקט', en: 'Name' },
          ]
        ).map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setSort(opt.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              sort === opt.key ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink'
            }`}
          >
            {lang === 'he' ? opt.he : opt.en}
          </button>
        ))}
      </div>

      {sortedCards.length === 0 ? (
        <p className="text-sm text-muted">🎓 {lang === 'he' ? 'אין הגנות לתיאום' : 'No defenses to schedule'}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sortedCards.map((card) => {
            if (card.kind === 'setup' && card.setup) {
              return <PendingMilestoneCard key={card.key} milestone={card.setup} onChanged={onChanged} onApproveFinalReport={onApproveFinalReport} />;
            }

            const accent = getDefenseAccent(card);
            const project = card.project!;
            const milestone = card.milestone!;
            const title = lang === 'he' ? project.titleHe : project.titleEn;
            const facultyColor = getFacultyColor(project.facultyId);

            const Header = (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{title}</p>
                <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${facultyColor}1F`, color: facultyColor }}>
                  {facultyLabel(project.facultyId, lang)}
                </span>
              </div>
            );

            if (card.kind === 'stuckPending') {
              const hasExaminersAlready = (project.examinerIds ?? []).length > 0;
              return (
                <div key={card.key} className="rounded-[var(--radius)] border-s-4 border border-line bg-surface p-4" style={{ borderInlineStartColor: accent }}>
                  {Header}
                  <p className="mt-1 text-xs text-muted">👤 {milestone.studentNames.join(', ')}</p>
                  <p className="mt-1 text-xs font-semibold" style={{ color: accent }}>
                    ⚠️ {hasExaminersAlready
                      ? (lang === 'he' ? 'בוחנים משובצים בפרויקט אך לא נפתח מסלול ההגנה' : 'Examiners assigned but the defense pipeline never opened')
                      : (lang === 'he' ? 'טרם שובצו בוחנים להגנה' : 'No examiners assigned yet for this defense')}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleReopenScheduling(project, milestone)}
                    className="mt-3 w-full rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                  >
                    {hasExaminersAlready
                      ? `🔄 ${lang === 'he' ? 'פתח מסלול הגנה' : 'Re-open defense scheduling'}`
                      : `👥 ${lang === 'he' ? 'שבץ בוחנים' : 'Assign examiners'}`}
                  </button>
                </div>
              );
            }

            if (card.kind === 'awaitingDate') {
              return (
                <div key={card.key} className="rounded-[var(--radius)] border-s-4 border border-line bg-surface p-4" style={{ borderInlineStartColor: accent }}>
                  {Header}
                  <p className="mt-1 text-xs text-muted">👤 {milestone.studentNames.join(', ')}</p>
                  <p className="mt-1 text-xs text-muted">
                    🔬 {lang === 'he' ? 'בוחנים:' : 'Examiners:'} {(milestone.defensePanel ?? []).map((e) => e.displayName).join(', ') || '—'}
                  </p>
                  <p className="mt-1 text-xs font-semibold" style={{ color: accent }}>
                    ⏳ {lang === 'he' ? 'ממתין לתאריכים מהבוחנים' : 'Waiting on dates from examiners'}
                  </p>
                </div>
              );
            }

            if (card.kind === 'conflict') {
              return (
                <div key={card.key} className="rounded-[var(--radius)] border-s-4 border border-line bg-surface p-4" style={{ borderInlineStartColor: accent }}>
                  {Header}
                  <p className="mt-1 text-xs font-semibold text-danger">
                    ⚠️ {lang === 'he' ? 'לא נמצא תאריך משותף בין הבוחנים' : 'No common date found between examiners'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setConflictTarget(milestone)}
                    className="mt-3 w-full rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                  >
                    🛠️ {lang === 'he' ? 'פתור התנגשות' : 'Resolve conflict'}
                  </button>
                </div>
              );
            }

            if (card.kind === 'dateSet') {
              return (
                <div key={card.key} className="rounded-[var(--radius)] border-s-4 border border-line bg-surface p-4" style={{ borderInlineStartColor: accent }}>
                  {Header}
                  <p className="mt-1 text-xs font-semibold text-success">
                    📅 {lang === 'he' ? 'מועד הגנה אושר — יש לקבוע שעה, חדר ובניין' : 'Defense date confirmed — set time, room & building'}
                    {card.daysLeft !== null ? ` (${card.daysLeft}${lang === 'he' ? ' ימים' : 'd'})` : ''}
                  </p>
                  <button
                    type="button"
                    onClick={() => setLogisticsTarget({ project, milestone })}
                    className="mt-3 w-full rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                  >
                    📍 {lang === 'he' ? 'קבע פרטים' : 'Set logistics'}
                  </button>
                </div>
              );
            }

            if (card.kind === 'scheduledUpcoming') {
              const d = parseServerDate(milestone.dueDate);
              return (
                <div key={card.key} className="rounded-[var(--radius)] border-s-4 border border-line bg-surface p-4" style={{ borderInlineStartColor: accent }}>
                  {Header}
                  <p className="mt-1 text-xs text-muted">👤 {milestone.studentNames.join(', ')}</p>
                  <p className="mt-1 text-xs text-muted">
                    🔬 {lang === 'he' ? 'בוחנים:' : 'Examiners:'} {(milestone.defensePanel ?? []).map((e) => e.displayName).join(', ') || '—'}
                  </p>
                  {d && (
                    <p className="mt-1.5 rounded-full bg-paper px-2.5 py-1 text-xs text-ink">
                      📅 {d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB')}
                      {milestone.defenseTime ? ` ${milestone.defenseTime}` : ''}
                      {milestone.defenseRoom ? ` | ${milestone.defenseRoom}` : ''}
                    </p>
                  )}
                  <p className="mt-1.5 text-xs font-semibold" style={{ color: accent }}>
                    ⏳ {card.daysLeft} {lang === 'he' ? 'ימים להגנה' : card.daysLeft === 1 ? 'day left' : 'days left'}
                  </p>
                </div>
              );
            }

            // expiredUngraded
            const d = parseServerDate(milestone.dueDate);
            const grading = milestone.examinerGrading ?? {};
            const pendingExaminers = (milestone.defensePanel ?? []).filter((e) => !grading[e.ref]?.gradedAt);
            return (
              <div key={card.key} className="rounded-[var(--radius)] border-s-4 border border-line bg-surface p-4" style={{ borderInlineStartColor: accent }}>
                {Header}
                <p className="mt-1 text-xs text-muted">👤 {milestone.studentNames.join(', ')}</p>
                {d && (
                  <p className="mt-1 text-xs font-semibold text-danger">
                    📅 {lang === 'he' ? 'תאריך הגנה שחלף:' : 'Defense date passed:'} {d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB')}
                  </p>
                )}
                <p className="mt-1 text-xs font-semibold text-danger">
                  ⚠️ {lang === 'he' ? 'ממתין לציון מ:' : 'Awaiting grade from:'}{' '}
                  {pendingExaminers.map((e) => e.displayName).join(', ') || (lang === 'he' ? 'בוחן/ים' : 'examiner(s)')}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {logisticsTarget && (
        <DefenseLogisticsModal
          project={logisticsTarget.project}
          milestone={logisticsTarget.milestone}
          onClose={() => setLogisticsTarget(null)}
          onSaved={() => {
            setLogisticsTarget(null);
            onChanged();
          }}
        />
      )}

      {conflictTarget && (
        <DateConflictModal
          milestone={conflictTarget}
          examiners={examiners}
          onClose={() => setConflictTarget(null)}
          onResolved={() => {
            setConflictTarget(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
