'use client';

// components/MilestoneTimeline.tsx
// Shared timeline component — ported from mobile/app/(tabs)/Milestonetimeline.tsx,
// which is itself a shared (non-route) component used by student/supervisor/
// coordinator/examiner/admin screens, gated by role-specific action props
// rather than by role checks baked into the component itself.
//
// Unlike mobile, milestone names here are derived from `type` via
// MILESTONE_LABEL (see app/student/home/types.ts) instead of reading
// nameHe/nameEn fields directly off the milestone doc — those fields aren't
// reliably populated on legacy milestones. Same reasoning applies to the
// approval-chain detail: mobile's MilestoneData carries approvalChainHe/En
// arrays, but nothing on the server ever actually writes those fields (see
// server/src/controllers/milestoneController.ts and
// server/src/services/studentProgress.ts — neither sets them), so reading
// them here would just be `undefined.map()` waiting to crash. Instead the
// chain steps below are derived generically from the milestone's status,
// the same way ActiveDashboard.tsx already reasons about status thresholds.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, ApiError, SoftError } from '@/lib/apiClient';
import { RevisionDecisionPanel } from '@/components/RevisionDecisionPanel';
import {
  MILESTONE_LABEL,
  STATUS_LABEL,
  STATUS_CONFIG,
  toDate,
  daysUntil,
  type MilestoneType,
  type MilestoneStatus,
} from '@/app/student/home/types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MilestoneData {
  id: string;
  type: MilestoneType;
  /** Snapshotted from the workflow template's own milestone list at
   *  enrollment (see server/src/services/projectEnrollment.ts). Absent on a
   *  milestone created before this field existed. */
  order?: number;
  status: MilestoneStatus;
  dueDate: string | null;
  submittedAt: string | null;
  fileUrls?: string[];
  finalGrade: number | null;
  supervisorScore?: number | null;
  defenseDate: string | null;
  defenseRoom: string | null;
  defenseBuilding?: string | null;
  defenseTime?: string | null;
  onlineDefenseLink?: string | null;
  examinerNames?: string[];
  examinerIds?: string[];
}

/** Loosely typed on purpose — callers pass whatever role string their own
 *  AppRole/UserDoc carries; unmatched roles simply see no action buttons. */
export type ViewerRole = string;

interface MilestoneTimelineProps {
  milestones: MilestoneData[];
  viewerRole: ViewerRole;
  projectId: string;
  onStudentSubmit?: (milestone: MilestoneData) => void;
  onSupervisorGrade?: (milestone: MilestoneData) => void;
  onCoordinatorApprove?: (milestone: MilestoneData) => void;
  onExaminerGrade?: (milestone: MilestoneData) => void;
  onScheduleDefense?: (milestone: MilestoneData) => void;
  /** Fired after the due date has already been saved server-side (this
   *  component owns the PUT /api/milestones/:id call itself) — use this to
   *  refetch/refresh the parent's own milestone list. */
  onAdjustDate?: (milestone: MilestoneData, newDate: Date) => void;
}

const COORDINATOR_ADJUST_ROLES = ['coordinator', 'faculty_admin', 'administrative_secretary', 'system_admin'];
const COORDINATOR_APPROVE_ROLES = ['coordinator', 'faculty_admin', 'administrative_secretary', 'system_admin'];
const EXAMINER_ROLES = ['examiner', 'internal_examiner'];

function isCompletedStatus(status: MilestoneStatus): boolean {
  return status === 'coordinator_approved' || status === 'completed';
}

// ─── Approval-chain detail (expanded card content) ─────────────────────────

