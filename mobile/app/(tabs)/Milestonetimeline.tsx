// components/MilestoneTimeline.tsx
//
// Shared timeline component — works for student, supervisor, coordinator, admin.
// Props control which actions are visible per role.

import React, { useState } from 'react';
import { toDate } from '@/components/shared';
import {
  View, Text, Pressable, StyleSheet,
  Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { Timestamp } from 'firebase/firestore';
import { apiClient } from '../../src/api/apiClient';
import {
  daysUntil, urgencyLevel, URGENCY_COLORS,
  type MilestoneStatus,
} from '../../components/Milestoneservice';
import type { Lang } from '../../components/i18n';

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
  finalGrade:    number | null;
  fileUrls:      string[];
}

export type ViewerRole = 'student' | 'supervisor' | 'examiner' | 'coordinator' | 'faculty_admin' | 'system_admin';

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
}

// ─── Status display config ────────────────────────────────────────────────────
const STATUS_CONFIG: Record<MilestoneStatus, {
  icon: string; colorKey: string;
  labelHe: string; labelEn: string;
}> = {
  pending:              { icon: '⏳', colorKey: '#8899BB', labelHe: 'ממתין להגשה',         labelEn: 'Awaiting Submission' },
  submitted:            { icon: '📤', colorKey: '#F59E0B', labelHe: 'הוגש',                 labelEn: 'Submitted' },
  supervisor_graded:    { icon: '👨‍🏫', colorKey: '#2E86FF', labelHe: 'נוקד ע"י מנחה',       labelEn: 'Supervisor Graded' },
  coordinator_approved: { icon: '✅', colorKey: '#8B5CF6', labelHe: 'אושר ע"י רכז',         labelEn: 'Coordinator Approved' },
  examiners_assigned:   { icon: '👥', colorKey: '#6366F1', labelHe: 'בוחנים הוקצו',         labelEn: 'Examiners Assigned' },  // ← add this
  examiner_graded:      { icon: '🎓', colorKey: '#10B981', labelHe: 'נוקד ע"י בוחנים',      labelEn: 'Examiner Graded' },
  both_examiners_graded:{ icon: '🎓', colorKey: '#10B981', labelHe: 'שני בוחנים ניקדו',     labelEn: 'Both Examiners Graded' }, // ← add this
  completed:            { icon: '🏁', colorKey: '#10B981', labelHe: 'הושלם ✓',              labelEn: 'Completed ✓' },
};

