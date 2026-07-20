// student/screens/ActiveDashboard.tsx
import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  Modal, TextInput, ActivityIndicator, Linking,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { auth } from '../../src/firebase/firebase';
import { tx, type Lang } from '../../components/i18n';
import type { ActiveProject, Milestone, MilestoneType, MilestoneStatus } from '@/types';
import { ActivateDashboardStyles } from '@/constants';
import { apiClient } from '../../src/api/apiClient';
import { ThesisTemplateCardStyles, GradeBreakdownStyles } from '../../constants/styles';

interface Props {
  project:       ActiveProject;
  milestones:    Milestone[];
  nextMilestone: Milestone | null;
  progress:      number;
  lang:          Lang;
  isRtl:         boolean;
}



// ─── Milestone type labels ─────────────────────────────────────────────────────
const MILESTONE_LABEL: Record<MilestoneType, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר',    en: 'Research Proposal' },
  progress_report:   { he: 'דו"ח התקדמות', en: 'Progress Report' },
  final_report:      { he: 'דו"ח מסכם',    en: 'Final Report' },
  defense:           { he: 'הגנה',          en: 'Defense' },
};

const STATUS_CONFIG: Record<MilestoneStatus, { color: string; bg: string; icon: string }> = {
  pending:              { color: '#8899BB', bg: '#F0F4FF', icon: '🕐' },
  submitted:            { color: '#F59E0B', bg: '#FFFBEB', icon: '📤' },
  supervisor_graded:    { color: '#3B82F6', bg: '#EFF6FF', icon: '👨‍🏫' },
  graded:               { color: '#3B82F6', bg: '#EFF6FF', icon: '👨‍🏫' },
  coordinator_approved: { color: '#8B5CF6', bg: '#F5F3FF', icon: '✅' },
  examiners_assigned:   { color: '#6366F1', bg: '#EEF2FF', icon: '👥' },
  examiner_graded:      { color: '#10B981', bg: '#ECFDF5', icon: '🎓' },
  both_examiners_graded:{ color: '#10B981', bg: '#ECFDF5', icon: '🎓' },
  awaiting_defense_date:{ color: '#F59E0B', bg: '#FFFBEB', icon: '📅' },
  date_conflict:        { color: '#EF4444', bg: '#FEF2F2', icon: '⚠️' },
  defense_date_set:     { color: '#6366F1', bg: '#EEF2FF', icon: '📌' },
  scheduled:            { color: '#10B981', bg: '#ECFDF5', icon: '🎓' },
  completed:            { color: '#10B981', bg: '#ECFDF5', icon: '🏁' },
};

const MILESTONE_ORDER: MilestoneType[] = [
  'research_proposal',
  'progress_report',
  'final_report',
  'defense',
];

