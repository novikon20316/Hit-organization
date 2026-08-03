// components/MilestoneTimeline.tsx
//
// Shared timeline component — works for student, supervisor, coordinator, admin.
// Props control which actions are visible per role.

import React, { useEffect, useState } from 'react';
import { toDate } from '@/components/shared';
import {
  View, Text, Pressable,
  Modal, TextInput, ActivityIndicator, Linking, Alert,
} from 'react-native';
import { Timestamp } from 'firebase/firestore';
import { apiClient } from '../../src/api/apiClient';
import {
  daysUntil, urgencyLevel, URGENCY_COLORS,
  type MilestoneStatus,
} from '../../components/Milestoneservice';
import type { Lang } from '../../components/i18n';
import { MilestoneTimelineStyles, MilestoneCardStyles } from '../../constants/styles';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MilestoneData {
  id:            string;
  type:          string;
  nameHe:        string;
  nameEn:        string;
  descriptionHe: string;
  descriptionEn: string;
  status:        MilestoneStatus;
  dueDate:       Timestamp | string;
  submittedAt:   Timestamp | null;
  approvalChainHe: string[];
  approvalChainEn: string[];
  requiresExaminers: boolean;
  supervisorGradeId: string | null;
  coordinatorApprovedAt: Timestamp | null;
  examinerIds:   string[];
  defenseDate:   Timestamp | null;
  defenseRoom:   string | null;
  defenseBuilding?: string | null;
  defenseTime?:  string | null;
  onlineDefenseLink?: string | null;
  finalGrade:    number | null;
  fileUrls:      string[];
}

export type ViewerRole = 'student' | 'supervisor' | 'examiner' | 'coordinator' | 'faculty_admin' | 'administrative_secretary' | 'system_admin';

// Read-only mirror of server/src/controllers/gradeHistoryController.ts's response —
// see also web/components/GradeHistoryPanel.tsx for the same shape ported to web.
export interface GradeEntry {
  id: string;
  graderId: string;
  graderRole: string;
  comments: string;
  submittedAt: string | null;
  grading: Record<string, number> | null;
}
export interface AuditEntry {
  id: string;
  action: string;
  explanation: string | null;
  timestamp: string | null;
}
export interface MilestoneGradeHistory {
  milestoneId: string;
  grades: GradeEntry[];
  auditTrail: AuditEntry[];
}

interface Props {
  milestones:    MilestoneData[];
  lang:          Lang;
  isRtl:         boolean;
  viewerRole:    ViewerRole;
  projectId:     string;
  // Callbacks — passed from parent so each role can handle its own logic
  onStudentSubmit?:      (milestone: MilestoneData) => void;
  onSupervisorGrade?:    (milestone: MilestoneData) => void;
  onCoordinatorApprove?: (milestone: MilestoneData) => void;
  onExaminerGrade?:      (milestone: MilestoneData) => void;
  onScheduleDefense?:    (milestone: MilestoneData) => void;
  onAdjustDate?:         (milestone: MilestoneData, newDate: Date) => void;
  /** Read-only, keyed by milestoneId — see fetch in the main component below. */
  gradeHistoryByMilestone?: Record<string, MilestoneGradeHistory>;
}