// ─── Single milestone card ─────────────────────────────────────────────────────
function MilestoneCard({
  milestone, index, total, lang, isRtl, viewerRole,
  onStudentSubmit, onSupervisorGrade, onCoordinatorApprove,
  onExaminerGrade, onScheduleDefense, onAdjustDate,
}: {
  milestone: MilestoneData;
  index: number; total: number;
} & Omit<Props, 'milestones'>) {

  const [expanded, setExpanded] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [newDateText, setNewDateText] = useState('');
  const [savingDate, setSavingDate] = useState(false);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [selectedDateString, setSelectedDateString] = useState<string>(''); // or Date / number
  const isCompleted = milestone.status === 'completed';
  const cfg         = STATUS_CONFIG[milestone.status];
  const days        = daysUntil(milestone.dueDate);
  const urgency     = isCompleted ? 'ok' : urgencyLevel(days);
  const urgColors   = URGENCY_COLORS[urgency];
  const isLast      = index === total - 1;
  const isDefense   = milestone.type === 'defense';

  const canCoordinatorAdjust = (
    viewerRole === 'coordinator' ||
    viewerRole === 'faculty_admin' ||
    viewerRole === 'system_admin'
  ) && milestone.status === 'pending';

  const handleSaveDate = async (milestoneId: string, updatedData: any) => {
    if (!newDateText.trim()) return;
    const parsed = new Date(newDateText);
    if (isNaN(parsed.getTime())) return;
    try {
      setSavingDate(true);
      /*await updateDoc(doc(db, 'milestones', milestone.id), {
        dueDate: Timestamp.fromDate(parsed),
      });*/
      await apiClient.put(`/api/milestones/${milestoneId}`, {
        status: updatedData.status,
        dueDate: updatedData.dueDate, // Express backend maps date changes securely
        grades: updatedData.grades
      });
      onAdjustDate?.(milestone, parsed);
      setShowDatePicker(false);
      setNewDateText('');
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
              onPress={(e) => { e.stopPropagation?.(); setShowDatePicker(true); }}
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
              {milestone.defenseRoom ? `  |  🏛️ ${milestone.defenseRoom}` : ''}
            </Text>
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
            <View style={mc.modalBtns}>
              <Pressable style={mc.modalCancelBtn} onPress={() => setShowDatePicker(false)}>
                <Text style={mc.modalCancelText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
              </Pressable>
              <Pressable
                style={[mc.modalSaveBtn, savingDate && { opacity: 0.6 }]}
                onPress={() => {
                  if (selectedMilestoneId) {
                    handleSaveDate(selectedMilestoneId, {
                      dueDate: selectedDateString, // Passes the new date string or timestamp
                      status: 'pending'            // Keeps or modifies the status parameter securely
                    });
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
  const completed = milestones.filter((m) => m.status === 'completed').length;
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
          />
        ))}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const tl = StyleSheet.create({
  progressCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: '#E0E8FF',
    shadowColor: '#2E86FF', shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  progressHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  rowReverse:      { flexDirection: 'row-reverse' },
  textRight:       { textAlign: 'right' },
  progressTitle:   { fontSize: 14, fontWeight: '700', color: '#111' },
  progressPct:     { fontSize: 22, fontWeight: '900', color: '#2E86FF' },
  progressTrack:   { height: 8, backgroundColor: '#E0E8FF', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressFill:    { height: '100%', backgroundColor: '#2E86FF', borderRadius: 4 },
  progressSub:     { fontSize: 12, color: '#8899BB' },
  timeline:        { paddingLeft: 4 },
  empty:           { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji:      { fontSize: 40, marginBottom: 12 },
  emptyText:       { fontSize: 14, color: '#8899BB', textAlign: 'center', lineHeight: 20 },
});

const mc = StyleSheet.create({
  wrapper:     { flexDirection: 'row', marginBottom: 4 },
  wrapperRtl:  { flexDirection: 'row-reverse' },
  rowReverse:  { flexDirection: 'row-reverse' },
  textRight:   { textAlign: 'right' },

  // Spine
  spine:       { width: 40, alignItems: 'center' },
  dot: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    zIndex: 1, borderWidth: 2,
  },
  dotPending:   { backgroundColor: '#F0F4FF', borderColor: '#D0DEFF' },
  dotActive:    { backgroundColor: '#EFF6FF', borderColor: '#2E86FF' },
  dotCompleted: { backgroundColor: '#ECFDF5', borderColor: '#10B981' },
  dotIcon:      { fontSize: 16 },
  line:         { width: 2, flex: 1, minHeight: 20, marginVertical: 2 },
  linePending:  { backgroundColor: '#E0E8FF' },
  lineCompleted:{ backgroundColor: '#10B981' },

  // Card
  card: {
    flex: 1, marginLeft: 12, marginBottom: 16,
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#E0E8FF',
    shadowColor: '#2E86FF', shadowOpacity: 0.06, shadowRadius: 8, elevation: 1,
  },
  cardExpanded:   { borderColor: '#2E86FF' },
  cardCompleted:  { backgroundColor: '#FAFFFE', borderColor: '#A7F3D0' },
  cardHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  cardTitleWrap:  { flex: 1, marginRight: 10 },
  cardTitle:      { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 5 },
  cardTitleCompleted: { textDecorationLine: 'none', color: '#10B981' },

  statusBadge: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, alignSelf: 'flex-start',
  },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },

  // Countdown chip
  dateChip: {
    borderRadius: 12, padding: 8, alignItems: 'center',
    minWidth: 52, borderWidth: 1,
  },
  dateChipDays:  { fontSize: 20, fontWeight: '900', lineHeight: 24 },
  dateChipLabel: { fontSize: 9, fontWeight: '600', textAlign: 'center', lineHeight: 12 },
  dateChipText:  { fontSize: 20, fontWeight: '900' },

  dueDate:      { fontSize: 12, color: '#8899BB', marginBottom: 4 },
  adjustBtn:    { color: '#2E86FF', fontSize: 12, fontWeight: '600' },
  submittedDate:{ fontSize: 12, color: '#10B981', marginBottom: 4 },

  // Defense banner
  defenseBanner: {
    backgroundColor: '#F5F3FF', borderRadius: 10, padding: 10, marginTop: 6,
    borderLeftWidth: 3, borderLeftColor: '#8B5CF6',
  },
  defenseBannerText: { fontSize: 13, color: '#6B21A8', fontWeight: '500' },

  // Grade chip
  gradeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
    backgroundColor: '#ECFDF5', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start',
  },
  gradeChipLabel: { fontSize: 12, color: '#10B981', fontWeight: '600' },
  gradeChipValue: { fontSize: 18, fontWeight: '900', color: '#10B981' },

  // Expanded
  expandedContent: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F0F4FF' },
  description:     { fontSize: 13, color: '#445', lineHeight: 19, marginBottom: 14 },
  chainTitle:      { fontSize: 12, fontWeight: '700', color: '#8899BB', marginBottom: 8, letterSpacing: 0.3 },
  chainStep:       { flexDirection: 'row', alignItems: 'center', marginBottom: 7, gap: 8 },
  chainDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#D0DEFF', flexShrink: 0,
  },
  chainDotDone:   { backgroundColor: '#10B981' },
  chainText:      { fontSize: 12, color: '#8899BB', flex: 1 },
  chainTextDone:  { color: '#10B981', fontWeight: '600' },

  // Action buttons
  actionBtn: {
    backgroundColor: '#2E86FF', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center', marginTop: 14,
    shadowColor: '#2E86FF', shadowOpacity: 0.25, shadowRadius: 6, elevation: 2,
  },
  actionBtnGreen:  { backgroundColor: '#10B981', shadowColor: '#10B981' },
  actionBtnPurple: { backgroundColor: '#8B5CF6', shadowColor: '#8B5CF6' },
  actionBtnOrange: { backgroundColor: '#F97316', shadowColor: '#F97316' },
  actionBtnText:   { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Chevron
  chevron: { textAlign: 'center', color: '#C0CCDD', fontSize: 11, marginTop: 6 },

  // Date picker modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    width: '80%', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, elevation: 10,
  },
  modalTitle:    { fontSize: 17, fontWeight: '800', color: '#111', marginBottom: 4 },
  modalSub:      { fontSize: 13, color: '#8899BB', marginBottom: 16, textAlign: 'center' },
  modalInput: {
    width: '100%', backgroundColor: '#F0F4FF', borderRadius: 12,
    padding: 14, fontSize: 18, fontWeight: '700', color: '#111',
    borderWidth: 1, borderColor: '#D0DEFF', marginBottom: 6,
  },
  modalHint:     { fontSize: 11, color: '#9BA8C0', marginBottom: 18 },
  modalBtns:     { flexDirection: 'row', gap: 10, width: '100%' },
  modalCancelBtn:{
    flex: 1, backgroundColor: '#F0F4FF', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
    borderWidth: 1, borderColor: '#D0DEFF',
  },
  modalCancelText:{ fontSize: 14, fontWeight: '600', color: '#8899BB' },
  modalSaveBtn:  {
    flex: 1, backgroundColor: '#2E86FF', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  modalSaveText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});