export default function ActiveDashboard({
  project, milestones, nextMilestone, progress, lang, isRtl,
}: Props) {
  const [submitModal,     setSubmitModal]     = useState(false);
  const [targetMilestone, setTargetMilestone] = useState<Milestone | null>(null);
  const [note,            setNote]            = useState('');
  const [files,           setFiles]           = useState<Array<{ uri: string; name: string; mimeType?: string }>>([]);
  const [submitting,      setSubmitting]      = useState(false);
  const [submitMessage,   setSubmitMessage]   = useState<string | null>(null);
  const [activeTab,       setActiveTab]       = useState<'overview' | 'milestones' | 'grades'>('overview');
  const [expandedGrades,   setExpandedGrades]   = useState<Record<string, boolean>>({});
  const [loadingDetail, setLoadingDetail] = useState<Record<string, boolean>>({});
  const [gradeDetails, setGradeDetails] = useState<Record<string, any>>({});
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  // Only masters students writing an actual thesis (not a masters project) see
  // the thesis template download — driven off the project doc's own
  // degreeType/projectType rather than a separately-threaded student profile
  // field, since both are already present on `project`.
  const isMastersThesis = project.degreeType === 'masters' && project.projectType === 'thesis';

  const handleDownloadThesisTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      const res = await apiClient.get('/api/student/thesis-template');
      const url = res.data?.url;
      if (url) await Linking.openURL(url);
    } catch (e) {
      console.error('Failed to open thesis template:', e);
    } finally {
      setDownloadingTemplate(false);
    }
  };

  // ─── Milestone unlock logic ────────────────────────────────────────────────
  // A milestone is "unlocked" (ready to interact with) when all previous ones
  // have status === 'coordinator_approved' OR 'completed'.
  const isUnlocked = (m: Milestone): boolean => {
    const idx = MILESTONE_ORDER.indexOf(m.type);
    if (idx === 0) return true;
    return milestones
      .filter(prev => MILESTONE_ORDER.indexOf(prev.type) < idx)
      .every(prev => prev.status === 'coordinator_approved' || prev.status === 'completed');
  };

  // ─── The "true" next actionable milestone for the Overview tab ────────────
  // This is the first milestone that is still 'pending' AND unlocked.
  // After coordinator_approved the next pending one becomes unlocked.
  const actionableNextMilestone: Milestone | null =
    milestones.find(m => m.status === 'pending' && isUnlocked(m)) ?? null;

  // ─── Overview banner: what to display ─────────────────────────────────────
  // Show the submitted/in-review milestone if any, otherwise the next pending one.
  const overviewDisplayMilestone: Milestone | null =
    milestones.find(m => ['submitted', 'supervisor_graded', 'graded'].includes(m.status))
    ?? actionableNextMilestone;

  // Is there a milestone currently waiting for coordinator approval?
  const isWaitingApproval = milestones.some(
    m => ['graded', 'supervisor_graded'].includes(m.status)
  );

  // ── Days until deadline ────────────────────────────────────────────────────
  const daysUntil = (ts: string | null | undefined): number | null => {
    const date = toDate(ts);
    if (!date) return null;
    const diff = date.getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const toDate = (val: any): Date | null => {
    if (!val) return null;
    if (typeof val?.toDate === 'function') return val.toDate();
    // ISO string or number
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  // ── File picker ────────────────────────────────────────────────────────────
  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true });
    if (result.canceled || !result.assets?.length) return;
    setFiles((prev) => [
      ...prev,
      ...result.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType })),
    ]);
  };

  // ── Submit milestone ───────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!targetMilestone) return;
    if (!isUnlocked(targetMilestone)) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
      setSubmitting(true);
      setSubmitMessage(null);

      const formData = new FormData();
      files.forEach((f) => {
        const fileExtension = f.name?.split('.').pop()?.toLowerCase();
        const fallbackType  = fileExtension === 'pdf' ? 'application/pdf' : 'application/octet-stream';
        formData.append('files', {
          uri:  f.uri,
          name: f.name,
          type: f.mimeType || fallbackType,
        } as any);
      });
      formData.append('note',        note);
      formData.append('milestoneId', targetMilestone.id);
      formData.append('projectId',   project.id);
      await apiClient.submitMilestone(targetMilestone.id, formData);

      setSubmitMessage('✅ ' + tx('submitSuccess', lang));
      setTimeout(() => {
        setSubmitModal(false);
        setFiles([]);
        setNote('');
        setSubmitMessage(null);
      }, 1500);

    } catch (e: any) {
      console.error('Submit milestone error:', e?.message);
      setSubmitMessage(tx('submitError', lang));
    } finally {
      setSubmitting(false);
    }
  };

  const openSubmit = (m: Milestone) => {
    setTargetMilestone(m);
    setSubmitModal(true);
  };

  const handleExpandGrade = (milestoneId: string) => {
    setExpandedGrades((prev) => ({ ...prev, [milestoneId]: !prev[milestoneId] }));
  };

  // ─── Grade color helper ────────────────────────────────────────────────────
  // Returns a color on a red→orange→yellow→green gradient based on 0–100 score.
  const gradeColor = (grade: number): string => {
    if (grade >= 90) return '#10B981'; // vivid green
    if (grade >= 80) return '#34D399'; // light green
    if (grade >= 70) return '#FBBF24'; // yellow
    if (grade >= 60) return '#F97316'; // orange
    return '#EF4444';                  // red
  };

  // ─── Grade bar background (muted) ─────────────────────────────────────────
  const gradeTrackColor = (grade: number): string => {
    if (grade >= 90) return '#D1FAE5';
    if (grade >= 80) return '#A7F3D0';
    if (grade >= 70) return '#FEF3C7';
    if (grade >= 60) return '#FFEDD5';
    return '#FEE2E2';
  };
  
  return (
    <View style={styles.container}>

      {/* ── Tab Bar ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
        {([
          { key: 'overview',   labelHe: 'סקירה',    labelEn: 'Overview' },
          { key: 'milestones', labelHe: 'אבני דרך', labelEn: 'Milestones' },
          { key: 'grades',     labelHe: 'ציונים',   labelEn: 'Grades' },
        ] as const).map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]} numberOfLines={1}>
              {lang === 'he' ? tab.labelHe : tab.labelEn}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ══════════════ OVERVIEW TAB ══════════════ */}
        {activeTab === 'overview' && (
          <>
            {/* Project card */}
            <View style={styles.projectCard}>
              <View style={[styles.projectCardHeader, isRtl && styles.rowReverse]}>
                <Text style={styles.projectCardEmoji}>📁</Text>
                <View style={{ flex: 1, marginLeft: isRtl ? 0 : 10, marginRight: isRtl ? 10 : 0 }}>
                  <Text style={[styles.projectTitle, isRtl && styles.textRight]}>
                    {lang === 'he' ? project.titleHe : project.titleEn}
                  </Text>
                  <Text style={[styles.projectMeta, isRtl && styles.textRight]}>
                    👨‍🏫 {project.supervisorName} · {project.academicYear}
                  </Text>
                </View>
              </View>

              {/* Progress bar */}
              <View style={styles.progressSection}>
                <View style={[styles.progressLabelRow, isRtl && styles.rowReverse]}>
                  <Text style={styles.progressLabel}>
                    {lang === 'he' ? 'התקדמות' : 'Progress'}
                  </Text>
                  <Text style={styles.progressPct}>{progress}%</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
                <Text style={[styles.progressSub, !isRtl && styles.textRight]}>
                  {milestones.length} / {milestones.filter((m) => m.status === 'coordinator_approved').length}{' '}
                  {lang === 'he' ? 'אבני דרך הושלמו' : 'milestones completed'}
                </Text>
              </View>
            </View>

            {/* ── Next milestone banner ── */}
            {overviewDisplayMilestone && (
              <View style={styles.nextMilestone}>
                <View style={[styles.nextHeader, isRtl && styles.rowReverse]}>
                  <Text style={styles.nextLabel}>⚡ {tx('nextMilestone', lang)}</Text>

                  {/* Status badge */}
                  {isWaitingApproval ? (
                    <View style={[styles.daysBadge, { backgroundColor: '#FFFBEB', borderColor: '#F59E0B', borderWidth: 1 }]}>
                      <Text style={[styles.daysBadgeText, { color: '#F59E0B' }]}>
                        {lang === 'he' ? '⏳ ממתין לאישור' : '⏳ Waiting for approval'}
                      </Text>
                    </View>
                  ) : (
                    
                    <View style={[styles.daysBadge, styles.daysBadgeBlue]}>
                      <Text style={styles.daysBadgeText}>
                        {daysUntil(
                          overviewDisplayMilestone.type === 'defense'   // ← moved here, now safe
                            ? overviewDisplayMilestone.defenseDate
                            : overviewDisplayMilestone.dueDate
                        )} {tx('daysLeft', lang)}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Milestone title */}
                <Text style={[styles.nextTitle, isRtl && styles.textRight]}>
                  {(() => {
                    // If something is in-review, peek forward to the next pending milestone
                    const nextPending = milestones.find(m => m.status === 'pending');
                    const displayType = nextPending?.type ?? overviewDisplayMilestone.type;
                    return lang === 'he'
                      ? MILESTONE_LABEL[displayType].he
                      : MILESTONE_LABEL[displayType].en;
                  })()}
                </Text>
                {actionableNextMilestone?.type === 'defense' && (() => {
                  const m = actionableNextMilestone;
                  
                  const defenseDate = m.defenseDate
                    ? ((m.defenseDate as any)?.toDate
                        ? (m.defenseDate as any).toDate()
                        : new Date(m.defenseDate))
                    : null;

                  const formattedDate = defenseDate
                    ? defenseDate.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', {
                        day: 'numeric', month: 'long', year: 'numeric',
                      })
                    : (lang === 'he' ? 'טרם נקבע' : 'Not set yet');

                  const notSetYet = lang === 'he' ? 'טרם נקבע' : 'Not set yet';

                  const rows = [
                    {
                      label: lang === 'he' ? 'בוחן 1' : 'Examiner 1',
                      value: m.examinerNames?.[0] ?? (lang === 'he' ? 'טרם שובץ' : 'Not assigned yet'),
                    },
                    {
                      label: lang === 'he' ? 'בוחן 2' : 'Examiner 2',
                      value: m.examinerNames?.[1] ?? (lang === 'he' ? 'טרם שובץ' : 'Not assigned yet'),
                    },
                    {
                      label: lang === 'he' ? 'תאריך' : 'Date',
                      value: formattedDate,
                    },
                    {
                      label: lang === 'he' ? 'שעה' : 'Time',
                      value: m.defenseTime ?? notSetYet,
                    },
                    {
                      label: lang === 'he' ? 'בניין' : 'Building',
                      value: m.defenseBuilding ?? notSetYet,
                    },
                    {
                      label: lang === 'he' ? 'חדר' : 'Room',
                      value: m.defenseRoom ?? notSetYet,
                    },
                  ];

                  return (
                    <View style={{
                      marginTop: 12,
                      backgroundColor: '#F5F3FF',
                      borderRadius: 12,
                      padding: 14,
                      borderLeftWidth: 4,
                      borderLeftColor: '#8B5CF6',
                      gap: 8,
                    }}>
                      <Text style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: '#5B21B6',
                        marginBottom: 4,
                      }}>
                        🎓 {lang === 'he' ? 'פרטי ההגנה' : 'Defense Details'}
                      </Text>

                      {rows.map((row) => (
                        <View key={row.label} style={{
                          flexDirection: isRtl ? 'row-reverse' : 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingVertical: 4,
                          borderBottomWidth: 1,
                          borderBottomColor: '#EDE9FE',
                        }}>
                          <Text style={{
                            fontSize: 13,
                            fontWeight: '600',
                            color: '#7C3AED',
                            textAlign: isRtl ? 'right' : 'left',
                          }}>
                            {row.label}
                          </Text>
                          <Text style={{
                            fontSize: 13,
                            color: '#1F1344',
                            fontWeight: '500',
                            textAlign: isRtl ? 'left' : 'right',
                            flexShrink: 1,
                            marginLeft: isRtl ? 0 : 8,
                            marginRight: isRtl ? 8 : 0,
                          }}>
                            {row.value}
                          </Text>
                        </View>
                      ))}
                    </View>
                  );
                })()}
                {/* ── Submit button ──
                    Enabled ONLY when:
                    • There is an actionable (pending + unlocked) next milestone
                    • AND we are NOT waiting for coordinator approval on any milestone
                */}
                {actionableNextMilestone?.type !== 'defense' && (() => {
                  
                  const canSubmit = !!actionableNextMilestone && !isWaitingApproval;
                  return (
                    <Pressable
                      style={[styles.submitMilestoneBtn, !canSubmit && { opacity: 0.45 }]}
                      disabled={!canSubmit}
                      onPress={() => actionableNextMilestone && openSubmit(actionableNextMilestone)}
                    >
                      <Text style={styles.submitMilestoneBtnText}>
                        {isWaitingApproval
                          ? (lang === 'he' ? 'ממתין לאישור סגל' : 'Awaiting Faculty Approval')
                          : tx('submitMilestone', lang)}
                      </Text>
                    </Pressable>
                  );
                })()}
              </View>
            )}

            {/* Description */}
            <View style={styles.descCard}>
              <Text style={[styles.descTitle, isRtl && styles.textRight]}>
                {lang === 'he' ? 'תיאור הפרויקט' : 'Project Description'}
              </Text>
              <Text style={[styles.descBody, isRtl && styles.textRight]}>
                {lang === 'he' ? project.descriptionHe : project.descriptionEn}
              </Text>
            </View>

            {/* Thesis template — masters-thesis students only */}
            {isMastersThesis && (
              <View style={styles.descCard}>
                <Text style={[styles.descTitle, isRtl && styles.textRight]}>
                  📄 {lang === 'he' ? 'תבנית לתזה' : 'Thesis Template'}
                </Text>
                <Text style={[styles.descBody, isRtl && styles.textRight]}>
                  {lang === 'he'
                    ? 'תבנית ה-Word הרשמית לכתיבת עבודת התזה שלך.'
                    : 'The official Word template for writing your thesis.'}
                </Text>
                <Pressable
                  style={[thesisTemplateStyles.downloadBtn, downloadingTemplate && { opacity: 0.6 }]}
                  onPress={handleDownloadThesisTemplate}
                  disabled={downloadingTemplate}
                >
                  {downloadingTemplate
                    ? <ActivityIndicator color="#fff" size="small" />
                    : (
                      <Text style={thesisTemplateStyles.downloadBtnText}>
                        ⬇ {lang === 'he' ? 'הורדת התבנית' : 'Download Template'}
                      </Text>
                    )}
                </Pressable>
              </View>
            )}
          </>
        )}

        {/* ══════════════ MILESTONES TAB ══════════════ */}
        {activeTab === 'milestones' && (
          <>
            <Text style={[styles.sectionTitle, isRtl && styles.textRight]}>
              {tx('milestonesTitle', lang)}
            </Text>

            {milestones.map((m, index) => {
              const unlocked  = isUnlocked(m);
              const cfg       = STATUS_CONFIG[m.status as MilestoneStatus] ??
              { color: '#8899BB', bg: '#F0F4FF', icon: '🕐' }
              const days      = daysUntil(m.dueDate);
              const label     = lang === 'he' ? MILESTONE_LABEL[m.type].he : MILESTONE_LABEL[m.type].en;
              const isDefense = m.type === 'defense';

              // ── Per-milestone display logic ──────────────────────────────
              // submitted / supervisor_graded  → show "submitted" text, disable button
              // coordinator_approved / completed → show ✅ green check
              const normalizedStatus = (m.status ?? '').trim().toLowerCase();
              const isSubmittedInReview =
                normalizedStatus === 'submitted' ||
                normalizedStatus === 'supervisor_graded' ||
                normalizedStatus === 'graded';          

              const isApprovedOrDone =
                normalizedStatus === 'coordinator_approved' ||
                normalizedStatus === 'completed';
              
              return (
                <View key={m.id} style={styles.milestoneCard}>
                  {/* Timeline dot + connector */}
                  <View style={styles.timelineCol}>
                    <View style={[styles.timelineDot, { backgroundColor: isApprovedOrDone ? '#10B981' : cfg.color }]}>
                      {isApprovedOrDone
                        ? <Text style={styles.timelineNum}>✓</Text>
                        : <Text style={styles.timelineNum}>{index + 1}</Text>
                      }
                    </View>
                    {index < milestones.length - 1 && (
                      <View style={[
                        styles.timelineLine,
                        isApprovedOrDone && styles.timelineLineDone,
                      ]} />
                    )}
                  </View>

                  {/* Content */}
                  <View style={[styles.milestoneContent, isRtl && styles.milestoneContentRtl]}>
                    {/* Header */}
                    <View style={[styles.milestoneHeader, isRtl && styles.rowReverse]}>
                      <Text style={styles.milestoneTitle}>{label}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: isApprovedOrDone ? '#ECFDF5' : cfg.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: isApprovedOrDone ? '#10B981' : cfg.color }]}>
                          {isApprovedOrDone ? '✅' : cfg.icon}{' '}
                          {lang === 'he'
                            ? ({
                                pending:              'ממתין',
                                submitted:            'הוגש',
                                supervisor_graded:    'נוקד ע"י מנחה',
                                graded:               'נוקד ע"י מנחה',
                                examiners_assigned:   'נבחרו בוחנים',
                                examiner_graded:      'נוקד ע"י בוחן',
                                both_examiners_graded:'שני בוחנים ניקדו',
                                awaiting_defense_date:'ממתין לתאריך הגנה',
                                date_conflict:        'לא נמצא תאריך משותף',
                                defense_date_set:      'תאריך הגנה נקבע',
                                scheduled:            'הגנה נקבעה',
                                coordinator_approved: 'אושר ע"י רכז',
                                completed:            'הושלם',
                              }[m.status])
                            : ({
                                pending:              'Pending',
                                submitted:            'Submitted',
                                supervisor_graded:    'Supervisor Graded',
                                graded:               'Supervisor Graded',
                                examiners_assigned:   'Examiners Assigned',
                                examiner_graded:      'Examiner Graded',
                                both_examiners_graded:'Both Examiners Graded',
                                awaiting_defense_date:'Awaiting Defense Date',
                                date_conflict:        'No Common Date',
                                defense_date_set:      'Defense Date Set',
                                scheduled:            'Defense Scheduled',
                                coordinator_approved: 'Coordinator Approved',
                                completed:            'Completed',
                              }[m.status])
                          }
                        </Text>
                      </View>
                    </View>

                    {/* ── Due date / Submitted / Approved display ── */}
                    {!unlocked ? (
                      <Text style={[styles.notScheduled, isRtl && styles.textRight]}>
                        🔒{' '}
                        {lang === 'he'
                          ? 'יש להשלים אבני דרך קודמות'
                          : 'Need to complete previous milestones'}
                      </Text>
                    ) : isApprovedOrDone ? (
                      // Green check + approved label replaces the due date row
                      <Text style={[{ fontSize: 13, color: '#10B981', fontWeight: '600', marginTop: 4 }, isRtl && styles.textRight]}>
                        ✅ {lang === 'he' ? 'אושר ע"י הרכז' : 'Approved by coordinator'}
                        {m.finalGrade !== null && (
                          <Text style={{ color: '#059669' }}> · {tx('grade', lang)}: {m.finalGrade}</Text>
                        )}
                      </Text>
                    ) : isSubmittedInReview ? (
                      // "Submitted" replaces the due date
                      <Text style={[{ fontSize: 13, color: '#F59E0B', fontWeight: '600', marginTop: 4 }, isRtl && styles.textRight]}>
                        📤 {lang === 'he' ? 'הוגש — ממתין לאישור' : 'Submitted — awaiting approval'}
                      </Text>
                    ) : (
                      // Normal due date row (pending + unlocked)
                      <Text style={[styles.milestoneDue, isRtl && styles.textRight]}>
                        📅 {tx('dueDate', lang)}{' '}
                        {toDate(m.dueDate)?.toLocaleDateString(
                          lang === 'he' ? 'he-IL' : 'en-US',
                          { day: 'numeric', month: 'short', year: 'numeric' }
                        )}
                        {days !== null && m.status === 'pending' && unlocked && (
                          <Text style={[
                            styles.daysTag,
                            days < 0  ? { color: '#D32F2F' }
                            : days <= 7 ? { color: '#F59E0B' }
                            : { color: '#10B981' },
                          ]}>
                            {' '}({days < 0
                              ? `${Math.abs(days)} ${lang === 'he' ? 'ימי איחור' : 'days overdue'}`
                              : `${days} ${tx('daysLeft', lang)}`
                            })
                          </Text>
                        )}
                      </Text>
                    )}

                    {/* Defense info */}
                    {isDefense && m.defenseDate && (
                      <View style={styles.defenseInfo}>
                        <Text style={[styles.defenseRow, isRtl && styles.textRight]}>
                          📅 {tx('defenseDate', lang)}{' '}
                          {toDate(m.defenseDate)?.toLocaleDateString(
                            lang === 'he' ? 'he-IL' : 'en-US',
                            { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
                          )}
                        </Text>
                        {m.defenseRoom && (
                          <Text style={[styles.defenseRow, isRtl && styles.textRight]}>
                            🏫 {tx('defenseRoom', lang)} {m.defenseRoom}
                          </Text>
                        )}
                        {m.examinerNames?.length > 0 && (
                          <Text style={[styles.defenseRow, isRtl && styles.textRight]}>
                            👥 {tx('examiners', lang)} {m.examinerNames.join(', ')}
                          </Text>
                        )}
                      </View>
                    )}

                    {isDefense && !m.defenseDate && (
                      <Text style={[styles.notScheduled, isRtl && styles.textRight]}>
                        {tx('defenseNotScheduled', lang)}
                      </Text>
                    )}

                    {/* ── Submit button ──
                        Show ONLY when:
                        • status is 'pending'
                        • not the defense milestone
                        • milestone is unlocked (previous was coordinator_approved/completed)
                    */}
                    {m.status === 'pending' && !isDefense && unlocked && !m.defenseDate && (
                      <Pressable
                        style={styles.milestoneSubmitBtn}
                        onPress={() => openSubmit(m)}
                      >
                        <Text style={styles.milestoneSubmitBtnText}>
                          {tx('submitMilestone', lang)}
                        </Text>
                      </Pressable>
                    )}

                    {/* Submitted files count */}
                    {m.fileUrls?.length > 0 && (
                      <View style={styles.filesRow}>
                        <Text style={styles.filesLabel}>
                          📎 {m.fileUrls.length} {lang === 'he' ? 'קבצים הוגשו' : 'files submitted'}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ══════════════ GRADES TAB ══════════════ */}
        {activeTab === 'grades' && (
          <>
            <Text style={[styles.sectionTitle, !isRtl && styles.textRight]}>
              {lang === 'he' ? 'ציונים ומשקלים' : 'Grades & Weights'}
            </Text>
        
            {milestones.map((m) => {
              const label = lang === 'he'
                ? MILESTONE_LABEL[m.type].he
                : MILESTONE_LABEL[m.type].en;
        
              const normalizedStatus = (m.status ?? '').trim().toLowerCase();
              const grade   = m.finalGrade ?? m.supervisorScore ?? null;
              const hasGrade = typeof grade === 'number' && !isNaN(grade);
        
              const isSubmittedState = !hasGrade && (
                normalizedStatus === 'submitted' ||
                normalizedStatus === 'supervisor_graded' ||
                normalizedStatus === 'graded'
              );
        
              const isGradeVisible =
                normalizedStatus === 'coordinator_approved' ||
                normalizedStatus === 'completed';
        
              const gradeVisible = isGradeVisible && hasGrade;
        
              const barColor   = hasGrade ? gradeColor(grade)      : '#E0E8FF';
              const trackColor = hasGrade ? gradeTrackColor(grade) : '#F0F4FF';
              const barFlex    = hasGrade ? (grade / 100) : 0;
        
              // Expandable state for this card
              const isExpanded     = expandedGrades[m.id] ?? false;
              const isLoadingDetail = loadingDetail[m.id] ?? false;
              const detail         = gradeDetails[m.id];
        
              return (
                <Pressable
                  key={m.id}
                  style={styles.gradeCard}
                  // Only tappable when the grade is visible to the student
                  onPress={gradeVisible ? () => handleExpandGrade(m.id) : undefined}
                  disabled={!gradeVisible}
                >
                  {/* ── Card header ── */}
                  <View style={[styles.gradeCardHeader, !isRtl && styles.rowReverse]}>
                    <Text style={styles.gradeCardTitle}>{label}</Text>
        
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {gradeVisible ? (
                        <>
                          <View style={[styles.gradePill, { backgroundColor: gradeTrackColor(grade!) }]}>
                            <Text style={[styles.gradePillText, { color: gradeColor(grade!) }]}>
                              {grade}
                            </Text>
                          </View>
                          {/* Expand / collapse chevron */}
                          <Text style={{ fontSize: 14, color: '#8899BB' }}>
                            {isExpanded ? '▲' : '▼'}
                          </Text>
                        </>
                      ) : isSubmittedState ? (
                        <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: '600' }}>
                          📤 {lang === 'he' ? 'הוגש' : 'Submitted'}
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 12, color: '#8899BB' }}>
                          📭 {lang === 'he' ? 'טרם הוגש' : 'Not submitted yet'}
                        </Text>
                      )}
                    </View>
                  </View>
        
                  {/* ── Grade bar ── */}
                  {hasGrade ? (
                    <View style={{ marginTop: 8 }}>
                      <View style={[styles.gradeProgress, { backgroundColor: trackColor, flexDirection: 'row' }]}>
                        <View style={[
                          styles.gradeProgressFill,
                          { flexGrow: barFlex, backgroundColor: barColor, width: undefined },
                        ]} />
                        {barFlex < 1 && <View style={{ flexGrow: 1 - barFlex }} />}
                      </View>
                      <View style={[
                        { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
                        isRtl && styles.rowReverse,
                      ]}>
                        <Text style={{ fontSize: 11, color: '#8899BB' }}>{!isRtl ? '0' : '100'}</Text>
                        <Text style={{ fontSize: 11, color: '#8899BB' }}>{!isRtl ? '100' : '0'}</Text>
                      </View>
                    </View>
                  ) : isSubmittedState ? (
                    <View style={{ marginTop: 8 }}>
                      <View style={[styles.gradeProgress, { backgroundColor: '#FEF3C7', flexDirection: 'row' }]}>
                        <View style={{ flexGrow: 1, backgroundColor: '#FDE68A', borderRadius: 6, opacity: 0.6 }} />
                      </View>
                      <Text style={[{ fontSize: 11, color: '#F59E0B', marginTop: 4 }, isRtl && styles.textRight]}>
                        {lang === 'he' ? '⏳ ממתין לאישור ציון ע"י הרכז' : '⏳ Awaiting grade approval by coordinator'}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.gradeProgress, { marginTop: 8, flexDirection: 'row' }]}>
                      <View style={{ flexGrow: 1, backgroundColor: 'transparent' }} />
                    </View>
                  )}
        
                  {/* ── Expanded criteria breakdown ── */}
                  {gradeVisible && isExpanded && (
                    <View style={breakdownStyles.container}>
                      {isLoadingDetail ? (
                        <ActivityIndicator size="small" color="#2E86FF" style={{ marginVertical: 12 }} />
                      ) : detail?.hasGrade ? (
                        <>
                          {/* Criteria rows */}
                          {detail.breakdown?.map((b: any) => (
                            <View key={b.key} style={breakdownStyles.row}>
                              <Text style={[breakdownStyles.criterionLabel, isRtl && styles.textRight]} numberOfLines={1}>
                                {b.label}
                              </Text>
                              <View style={breakdownStyles.scoreRow}>
                                {/* Mini progress bar */}
                                <View style={breakdownStyles.miniTrack}>
                                  <View style={[
                                    breakdownStyles.miniFill,
                                    {
                                      flexGrow: b.score !== null ? (b.score / b.maxScore) : 0,
                                      backgroundColor: b.score !== null
                                        ? gradeColor(Math.round((b.score / b.maxScore) * 100))
                                        : '#E0E8FF',
                                    },
                                  ]} />
                                  <View style={{ flexGrow: b.score !== null ? 1 - (b.score / b.maxScore) : 1 }} />
                                </View>
                                {/* Score text */}
                                <Text style={breakdownStyles.scoreText}>
                                  {b.score ?? '—'} / {b.maxScore}
                                </Text>
                              </View>
                            </View>
                          ))}
        
                          {/* Divider */}
                          <View style={breakdownStyles.divider} />
        
                          {/* Total */}
                          <View style={[breakdownStyles.row, { marginTop: 4 }]}>
                            <Text style={[breakdownStyles.criterionLabel, { fontWeight: '800', color: '#111' }]}>
                              {lang === 'he' ? 'סה"כ' : 'Total'}
                            </Text>
                            <Text style={[breakdownStyles.scoreText, { fontWeight: '800', color: gradeColor(detail.total ?? 0) }]}>
                              {detail.total ?? '—'} / 100
                            </Text>
                          </View>
        
                          {/* Comments */}
                          {detail.comments ? (
                            <View style={breakdownStyles.commentsBox}>
                              <Text style={[breakdownStyles.commentsLabel, isRtl && styles.textRight]}>
                                💬 {lang === 'he' ? 'הערות המנחה' : 'Supervisor Comments'}
                              </Text>
                              <Text style={[breakdownStyles.commentsText, isRtl && styles.textRight]}>
                                {detail.comments}
                              </Text>
                            </View>
                          ) : null}
                        </>
                      ) : (
                        <Text style={{ fontSize: 13, color: '#8899BB', textAlign: 'center', paddingVertical: 8 }}>
                          {lang === 'he' ? 'לא נמצאו פרטי ציון' : 'Grade details not available'}
                        </Text>
                      )}
                    </View>
                  )}
                </Pressable>
              );
            })}
        
            {/* Final grade card */}
            {milestones.every((m) => m.finalGrade !== null) && milestones.length > 0 && (
              <View style={styles.finalGradeCard}>
                <Text style={styles.finalGradeLabel}>{tx('finalGrade', lang)}</Text>
                <Text style={styles.finalGradeValue}>
                  {Math.round(
                    milestones.reduce((sum, m) => sum + (m.finalGrade ?? 0), 0) / milestones.length
                  )}
                </Text>
                <Text style={styles.finalGradeNote}>
                  {lang === 'he'
                    ? '* הציון מחושב לפי המשקלים שנקבעו על ידי רכז הפרויקטים'
                    : '* Grade calculated using weights set by the project coordinator'}
                </Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Submit Milestone Modal ── */}
      <Modal visible={submitModal} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
          <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
            <Text style={styles.modalTitle}>
              {tx('submitTitle', lang)}{' '}
              {targetMilestone
                ? (lang === 'he'
                    ? MILESTONE_LABEL[targetMilestone.type].he
                    : MILESTONE_LABEL[targetMilestone.type].en)
                : ''}
            </Text>
            <Pressable onPress={() => { setSubmitModal(false); setFiles([]); setNote(''); }}>
              <Text style={styles.modalClose}>✕</Text>
            </Pressable>
          </View>

          {/* Files */}
          <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
            {tx('uploadFiles', lang)}
          </Text>
          {files.map((f, i) => (
            <View key={i} style={styles.fileRow}>
              <Text style={styles.fileName}>📎 {f.name}</Text>
              <Pressable onPress={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                <Text style={styles.fileRemove}>✕</Text>
              </Pressable>
            </View>
          ))}
          <Pressable style={styles.uploadBtn} onPress={pickFile}>
            <Text style={styles.uploadBtnText}>
              + {lang === 'he' ? 'הוסף קובץ' : 'Add File'}
            </Text>
          </Pressable>

          {/* Note */}
          <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
            {tx('addNote', lang)}
          </Text>
          <TextInput
            style={[styles.textarea, isRtl && styles.textRight]}
            multiline
            numberOfLines={4}
            placeholder={tx('notePlaceholder', lang)}
            placeholderTextColor="#9BA8C0"
            value={note}
            onChangeText={setNote}
            textAlign={isRtl ? 'right' : 'left'}
          />

          {submitMessage && (
            <Text style={[
              styles.submitMsg,
              submitMessage.includes('✅') ? styles.submitMsgOk : styles.submitMsgErr,
            ]}>
              {submitMessage}
            </Text>
          )}

          <Pressable
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>{tx('submit', lang)}</Text>
            }
          </Pressable>
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = ActivateDashboardStyles;

const thesisTemplateStyles = ThesisTemplateCardStyles;

const breakdownStyles = GradeBreakdownStyles;