// ─── Status display config ────────────────────────────────────────────────────
const STATUS_CONFIG: Record<MilestoneStatus, {
  icon: string; colorKey: string;
  labelHe: string; labelEn: string;
}> = {
  pending:              { icon: '⏳', colorKey: '#8899BB', labelHe: 'ממתין להגשה',          labelEn: 'Awaiting Submission' },
  submitted:            { icon: '📤', colorKey: '#F59E0B', labelHe: 'הוגש',                 labelEn: 'Submitted' },
  supervisor_graded:    { icon: '👨‍🏫', colorKey: '#2E86FF', labelHe: 'נוקד ע"י מנחה',        labelEn: 'Supervisor Graded' },
  coordinator_approved: { icon: '✅', colorKey: '#8B5CF6', labelHe: 'אושר ע"י רכז',         labelEn: 'Coordinator Approved' },
  graded:               {icon: '👨‍🏫',  colorKey: 'blue',    labelHe: 'נוקד ע"י מנחה',        labelEn: 'Graded' }, // ← add this
  examiners_assigned:   { icon: '👥', colorKey: '#6366F1', labelHe: 'בוחנים הוקצו',         labelEn: 'Examiners Assigned' },  // ← add this
  examiner_graded:      { icon: '🎓', colorKey: '#10B981', labelHe: 'נוקד ע"י בוחנים',      labelEn: 'Examiner Graded' },
  both_examiners_graded:{ icon: '🎓', colorKey: '#10B981', labelHe: 'שני בוחנים ניקדו',     labelEn: 'Both Examiners Graded' }, // ← add this
  completed:            { icon: '🏁', colorKey: '#10B981', labelHe: 'הושלם ✓',               labelEn: 'Completed ✓' },
};