function buildApprovalChain(m: MilestoneData, lang: 'he' | 'en'): { label: string; done: boolean }[] {
  const isDefense = m.type === 'defense';
  const submittedOrLater = m.status !== 'pending';
  const supervisorGraded = (['supervisor_graded', 'graded', 'coordinator_approved', 'examiners_assigned', 'examiner_graded', 'both_examiners_graded', 'awaiting_defense_date', 'date_conflict', 'defense_date_set', 'scheduled', 'completed'] as MilestoneStatus[]).includes(m.status);
  const coordinatorApproved = isCompletedStatus(m.status) || (['examiners_assigned', 'examiner_graded', 'both_examiners_graded', 'awaiting_defense_date', 'date_conflict', 'defense_date_set', 'scheduled'] as MilestoneStatus[]).includes(m.status);

  if (!isDefense) {
    return [
      { label: lang === 'he' ? 'הגשה' : 'Submission', done: submittedOrLater },
      { label: lang === 'he' ? 'בדיקת מנחה' : 'Supervisor review', done: supervisorGraded },
      { label: lang === 'he' ? 'אישור רכז' : 'Coordinator approval', done: coordinatorApproved },
    ];
  }

  const examinersAssigned = !!(m.examinerIds && m.examinerIds.length > 0);
  const defenseDateSet = !!m.defenseDate;
  const graded = (['examiner_graded', 'both_examiners_graded', 'completed'] as MilestoneStatus[]).includes(m.status);

  return [
    { label: lang === 'he' ? 'אושר להגנה' : 'Approved for defense', done: coordinatorApproved },
    { label: lang === 'he' ? 'שיבוץ בוחנים' : 'Examiners assigned', done: examinersAssigned },
    { label: lang === 'he' ? 'קביעת מועד הגנה' : 'Defense date set', done: defenseDateSet },
    { label: lang === 'he' ? 'ציונים הוגשו' : 'Grades submitted', done: graded },
  ];
}

function formatDate(val: string | null, lang: 'he' | 'en', opts: Intl.DateTimeFormatOptions): string {
  const d = toDate(val);
  return d ? d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', opts) : '—';
}

// ─── Single milestone card ──────────────────────────────────────────────────

function MilestoneCard({
  milestone,
  index,
  viewerRole,
  onStudentSubmit,
  onSupervisorGrade,
  onCoordinatorApprove,
  onExaminerGrade,
  onScheduleDefense,
  onAdjustDate,
}: {
  milestone: MilestoneData;
  index: number;
} & Omit<MilestoneTimelineProps, 'milestones' | 'projectId'>) {
  const { lang, t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [newDateText, setNewDateText] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [savingDate, setSavingDate] = useState(false);
  const [adjustError, setAdjustError] = useState('');
  const [pendingApprovalNotice, setPendingApprovalNotice] = useState(false);

  const isCompleted = isCompletedStatus(milestone.status);
  const cfg = STATUS_CONFIG[milestone.status] ?? STATUS_CONFIG.pending;
  const days = daysUntil(milestone.dueDate);
  const isDefense = milestone.type === 'defense';
  const label = MILESTONE_LABEL[milestone.type]?.[lang] ?? milestone.type;
  const statusLabel = STATUS_LABEL[milestone.status]?.[lang] ?? milestone.status;

  const canAdjustDate = COORDINATOR_ADJUST_ROLES.includes(viewerRole);
  const canApprove = COORDINATOR_APPROVE_ROLES.includes(viewerRole) && (milestone.status === 'supervisor_graded' || milestone.status === 'graded');
  const canScheduleDefense = COORDINATOR_APPROVE_ROLES.includes(viewerRole) && isDefense && milestone.status === 'coordinator_approved' && !milestone.defenseDate;
  const canExaminerGrade = EXAMINER_ROLES.includes(viewerRole) && isDefense && milestone.status === 'coordinator_approved';
  const canStudentSubmit = viewerRole === 'student' && milestone.status === 'pending' && !isDefense;
  const canSupervisorGrade = viewerRole === 'supervisor' && milestone.status === 'submitted';

  const handleSaveDate = async () => {
    if (!newDateText.trim()) return;
    const parsed = new Date(newDateText);
    if (isNaN(parsed.getTime())) {
      setAdjustError(lang === 'he' ? 'תאריך לא תקין' : 'Invalid date');
      return;
    }
    if (!reasonText.trim()) {
      setAdjustError(lang === 'he' ? 'יש לציין סיבה' : 'A reason is required');
      return;
    }
    setSavingDate(true);
    setAdjustError('');
    try {
      const result = await apiClient.updateMilestoneDueDate(milestone.id, {
        dueDate: parsed.toISOString(),
        reason: reasonText.trim(),
      });
      if (result.pendingApproval) {
        // coordinator/administrative coordinator — this now needs program_head/
        // faculty_admin sign-off before it actually takes effect (P1 #12).
        setShowAdjust(false);
        setNewDateText('');
        setReasonText('');
        setAdjustError('');
        setPendingApprovalNotice(true);
        return;
      }
      onAdjustDate?.(milestone, parsed);
      setShowAdjust(false);
      setNewDateText('');
      setReasonText('');
    } catch (err) {
      const message = err instanceof ApiError || err instanceof SoftError ? err.message : lang === 'he' ? 'עדכון התאריך נכשל' : 'Failed to update the date';
      setAdjustError(message);
    } finally {
      setSavingDate(false);
    }
  };

  return (
    <div className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': cfg.color } as React.CSSProperties}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: isCompleted ? 'var(--success)' : cfg.color }}
            >
              {isCompleted ? '✓' : index + 1}
            </span>
            <span className="truncate text-sm font-semibold text-ink">{label}</span>
          </div>
          <span className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
            {cfg.icon} {statusLabel}
          </span>
        </div>

        {!isCompleted && days !== null && (
          <span className={`shrink-0 text-xs font-medium ${days < 0 ? 'text-danger' : days <= 7 ? 'text-accent' : 'text-muted'}`}>
            {days < 0 ? `${Math.abs(days)} ${lang === 'he' ? 'ימי איחור' : 'days overdue'}` : `${days} ${lang === 'he' ? 'ימים' : 'days left'}`}
          </span>
        )}
      </div>

      {/* Due / submitted / defense info */}
      <div className="mt-2.5 grid gap-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          📅 {t('dueDate')} {formatDate(milestone.dueDate, lang, { day: 'numeric', month: 'short', year: 'numeric' })}
          {canAdjustDate && (
            <button
              type="button"
              onClick={() => {
                setShowAdjust((v) => !v);
                setAdjustError('');
              }}
              className="text-xs font-medium text-primary hover:underline"
            >
              ✏️ {lang === 'he' ? 'שנה תאריך' : 'Adjust'}
            </button>
          )}
        </span>
        {milestone.submittedAt && (
          <span>
            📤 {lang === 'he' ? 'הוגש:' : 'Submitted:'} {formatDate(milestone.submittedAt, lang, { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        )}
        {isDefense && milestone.defenseDate && (
          <span>
            🎓 {lang === 'he' ? 'מועד הגנה:' : 'Defense:'} {formatDate(milestone.defenseDate, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {milestone.defenseTime ? ` · 🕐 ${milestone.defenseTime}` : ''}
            {milestone.defenseBuilding ? ` · 🏢 ${milestone.defenseBuilding}` : ''}
            {milestone.defenseRoom ? ` · 🏛️ ${milestone.defenseRoom}` : ''}
            {milestone.onlineDefenseLink ? (
              <>
                {' · 💻 '}
                <a href={milestone.onlineDefenseLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {lang === 'he' ? 'הצטרפות מקוונת' : 'Join online'}
                </a>
              </>
            ) : ''}
          </span>
        )}
        {milestone.finalGrade !== null && (
          <span>
            🏆 {lang === 'he' ? 'ציון סופי:' : 'Final grade:'} <strong className="text-ink">{milestone.finalGrade}</strong>
          </span>
        )}
      </div>

      {pendingApprovalNotice && (
        <p className="mt-2 rounded-md border border-accent bg-[#FBF3E3] px-2.5 py-1.5 text-xs text-accent">
          ⏳ {lang === 'he'
            ? 'הבקשה נשלחה לאישור ראש התוכנית/הפקולטה ותיושם רק לאחר אישור.'
            : 'This request was sent for program-head/faculty-admin approval and will only take effect once approved.'}
        </p>
      )}

      {/* Adjust-date inline form */}
      {showAdjust && (
        <div className="mt-3 rounded-lg border border-line bg-paper p-3">
          <label className="block text-xs font-medium text-ink">{lang === 'he' ? 'תאריך יעד חדש' : 'New due date'}</label>
          <input
            type="date"
            value={newDateText}
            onChange={(e) => setNewDateText(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
          />
          <label className="mt-2 block text-xs font-medium text-ink">{t('reason')}</label>
          <input
            type="text"
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder={lang === 'he' ? 'סיבת השינוי...' : 'Reason for the change...'}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
          />
          {adjustError && <p className="mt-1.5 text-xs text-danger">{adjustError}</p>}
          <div className="mt-2.5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAdjust(false)}
              disabled={savingDate}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={handleSaveDate}
              disabled={savingDate || !newDateText.trim()}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
            >
              {savingDate ? '…' : t('save')}
            </button>
          </div>
        </div>
      )}

      {/* Expand toggle */}
      <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2.5 text-xs font-medium text-muted hover:text-ink">
        {expanded ? '▲' : '▼'} {lang === 'he' ? 'תהליך האישור' : 'Approval chain'}
      </button>

      {expanded && (
        <div className="mt-2 grid gap-1 border-t border-line pt-2.5">
          {buildApprovalChain(milestone, lang).map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${step.done ? 'bg-success' : 'bg-line'}`} />
              <span className={`text-xs ${step.done ? 'font-medium text-ink' : 'text-muted'}`}>{step.label}</span>
            </div>
          ))}

          {/* ── Role-appropriate action button ── */}
          {canStudentSubmit && (
            <button
              type="button"
              onClick={() => onStudentSubmit?.(milestone)}
              className="mt-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-ink hover:bg-primary-hover"
            >
              📤 {lang === 'he' ? 'הגש עכשיו' : 'Submit Now'}
            </button>
          )}
          {canSupervisorGrade && (
            <button
              type="button"
              onClick={() => onSupervisorGrade?.(milestone)}
              className="mt-2 rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
            >
              ✏️ {lang === 'he' ? 'תן ציון' : 'Grade Submission'}
            </button>
          )}
          {canApprove && (
            <button
              type="button"
              onClick={() => onCoordinatorApprove?.(milestone)}
              className="mt-2 rounded-lg px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
              style={{ backgroundColor: '#6E5A99' }}
            >
              ✅ {lang === 'he' ? 'אשר ציון' : 'Approve Grade'}
            </button>
          )}
          {canScheduleDefense && (
            <button
              type="button"
              onClick={() => onScheduleDefense?.(milestone)}
              className="mt-2 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
            >
              📅 {lang === 'he' ? 'תאם מועד הגנה' : 'Schedule Defense'}
            </button>
          )}
          {canExaminerGrade && (
            <button
              type="button"
              onClick={() => onExaminerGrade?.(milestone)}
              className="mt-2 rounded-lg px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
              style={{ backgroundColor: '#6E5A99' }}
            >
              ✏️ {lang === 'he' ? 'מלא טופס ציון הגנה' : 'Fill Defense Grade Form'}
            </button>
          )}

          {(viewerRole === 'supervisor' || COORDINATOR_APPROVE_ROLES.includes(viewerRole)) && (
            <RevisionDecisionPanel milestoneId={milestone.id} canDecide />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main exported component ────────────────────────────────────────────────

export function MilestoneTimeline({
  milestones,
  viewerRole,
  onStudentSubmit,
  onSupervisorGrade,
  onCoordinatorApprove,
  onExaminerGrade,
  onScheduleDefense,
  onAdjustDate,
}: MilestoneTimelineProps) {
  const { lang } = useLanguage();

  if (milestones.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border border-line bg-surface p-6 text-center">
        <p className="text-2xl">📋</p>
        <p className="mt-2 text-sm text-muted">
          {lang === 'he' ? 'אבני הדרך ייווצרו אוטומטית עם אישור הסטודנט לפרויקט.' : 'Milestones will be created automatically when the student is approved.'}
        </p>
      </div>
    );
  }

  const completed = milestones.filter((m) => isCompletedStatus(m.status)).length;
  const progress = Math.round((completed / milestones.length) * 100);

  return (
    <div className="grid gap-3">
      <div className="rounded-[var(--radius)] border border-line bg-surface p-4">
        <div className="flex items-center justify-between text-xs text-muted">
          <span className="font-semibold text-ink">{lang === 'he' ? 'התקדמות הפרויקט' : 'Project Progress'}</span>
          <span>{progress}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-muted">
          {completed} / {milestones.length} {lang === 'he' ? 'אבני דרך הושלמו' : 'milestones completed'}
        </p>
      </div>

      {milestones.map((m, i) => (
        <MilestoneCard
          key={m.id}
          milestone={m}
          index={i}
          viewerRole={viewerRole}
          onStudentSubmit={onStudentSubmit}
          onSupervisorGrade={onSupervisorGrade}
          onCoordinatorApprove={onCoordinatorApprove}
          onExaminerGrade={onExaminerGrade}
          onScheduleDefense={onScheduleDefense}
          onAdjustDate={onAdjustDate}
        />
      ))}
    </div>
  );
}