// ─── Single milestone card ─────────────────────────────────────────────────────
function MilestoneCard({
  milestone, index, total, lang, isRtl, viewerRole,
  onStudentSubmit, onSupervisorGrade, onCoordinatorApprove,
  onExaminerGrade, onScheduleDefense, onAdjustDate,
  gradeHistoryByMilestone,
}: {
  milestone: MilestoneData;
  index: number; total: number;
} & Omit<Props, 'milestones'>) {

  const [expanded, setExpanded] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [newDateText, setNewDateText] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [savingDate, setSavingDate] = useState(false);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  // 'coordinator_approved' is the actual completion status the server sets
  // (coordinatorController.ts) — 'completed' alone is never written anywhere.
  const isCompleted = milestone.status === 'coordinator_approved' || milestone.status === 'completed';
  // MilestoneStatus here (components/Milestoneservice.ts) is a narrower
  // 9-value union than the canonical one in types/index.ts (14 values,
  // e.g. 'rejected'/'scheduled'/defense-scheduling statuses) — a real
  // milestone can carry one of those extra statuses this map doesn't cover.
  // Falls back to a neutral display rather than crashing (?.).
  const cfg         = STATUS_CONFIG[milestone.status] ??
    { icon: '❔', colorKey: '#8899BB', labelHe: milestone.status, labelEn: milestone.status };
  const days        = daysUntil(milestone.dueDate);
  const urgency     = isCompleted ? 'ok' : urgencyLevel(days);
  const urgColors   = URGENCY_COLORS[urgency];
  const isLast      = index === total - 1;
  const isDefense   = milestone.type === 'defense';

  // Overriding is allowed regardless of the milestone's current status — an
  // emergency delay (illness, war, etc.) may need to push back a deadline
  // even for a milestone already submitted or approved. Mirrors
  // UPDATE_MILESTONE_ROLES in milestoneController.ts.
  const canCoordinatorAdjust = (
    viewerRole === 'coordinator' ||
    viewerRole === 'faculty_admin' ||
    viewerRole === 'administrative_secretary' ||
    viewerRole === 'system_admin'
  );

  const handleSaveDate = async (milestoneId: string) => {
    if (!newDateText.trim() || !reasonText.trim()) return;
    const parsed = new Date(newDateText);
    if (isNaN(parsed.getTime())) return;
    try {
      setSavingDate(true);
      const res = await apiClient.put(`/api/milestones/${milestoneId}`, {
        dueDate: parsed.toISOString(),
        reason: reasonText.trim(),
      });
      if (res.data.pendingApproval) {
        // coordinator/administrative coordinator — needs program_head/faculty_admin
        // sign-off before it actually takes effect (P1 #12).
        Alert.alert(
          '⏳',
          lang === 'he'
            ? 'הבקשה נשלחה לאישור ראש התוכנית/הפקולטה ותיושם רק לאחר אישור.'
            : 'This request was sent for program-head/faculty-admin approval and will only take effect once approved.',
        );
      } else {
        onAdjustDate?.(milestone, parsed);
      }
      setShowDatePicker(false);
      setNewDateText('');
      setReasonText('');
    } finally {
      setSavingDate(false);
    }
  };

  return (
    <View style={[mc.wrapper, isRtl && mc.wrapperRtl]}>

      {/* ── Timeline spine ── */}
      <View style={mc.spine}>
        {/* Step dot */}
        <View style={[
          mc.dot,
          isCompleted         ? mc.dotCompleted
          : milestone.status !== 'pending' ? mc.dotActive
          : mc.dotPending,
        ]}>
          <Text style={mc.dotIcon}>{cfg.icon}</Text>
        </View>
        {/* Connecting line to next milestone */}
        {!isLast && (
          <View style={[
            mc.line,
            isCompleted ? mc.lineCompleted : mc.linePending,
          ]} />
        )}
      </View>

      {/* ── Card body ── */}
      <Pressable
        style={[mc.card, expanded && mc.cardExpanded, isCompleted && mc.cardCompleted]}
        onPress={() => setExpanded(!expanded)}
      >
        {/* Header */}
        <View style={[mc.cardHeader, isRtl && mc.rowReverse]}>
          <View style={mc.cardTitleWrap}>
            <Text style={[mc.cardTitle, isRtl && mc.textRight, isCompleted && mc.cardTitleCompleted]}>
              {lang === 'he' ? milestone.nameHe : milestone.nameEn}
            </Text>
            <View style={[mc.statusBadge, { backgroundColor: urgColors.bg, borderColor: urgColors.border }]}>
              <Text style={[mc.statusBadgeText, { color: urgColors.text }]}>
                {lang === 'he' ? cfg.labelHe : cfg.labelEn}
              </Text>
            </View>
          </View>

          {/* Countdown / date chip */}
          <View style={[mc.dateChip, { backgroundColor: urgColors.bg, borderColor: urgColors.border }]}>
            {isCompleted ? (
              <Text style={[mc.dateChipText, { color: '#10B981' }]}>✓</Text>
            ) : (
              <>
                <Text style={[mc.dateChipDays, { color: urgColors.text }]}>
                  {days < 0 ? Math.abs(days) : days}
                </Text>
                <Text style={[mc.dateChipLabel, { color: urgColors.text }]}>
                  {days < 0
                    ? (lang === 'he' ? 'ימי\nאיחור' : 'days\noverdue')
                    : (lang === 'he' ? 'ימים\nנותרו' : 'days\nleft')}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Due date line */}
        <Text style={[mc.dueDate, isRtl && mc.textRight]}>
          📅 {lang === 'he' ? 'תאריך יעד:' : 'Due:'}{' '}
              {toDate(milestone.dueDate)?.toLocaleDateString(
                lang === 'he' ? 'he-IL' : 'en-GB',
                { day: 'numeric', month: 'long', year: 'numeric' }
              ) ?? '—'}
          {canCoordinatorAdjust && (
            <Text
              style={mc.adjustBtn}
              onPress={(e) => { e.stopPropagation?.(); setSelectedMilestoneId(milestone.id); setShowDatePicker(true); }}
            >
              {'  '}✏️ {lang === 'he' ? 'שנה תאריך' : 'Adjust'}
            </Text>
          )}
        </Text>

        {/* Submitted date */}
        {milestone.submittedAt && (
          <Text style={[mc.submittedDate, isRtl && mc.textRight]}>
            📤 {lang === 'he' ? 'הוגש:' : 'Submitted:'}{' '}
            {typeof milestone.submittedAt === 'string'
              ? milestone.submittedAt
              : milestone.submittedAt?.toDate?.()?.toLocaleDateString(
                  lang === 'he' ? 'he-IL' : 'en-GB',
                  { day: 'numeric', month: 'short', year: 'numeric' }
                ) ?? '—'
            }
          </Text>
        )}

        {/* Defense info */}
        {isDefense && milestone.defenseDate && (
          <View style={mc.defenseBanner}>
            <Text style={[mc.defenseBannerText, isRtl && mc.textRight]}>
              🎓 {lang === 'he' ? 'מועד הגנה:' : 'Defense Date:'}{' '}
              {typeof milestone.defenseDate === 'string'
                ? milestone.defenseDate
                : milestone.defenseDate?.toDate?.()?.toLocaleDateString(
                    lang === 'he' ? 'he-IL' : 'en-GB',
                    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
                  ) ?? '—'
              }
              {milestone.defenseTime ? `  |  🕐 ${milestone.defenseTime}` : ''}
              {milestone.defenseBuilding ? `  |  🏢 ${milestone.defenseBuilding}` : ''}
              {milestone.defenseRoom ? `  |  🏛️ ${milestone.defenseRoom}` : ''}
            </Text>
            {milestone.onlineDefenseLink && (
              <Text
                style={[mc.defenseBannerText, { textDecorationLine: 'underline' }, isRtl && mc.textRight]}
                onPress={() => Linking.openURL(milestone.onlineDefenseLink!)}
              >
                💻 {lang === 'he' ? 'הצטרפות מקוונת' : 'Join online'}
              </Text>
            )}
          </View>
        )}

        {/* Grade chip */}
        {milestone.finalGrade !== null && (
          <View style={mc.gradeChip}>
            <Text style={mc.gradeChipLabel}>{lang === 'he' ? 'ציון סופי:' : 'Final Grade:'}</Text>
            <Text style={mc.gradeChipValue}>{milestone.finalGrade}</Text>
          </View>
        )}

        {/* ── Expanded content ── */}
        {expanded && (
          <View style={mc.expandedContent}>
            {/* Description */}
            <Text style={[mc.description, isRtl && mc.textRight]}>
              {lang === 'he' ? milestone.descriptionHe : milestone.descriptionEn}
            </Text>

            {/* Approval chain */}
            <Text style={[mc.chainTitle, isRtl && mc.textRight]}>
              {lang === 'he' ? 'תהליך האישור:' : 'Approval Chain:'}
            </Text>
            {(lang === 'he' ? milestone.approvalChainHe : milestone.approvalChainEn).map((step, i) => {
              const isDone = (() => {
                if (i === 0) return milestone.status !== 'pending';
                if (i === 1) return ['supervisor_graded','coordinator_approved','examiner_graded','completed'].includes(milestone.status);
                if (i === 2) return ['coordinator_approved','examiner_graded','completed'].includes(milestone.status);
                return milestone.status === 'completed';
              })();
              return (
                <View key={i} style={[mc.chainStep, isRtl && mc.rowReverse]}>
                  <View style={[mc.chainDot, isDone && mc.chainDotDone]} />
                  <Text style={[mc.chainText, isDone && mc.chainTextDone, isRtl && mc.textRight]}>
                    {step}
                  </Text>
                </View>
              );
            })}

            {/* ── Role-based action buttons ── */}

            {/* Student: submit */}
            {viewerRole === 'student' && milestone.status === 'pending' && !isDefense && (
              <Pressable style={mc.actionBtn} onPress={() => onStudentSubmit?.(milestone)}>
                <Text style={mc.actionBtnText}>
                  📤 {lang === 'he' ? 'הגש עכשיו' : 'Submit Now'}
                </Text>
              </Pressable>
            )}

            {/* Supervisor: grade */}
            {viewerRole === 'supervisor' && milestone.status === 'submitted' && (
              <Pressable style={[mc.actionBtn, mc.actionBtnGreen]} onPress={() => onSupervisorGrade?.(milestone)}>
                <Text style={mc.actionBtnText}>
                  ✏️ {lang === 'he' ? 'תן ציון' : 'Grade Submission'}
                </Text>
              </Pressable>
            )}

            {/* Coordinator: approve */}
            {(viewerRole === 'coordinator' || viewerRole === 'faculty_admin' || viewerRole === 'system_admin')
              && milestone.status === 'supervisor_graded' && (
              <Pressable style={[mc.actionBtn, mc.actionBtnPurple]} onPress={() => onCoordinatorApprove?.(milestone)}>
                <Text style={mc.actionBtnText}>
                  ✅ {lang === 'he' ? 'אשר ציון' : 'Approve Grade'}
                </Text>
              </Pressable>
            )}

            {/* Coordinator: schedule defense */}
            {(viewerRole === 'coordinator' || viewerRole === 'faculty_admin' || viewerRole === 'system_admin')
              && isDefense && milestone.status === 'coordinator_approved' && !milestone.defenseDate && (
              <Pressable style={[mc.actionBtn, mc.actionBtnOrange]} onPress={() => onScheduleDefense?.(milestone)}>
                <Text style={mc.actionBtnText}>
                  📅 {lang === 'he' ? 'תאם מועד הגנה' : 'Schedule Defense'}
                </Text>
              </Pressable>
            )}

            {/* Examiner: grade defense */}
            {viewerRole === 'examiner' && isDefense && milestone.status === 'coordinator_approved' && (
              <Pressable style={[mc.actionBtn, mc.actionBtnPurple]} onPress={() => onExaminerGrade?.(milestone)}>
                <Text style={mc.actionBtnText}>
                  ✏️ {lang === 'he' ? 'מלא טופס ציון הגנה' : 'Fill Defense Grade Form'}
                </Text>
              </Pressable>
            )}

            {/* Grade history — read-only, from server/src/controllers/gradeHistoryController.ts */}
            {(() => {
              const history = gradeHistoryByMilestone?.[milestone.id];
              if (!history || (history.grades.length === 0 && history.auditTrail.length === 0)) return null;
              return (
                <View style={mc.gradeHistorySection}>
                  <Text style={[mc.chainTitle, isRtl && mc.textRight]}>
                    {lang === 'he' ? 'היסטוריית ציונים:' : 'Grade History:'}
                  </Text>
                  {history.grades.map((g) => (
                    <Text key={g.id} style={[mc.gradeHistoryLine, isRtl && mc.textRight]}>
                      {g.graderRole} — {g.grading?.total ?? '—'}{g.comments ? ` · ${g.comments}` : ''}
                    </Text>
                  ))}
                  {history.auditTrail.map((a) => (
                    <Text key={a.id} style={[mc.gradeHistoryLine, isRtl && mc.textRight]}>
                      {a.action}{a.timestamp ? ` — ${new Date(a.timestamp).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB')}` : ''}
                    </Text>
                  ))}
                </View>
              );
            })()}
          </View>
        )}

        {/* Expand chevron */}
        <Text style={[mc.chevron, isRtl && mc.textRight]}>
          {expanded ? '▲' : '▼'}
        </Text>
      </Pressable>

      {/* ── Date Adjustment Modal (coordinator only) ── */}
      <Modal visible={showDatePicker} animationType="fade" transparent>
        <View style={mc.modalOverlay}>
          <View style={mc.modalCard}>
            <Text style={mc.modalTitle}>
              {lang === 'he' ? 'שינוי תאריך יעד' : 'Adjust Due Date'}
            </Text>
            <Text style={mc.modalSub}>
              {lang === 'he' ? milestone.nameHe : milestone.nameEn}
            </Text>
            <TextInput
              style={mc.modalInput}
              value={newDateText}
              onChangeText={setNewDateText}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9BA8C0"
              textAlign="center"
            />
            <Text style={mc.modalHint}>
              {lang === 'he' ? 'פורמט: שנה-חודש-יום' : 'Format: YYYY-MM-DD'}
            </Text>
            <TextInput
              style={mc.modalInput}
              value={reasonText}
              onChangeText={setReasonText}
              placeholder={lang === 'he' ? 'סיבת השינוי (נדרש)' : 'Reason for change (required)'}
              placeholderTextColor="#9BA8C0"
              textAlign={isRtl ? 'right' : 'left'}
            />
            <View style={mc.modalBtns}>
              <Pressable style={mc.modalCancelBtn} onPress={() => setShowDatePicker(false)}>
                <Text style={mc.modalCancelText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
              </Pressable>
              <Pressable
                style={[mc.modalSaveBtn, savingDate && { opacity: 0.6 }]}
                onPress={() => {
                  if (selectedMilestoneId) {
                    handleSaveDate(selectedMilestoneId);
                  }
                }}
                disabled={savingDate}
              >
                {savingDate
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={mc.modalSaveText}>{lang === 'he' ? 'שמור' : 'Save'}</Text>
                }
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────
export default function MilestoneTimeline({
  milestones, lang, isRtl, viewerRole, projectId,
  onStudentSubmit, onSupervisorGrade, onCoordinatorApprove,
  onExaminerGrade, onScheduleDefense, onAdjustDate,
}: Props) {
  const [gradeHistoryByMilestone, setGradeHistoryByMilestone] = useState<Record<string, MilestoneGradeHistory>>({});

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    apiClient.getProjectGradeHistory(projectId)
      .then((res: { milestones: MilestoneGradeHistory[] }) => {
        if (cancelled) return;
        const byId: Record<string, MilestoneGradeHistory> = {};
        (res.milestones ?? []).forEach((m) => { byId[m.milestoneId] = m; });
        setGradeHistoryByMilestone(byId);
      })
      .catch((err: unknown) => console.error('Failed to load grade history:', err));
    return () => { cancelled = true; };
  }, [projectId]);

  if (milestones.length === 0) {
    return (
      <View style={tl.empty}>
        <Text style={tl.emptyEmoji}>📋</Text>
        <Text style={tl.emptyText}>
          {lang === 'he'
            ? 'אבני הדרך ייווצרו אוטומטית עם אישור הסטודנט לפרויקט.'
            : 'Milestones will be created automatically when the student is approved.'}
        </Text>
      </View>
    );
  }

  // Progress bar
  // 'coordinator_approved' is the actual completion status the server sets
  // (coordinatorController.ts) — 'completed' alone is never written anywhere.
  const completed = milestones.filter(
    (m) => m.status === 'coordinator_approved' || m.status === 'completed'
  ).length;
  const progress  = Math.round((completed / milestones.length) * 100);

  return (
    <View>
      {/* Progress summary */}
      <View style={tl.progressCard}>
        <View style={[tl.progressHeader, isRtl && tl.rowReverse]}>
          <Text style={[tl.progressTitle, isRtl && tl.textRight]}>
            {lang === 'he' ? 'התקדמות הפרויקט' : 'Project Progress'}
          </Text>
          <Text style={tl.progressPct}>{progress}%</Text>
        </View>
        <View style={tl.progressTrack}>
          <View style={[tl.progressFill, { width: `${progress}%` as any }]} />
        </View>
        <Text style={[tl.progressSub, isRtl && tl.textRight]}>
          {completed} / {milestones.length}{' '}
          {lang === 'he' ? 'אבני דרך הושלמו' : 'milestones completed'}
        </Text>
      </View>

      {/* Timeline */}
      <View style={tl.timeline}>
        {milestones.map((m, i) => (
          <MilestoneCard
            key={m.id}
            milestone={m}
            index={i}
            total={milestones.length}
            lang={lang}
            isRtl={isRtl}
            viewerRole={viewerRole}
            projectId={projectId}
            onStudentSubmit={onStudentSubmit}
            onSupervisorGrade={onSupervisorGrade}
            onCoordinatorApprove={onCoordinatorApprove}
            onExaminerGrade={onExaminerGrade}
            onScheduleDefense={onScheduleDefense}
            onAdjustDate={onAdjustDate}
            gradeHistoryByMilestone={gradeHistoryByMilestone}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const tl = MilestoneTimelineStyles;

const mc = MilestoneCardStyles;