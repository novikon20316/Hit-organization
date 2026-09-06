// student/screens/ActiveDashboard.tsx
import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Linking, StyleSheet,
} from 'react-native';
import { tx, type Lang } from '../../components/i18n';
import type { ActiveProject, Milestone, MilestoneType } from '@/types';
import {
  ActivateDashboardStyles, GradeBreakdownStyles,
  studentPalette, studentSpacing, studentRadius, studentCardStyles,
} from '@/constants';
import { apiClient } from '../../src/api/apiClient';
import SubmitMilestoneModal from '../../components/modals/SubmitMilestoneModal';
import ResearchProposalFormModal from '../../components/modals/ResearchProposalFormModal';
import ProgressReportFormModal from '../../components/modals/ProgressReportFormModal';

interface Props {
  project:       ActiveProject;
  milestones:    Milestone[];
  nextMilestone: Milestone | null;
  progress:      number;
  lang:          Lang;
  isRtl:         boolean;
}



// ─── Milestone type labels ─────────────────────────────────────────────────────
// Record<string, ...> rather than Record<MilestoneType, ...> — faculty admins
// can add custom milestones via the Workflow Template Manager, which land
// here with a type like `custom_xxxxx` (see server/src/services/
// projectEnrollment.ts), a value MilestoneType's 4-literal union doesn't
// actually cover despite the type declaration. Every lookup below falls back
// to the raw type string so an unrecognized custom type still displays
// something instead of crashing (matches coordinator/home.tsx's MILESTONE_LABEL).
const MILESTONE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר',    en: 'Research Proposal' },
  progress_report:   { he: 'דו"ח התקדמות', en: 'Progress Report' },
  final_report:      { he: 'דו"ח מסכם',    en: 'Final Report' },
  defense:           { he: 'הגנה',          en: 'Defense' },
  poster:            { he: 'פוסטר',        en: 'Poster Session' },
};

// Legacy fallback — the milestone TYPE ordering every faculty used before a
// milestone doc carried its own `order` (see server/src/services/
// projectEnrollment.ts). Mirrors the server's own resolveMilestoneOrder
// (workflowTemplates.ts) — only ever consulted for a milestone doc that
// predates that field; a faculty's template can define its milestones in any
// order (including custom_xxxxx types this list has never heard of), so an
// unrecognized type sorts LAST here, never first.
const LEGACY_MILESTONE_TYPE_ORDER: MilestoneType[] = [
  'research_proposal',
  'progress_report',
  'final_report',
  'defense',
  'poster',
];
function resolveMilestoneOrder(m: { type?: string; order?: number }): number {
  if (typeof m.order === 'number') return m.order;
  const idx = m.type ? LEGACY_MILESTONE_TYPE_ORDER.indexOf(m.type as MilestoneType) : -1;
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

export default function ActiveDashboard({
  project, milestones, nextMilestone, progress, lang, isRtl,
}: Props) {
  const [activeTab,       setActiveTab]       = useState<'overview' | 'grades'>('overview');
  const [expandedGrades,   setExpandedGrades]   = useState<Record<string, boolean>>({});
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [announcements, setAnnouncements] = useState<Array<{ id: string; titleHe: string; titleEn: string; bodyHe: string; bodyEn: string; createdAt?: string | null }>>([]);
  // The single milestone currently targeted by the shared submit modal — null
  // when the modal is closed. Replaces the old inline submitModal/
  // targetMilestone/note/files/submitting state, all of which now live inside
  // components/modals/SubmitMilestoneModal.tsx.
  const [submitTarget, setSubmitTarget] = useState<Milestone | null>(null);

  // Running faculty/college announcements (requirements doc section 15) —
  // shown here too, not just the ineligible-state student/info.tsx screen,
  // so already-enrolled students also see them.
  useEffect(() => {
    let cancelled = false;
    apiClient.get('/api/faculty-content')
      .then((res) => {
        if (!cancelled) setAnnouncements((res.data.items ?? []).filter((c: any) => c.type === 'announcement'));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const dismissAnnouncement = (id: string) => {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    apiClient.post(`/api/faculty-content/${id}/dismiss`).catch(() => {});
  };

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
    const order = resolveMilestoneOrder(m);
    return milestones
      .filter(prev => resolveMilestoneOrder(prev) < order)
      .every(prev => prev.status === 'coordinator_approved' || prev.status === 'completed');
  };

  // ─── The "true" next actionable milestone for the Overview tab ────────────
  // This is the first milestone that is still 'pending' AND unlocked.
  // After coordinator_approved the next pending one becomes unlocked.
  const actionableNextMilestone: Milestone | null =
    milestones.find(m => m.status === 'pending' && isUnlocked(m)) ?? null;

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

  const openSubmit = (m: Milestone) => setSubmitTarget(m);

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

  // ─── Overview metrics — reused, not recomputed, elsewhere ─────────────────
  // Same "coordinator_approved" filter useStudentData.ts's withDerived() used
  // to produce the `progress` prop — kept as its own count here too since the
  // metric card needs the raw X/Y, not just the rounded percentage.
  const completedMilestonesCount = milestones.filter(m => m.status === 'coordinator_approved').length;
  const totalMilestonesCount = milestones.length;

  // ─── Next deadline card — sourced straight from the `nextMilestone` prop ──
  const nextDeadlineDate = nextMilestone ? toDate(nextMilestone.dueDate) : null;
  const nextDeadlineDays = nextMilestone ? daysUntil(nextMilestone.dueDate) : null;
  const nextMilestoneLabel = nextMilestone
    ? (lang === 'he' ? (MILESTONE_LABEL[nextMilestone.type]?.he ?? nextMilestone.type)
                      : (MILESTONE_LABEL[nextMilestone.type]?.en ?? nextMilestone.type))
    : '';

  // ─── Recent Activity — derived from real data already loaded on this
  // screen (announcements + milestone status fields), never fabricated. Each
  // milestone contributes at most one entry, picking whichever of these is
  // most relevant to its current state (rejection reason > coordinator
  // comment > a plain "submitted" event) — items with no usable date are
  // dropped rather than guessed at.
  const timeAgo = (date: Date): string => {
    const diffMs = Date.now() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) {
      const diffHours = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60)));
      return lang === 'he' ? `לפני ${diffHours} שעות` : `${diffHours}h ago`;
    }
    if (diffDays === 1) return lang === 'he' ? 'אתמול' : 'Yesterday';
    if (diffDays < 30) return lang === 'he' ? `לפני ${diffDays} ימים` : `${diffDays}d ago`;
    return date.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short' });
  };

  type ActivityItem = { id: string; icon: string; title: string; subtitle: string; date: Date };
  const activityCandidates: Array<{ id: string; icon: string; title: string; subtitle: string; date: Date | null }> = [];

  announcements.forEach((a) => {
    activityCandidates.push({
      id: `ann-${a.id}`,
      icon: '📣',
      title: lang === 'he' ? (a.titleHe || a.titleEn) : (a.titleEn || a.titleHe),
      subtitle: lang === 'he' ? (a.bodyHe || a.bodyEn) : (a.bodyEn || a.bodyHe),
      date: toDate(a.createdAt),
    });
  });

  milestones.forEach((m) => {
    const normalizedStatus = (m.status ?? '').trim().toLowerCase();
    const label = lang === 'he' ? (MILESTONE_LABEL[m.type]?.he ?? m.type) : (MILESTONE_LABEL[m.type]?.en ?? m.type);

    if (normalizedStatus === 'rejected' && m.rejectionReason) {
      activityCandidates.push({
        id: `rej-${m.id}`,
        icon: '↩',
        title: lang === 'he' ? `הוחזר לתיקון: ${label}` : `Returned for revision: ${label}`,
        subtitle: m.rejectionReason,
        date: toDate(m.submittedAt),
      });
    } else if ((normalizedStatus === 'coordinator_approved' || normalizedStatus === 'completed') && m.coordinatorComment) {
      activityCandidates.push({
        id: `appr-${m.id}`,
        icon: '✅',
        title: lang === 'he' ? `אושר ע"י הרכז: ${label}` : `Approved by coordinator: ${label}`,
        subtitle: m.coordinatorComment,
        date: toDate(m.submittedAt),
      });
    } else if (m.submittedAt && ['submitted', 'supervisor_graded', 'graded', 'examiners_assigned', 'examiner_graded', 'both_examiners_graded'].includes(normalizedStatus)) {
      activityCandidates.push({
        id: `sub-${m.id}`,
        icon: '📤',
        title: lang === 'he' ? `הוגש: ${label}` : `Submitted: ${label}`,
        subtitle: lang === 'he' ? 'ממתין לבדיקה' : 'Awaiting review',
        date: toDate(m.submittedAt),
      });
    }
  });

  const recentActivity: Array<ActivityItem & { timeLabel: string }> = activityCandidates
    .filter((it): it is ActivityItem => it.date !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 5)
    .map((it) => ({ ...it, timeLabel: timeAgo(it.date) }));

  return (
    <View style={[styles.container, ov.screenBg]}>

      {/* ── Tab Bar ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
        {([
          { key: 'overview', labelHe: 'סקירה',  labelEn: 'Overview' },
          { key: 'grades',    labelHe: 'ציונים', labelEn: 'Grades' },
        ] as const).map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && ov.tabActive]}
            onPress={() => setActiveTab(tab.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: activeTab === tab.key }}
          >
            <Text style={[styles.tabText, activeTab === tab.key && ov.tabTextActive]} numberOfLines={1}>
              {lang === 'he' ? tab.labelHe : tab.labelEn}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ══════════════ OVERVIEW TAB ══════════════ */}
        {activeTab === 'overview' && (
          <>
            {announcements.map((a) => (
              <View key={a.id} style={{
                backgroundColor: '#FFFBEB', borderRadius: 16, padding: 16,
                borderWidth: 1, borderColor: '#FDE68A', marginBottom: 12,
              }}>
                <Pressable
                  onPress={() => dismissAnnouncement(a.id)}
                  accessibilityRole="button"
                  accessibilityLabel={lang === 'he' ? 'סגור הודעה' : 'Dismiss announcement'}
                  style={{ position: 'absolute', top: 10, [isRtl ? 'left' : 'right']: 10, padding: 4 }}
                >
                  <Text style={{ fontSize: 14, color: '#92400E' }}>✕</Text>
                </Pressable>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#92400E', marginBottom: 4, paddingEnd: 20, textAlign: isRtl ? 'right' : 'left' }}>
                  📣 {lang === 'he' ? (a.titleHe || a.titleEn) : (a.titleEn || a.titleHe)}
                </Text>
                <Text style={{ fontSize: 13, color: '#78350F', lineHeight: 19, textAlign: isRtl ? 'right' : 'left' }}>
                  {lang === 'he' ? (a.bodyHe || a.bodyEn) : (a.bodyEn || a.bodyHe)}
                </Text>
              </View>
            ))}

            {/* Header */}
            <View style={ov.header}>
              <Text style={[ov.welcomeTitle, isRtl && styles.textRight]}>
                {lang === 'he' ? 'ברוך שובך 👋' : 'Welcome back 👋'}
              </Text>
              <Text style={[ov.welcomeSubtitle, isRtl && styles.textRight]} numberOfLines={1}>
                {lang === 'he' ? project.titleHe : project.titleEn}
              </Text>
            </View>

            {/* Metric cards */}
            <View style={[ov.metricsRow, isRtl && styles.rowReverse]}>
              <View style={ov.metricCard}>
                <View style={[ov.metricHeader, isRtl && styles.rowReverse]}>
                  <Text style={ov.metricLabel}>{lang === 'he' ? 'ציון סופי' : 'FINAL GRADE'}</Text>
                  <Text style={ov.metricIcon}>📊</Text>
                </View>
                <Text style={ov.metricValue}>
                  {project.overallFinalGrade != null ? String(project.overallFinalGrade) : '—'}
                </Text>
              </View>

              <View style={ov.metricCard}>
                <View style={[ov.metricHeader, isRtl && styles.rowReverse]}>
                  <Text style={ov.metricLabel}>{lang === 'he' ? 'אבני דרך' : 'MILESTONES'}</Text>
                  <Text style={ov.metricIcon}>🎯</Text>
                </View>
                <View style={[ov.metricValueRow, isRtl && styles.rowReverse]}>
                  <Text style={ov.metricValue}>{completedMilestonesCount}</Text>
                  <Text style={ov.metricValueSub}> / {totalMilestonesCount}</Text>
                </View>
              </View>
            </View>

            {/* Next deadline card */}
            {nextMilestone && (
              <View style={ov.deadlineCard}>
                <View style={[ov.deadlineHeader, isRtl && styles.rowReverse]}>
                  <Text style={ov.metricLabel}>{lang === 'he' ? 'המועד הקרוב' : 'NEXT DEADLINE'}</Text>
                  <Text style={ov.metricIcon}>⏰</Text>
                </View>
                <View style={[ov.deadlineBody, isRtl && styles.rowReverse]}>
                  {nextDeadlineDays !== null && (
                    <View style={ov.deadlineChip}>
                      <Text style={ov.deadlineChipNum}>
                        {nextDeadlineDays < 0 ? Math.abs(nextDeadlineDays) : nextDeadlineDays}
                      </Text>
                      <Text style={ov.deadlineChipLabel}>
                        {nextDeadlineDays < 0
                          ? (lang === 'he' ? 'איחור' : 'LATE')
                          : (lang === 'he' ? 'ימים' : 'DAYS')}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[ov.deadlineTitle, isRtl && styles.textRight]} numberOfLines={1}>
                      {nextMilestoneLabel}
                    </Text>
                    <Text style={[ov.deadlineSub, isRtl && styles.textRight]}>
                      {tx('dueDate', lang)}{' '}
                      {nextDeadlineDate?.toLocaleDateString(
                        lang === 'he' ? 'he-IL' : 'en-US',
                        { day: 'numeric', month: 'short', year: 'numeric' }
                      ) ?? '—'}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Quick Actions */}
            <View style={ov.section}>
              <Text style={[ov.sectionHeading, isRtl && styles.textRight]}>
                {lang === 'he' ? 'פעולות מהירות' : 'Quick Actions'}
              </Text>
              <View style={[ov.quickActionsRow, isRtl && styles.rowReverse]}>
                {actionableNextMilestone && (
                  <Pressable style={ov.primaryActionBtn} onPress={() => openSubmit(actionableNextMilestone)} accessibilityRole="button">
                    <Text style={ov.primaryActionBtnText}>📤 {tx('submitMilestone', lang)}</Text>
                  </Pressable>
                )}
                {isMastersThesis && (
                  <Pressable
                    style={[ov.secondaryActionBtn, downloadingTemplate && { opacity: 0.6 }]}
                    onPress={handleDownloadThesisTemplate}
                    disabled={downloadingTemplate}
                    accessibilityRole="button"
                  >
                    {downloadingTemplate
                      ? <ActivityIndicator color={studentPalette.secondary} size="small" />
                      : (
                        <Text style={ov.secondaryActionBtnText}>
                          ⬇ {lang === 'he' ? 'תבנית תזה' : 'Thesis Template'}
                        </Text>
                      )}
                  </Pressable>
                )}
              </View>
            </View>

            {/* Recent Activity */}
            <View style={ov.section}>
              <Text style={[ov.sectionHeading, isRtl && styles.textRight]}>
                {lang === 'he' ? 'פעילות אחרונה' : 'Recent Activity'}
              </Text>
              {recentActivity.length === 0 ? (
                <View style={ov.activityEmpty}>
                  <Text style={ov.activityEmptyText}>
                    {lang === 'he' ? 'אין פעילות אחרונה להצגה' : 'No recent activity yet'}
                  </Text>
                </View>
              ) : (
                <View style={ov.activityList}>
                  {recentActivity.map((item, idx) => (
                    <View
                      key={item.id}
                      style={[
                        ov.activityRow,
                        idx < recentActivity.length - 1 && ov.activityRowDivider,
                        isRtl && styles.rowReverse,
                      ]}
                    >
                      <View style={ov.activityIconWrap}>
                        <Text style={ov.activityIconText}>{item.icon}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={[ov.activityTopRow, isRtl && styles.rowReverse]}>
                          <Text style={[ov.activityTitle, isRtl && styles.textRight]} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={ov.activityTime}>{item.timeLabel}</Text>
                        </View>
                        <Text style={[ov.activitySubtitle, isRtl && styles.textRight]} numberOfLines={2}>
                          {item.subtitle}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Description */}
            <View style={ov.descCard}>
              <Text style={[ov.descTitle, isRtl && styles.textRight]}>
                {lang === 'he' ? 'תיאור הפרויקט' : 'Project Description'}
              </Text>
              <Text style={[ov.descBody, isRtl && styles.textRight]}>
                {lang === 'he' ? project.descriptionHe : project.descriptionEn}
              </Text>
            </View>
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
                ? (MILESTONE_LABEL[m.type]?.he ?? m.type)
                : (MILESTONE_LABEL[m.type]?.en ?? m.type);

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
              // Derived directly from the already-fetched milestone (no
              // separate fetch — the three-rubric workflow's fields are
              // undefined/absent for any milestone/faculty that hasn't
              // configured finalGradeComponents, so this is a no-op
              // everywhere except data_science).
              const supervisorComponents = m.finalGradeComponents?.supervisorEvaluation.components ?? [];
              const detail = m.supervisorEvaluation
                ? {
                    hasGrade: true,
                    breakdown: supervisorComponents
                      .filter((c) => m.supervisorEvaluation!.scores[c.key])
                      .map((c) => ({
                        key: c.key,
                        label: lang === 'he' ? c.labelHe : c.labelEn,
                        score: m.supervisorEvaluation!.scores[c.key].score,
                        maxScore: m.supervisorEvaluation!.scores[c.key].maxScore,
                      })),
                    total: m.supervisorEvaluation.total,
                    comments: m.supervisorEvaluation.comment,
                  }
                : undefined;
              const hasExpandableDetail = !!(detail || m.staffRecord || m.autoCalculatedFinalGrade != null || m.gradeOverride || (m as any).committeeReviewHistory?.length);
              const canExpand = gradeVisible && hasExpandableDetail;

              return (
                <Pressable
                  key={m.id}
                  style={styles.gradeCard}
                  // Only tappable when the grade is visible AND there's
                  // actually something new to show underneath it.
                  onPress={canExpand ? () => handleExpandGrade(m.id) : undefined}
                  disabled={!canExpand}
                  accessibilityRole={canExpand ? 'button' : undefined}
                  accessibilityState={canExpand ? { expanded: isExpanded } : undefined}
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
                          {/* Expand / collapse chevron — only when there's detail to show */}
                          {canExpand && (
                            <Text style={{ fontSize: 14, color: '#8899BB' }}>
                              {isExpanded ? '▲' : '▼'}
                            </Text>
                          )}
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
                  {canExpand && isExpanded && (
                    <View style={breakdownStyles.container}>
                      {detail?.hasGrade && (
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
                      )}

                      {/* Computed grade + pending sign-off, and the staff
                          record (proposal/midterm) — same data_science-only
                          fields, absent everywhere else. */}
                      {m.autoCalculatedFinalGrade != null && (
                        <View style={[breakdownStyles.row, { marginTop: detail?.hasGrade ? 8 : 0 }]}>
                          <Text style={[breakdownStyles.criterionLabel, isRtl && styles.textRight]}>
                            {lang === 'he' ? 'ציון מחושב' : 'Computed grade'}
                          </Text>
                          <Text style={breakdownStyles.scoreText}>{m.autoCalculatedFinalGrade}</Text>
                        </View>
                      )}
                      {m.gradeOverride?.status === 'pending' && (
                        <Text style={{ fontSize: 11, color: '#F59E0B', marginTop: 4 }}>
                          ⏳ {lang === 'he' ? 'ממתין לאישור סופי' : 'Awaiting final sign-off'}
                        </Text>
                      )}

                      {m.staffRecord && (
                        <View style={{ marginTop: 8 }}>
                          <Text style={[breakdownStyles.commentsLabel, isRtl && styles.textRight]}>
                            {lang === 'he' ? 'רשומת מנחה' : "Supervisor's record"}
                          </Text>
                          {m.staffRecord.mode === 'upload' ? (
                            (m.staffRecord.fileUrls ?? []).map((url, i) => (
                              <Text
                                key={url}
                                style={{ fontSize: 12, color: '#2E86FF', marginTop: 4 }}
                                onPress={() => Linking.openURL(url)}
                              >
                                📎 {lang === 'he' ? `קובץ ${i + 1}` : `File ${i + 1}`}
                              </Text>
                            ))
                          ) : (
                            (m.staffFormFields ?? []).map((f) => {
                              const v = m.staffRecord!.formData?.[f.key];
                              if (v === undefined || v === null || v === '') return null;
                              return (
                                <View key={f.key} style={[breakdownStyles.row, { marginTop: 4 }]}>
                                  <Text style={[breakdownStyles.criterionLabel, isRtl && styles.textRight]} numberOfLines={1}>
                                    {lang === 'he' ? f.labelHe : f.labelEn}
                                  </Text>
                                  <Text style={breakdownStyles.scoreText}>{String(v)}</Text>
                                </View>
                              );
                            })
                          )}
                        </View>
                      )}

                      {(m as any).committeeReviewHistory?.length > 0 && (
                        <View style={{ marginTop: 8 }}>
                          <Text style={[breakdownStyles.commentsLabel, isRtl && styles.textRight]}>
                            {lang === 'he' ? 'ביקורת הוועדה' : 'Committee Review'}
                          </Text>
                          {(m as any).committeeReviewHistory.map((round: any, i: number) => (
                            <View key={`${round.committeeId}-${round.decidedAt}-${i}`} style={{ marginTop: 6, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: '#F0F4FF', paddingTop: i > 0 ? 6 : 0 }}>
                              <Text style={{ fontSize: 11, color: '#8899BB', fontWeight: '600' }}>
                                {lang === 'he' ? `סבב ${i + 1} — ${round.memberVotes.length} חברי ועדה הביעו דעה` : `Round ${i + 1} — ${round.memberVotes.length} members weighed in`}
                              </Text>
                              {round.memberVotes.map((v: any, vi: number) => (
                                <View key={vi} style={[{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }, isRtl && styles.rowReverse]}>
                                  <Text style={{ fontSize: 11, color: '#8899BB' }}>{lang === 'he' ? `חבר ועדה ${vi + 1}` : `Member ${vi + 1}`}</Text>
                                  <Text style={{ fontSize: 11, fontWeight: '600', color: v.vote === 'approve' ? '#10B981' : '#EF4444' }}>
                                    {v.vote === 'approve' ? (lang === 'he' ? '✓ בעד' : '✓ Approved') : (lang === 'he' ? '✗ נגד' : '✗ Rejected')}
                                    {v.comment ? ` — ${v.comment}` : ''}
                                  </Text>
                                </View>
                              ))}
                              <View style={{ marginTop: 4, borderTopWidth: 1, borderTopColor: '#F0F4FF', paddingTop: 4 }}>
                                <Text style={{ fontSize: 11 }}>
                                  <Text style={{ fontWeight: '700' }}>{lang === 'he' ? 'החלטת היו"ר: ' : "Chairman's decision: "}</Text>
                                  <Text style={{ fontWeight: '600', color: round.chairmanDecision === 'approve' ? '#10B981' : '#EF4444' }}>
                                    {round.chairmanDecision === 'approve' ? (lang === 'he' ? '✓ אושר' : '✓ Approved') : (lang === 'he' ? '✗ נדחה' : '✗ Rejected')}
                                  </Text>
                                </Text>
                                {round.chairmanComment ? <Text style={{ fontSize: 11, color: '#8899BB', marginTop: 2 }}>{round.chairmanComment}</Text> : null}
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </Pressable>
              );
            })}

            {/* Final grade card */}
            {project.overallFinalGrade != null && (
              <View style={styles.finalGradeCard}>
                <Text style={styles.finalGradeLabel}>{tx('finalGrade', lang)}</Text>
                <Text style={styles.finalGradeValue}>{project.overallFinalGrade}</Text>
                <Text style={styles.finalGradeNote}>
                  {lang === 'he'
                    ? '* הציון מחושב לפי האחוזים שנקבעו לכל אבן דרך בתבנית התהליך המאושרת'
                    : "* Grade calculated using each milestone's percentage in the approved workflow template"}
                </Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Submit Milestone Modal ── */}
      {submitTarget && (
        !submitTarget.studentFormFields?.length ? (
          <SubmitMilestoneModal
            milestone={submitTarget}
            projectId={project.id}
            lang={lang}
            isRtl={isRtl}
            onClose={() => setSubmitTarget(null)}
            onSubmitted={() => setSubmitTarget(null)}
          />
        ) : submitTarget.type === 'progress_report' ? (
          <ProgressReportFormModal
            milestone={submitTarget}
            project={project}
            lang={lang}
            isRtl={isRtl}
            onClose={() => setSubmitTarget(null)}
            onSubmitted={() => setSubmitTarget(null)}
          />
        ) : (
          <ResearchProposalFormModal
            milestone={submitTarget}
            project={project}
            lang={lang}
            isRtl={isRtl}
            onClose={() => setSubmitTarget(null)}
            onSubmitted={() => setSubmitTarget(null)}
          />
        )
      )}
    </View>
  );
}

const styles = ActivateDashboardStyles;

const breakdownStyles = GradeBreakdownStyles;

// ─── "Student Mobile Home" reskin — Overview tab only ──────────────────────
// Built strictly from studentTheme.ts tokens (studentPalette/studentRadius/
// studentSpacing/studentCardStyles) — see that file's own header comment for
// why this stays separate from constants/theme.ts + constants/styles.ts.
const ov = StyleSheet.create({
  screenBg: { backgroundColor: studentPalette.surface },

  tabActive:     { borderBottomColor: studentPalette.primary },
  tabTextActive: { color: studentPalette.primary },

  header: { paddingVertical: studentSpacing.xs, marginBottom: studentSpacing.md },
  welcomeTitle: { fontSize: 22, fontWeight: '700', color: studentPalette.onSurface },
  welcomeSubtitle: { fontSize: 14, color: studentPalette.onSurfaceVariant, marginTop: studentSpacing.xs },

  metricsRow: { flexDirection: 'row', gap: studentSpacing.sm, marginBottom: studentSpacing.sm },
  metricCard: {
    ...studentCardStyles.metric,
    flex: 1,
    minHeight: 96,
  },
  metricHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  metricLabel: {
    fontSize: 11, fontWeight: '600', color: studentPalette.onSurfaceVariant,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  metricIcon: { fontSize: 16 },
  metricValue: { fontSize: 30, fontWeight: '800', color: studentPalette.primary, marginTop: studentSpacing.sm },
  metricValueRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: studentSpacing.sm },
  metricValueSub: { fontSize: 14, color: studentPalette.onSurfaceVariant, marginBottom: 3 },

  deadlineCard: {
    ...studentCardStyles.base,
    marginBottom: studentSpacing.md,
  },
  deadlineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: studentSpacing.sm },
  deadlineBody: { flexDirection: 'row', alignItems: 'center', gap: studentSpacing.md },
  deadlineChip: {
    backgroundColor: studentPalette.errorContainer,
    borderRadius: studentRadius.lg,
    paddingVertical: studentSpacing.sm,
    paddingHorizontal: studentSpacing.sm,
    alignItems: 'center',
    minWidth: 64,
  },
  deadlineChipNum: { fontSize: 22, fontWeight: '800', color: studentPalette.onErrorContainer, lineHeight: 26 },
  deadlineChipLabel: {
    fontSize: 10, fontWeight: '700', color: studentPalette.onErrorContainer,
    textTransform: 'uppercase', marginTop: 2,
  },
  deadlineTitle: { fontSize: 15, fontWeight: '700', color: studentPalette.onSurface },
  deadlineSub: { fontSize: 12, color: studentPalette.onSurfaceVariant, marginTop: 2 },

  section: { marginTop: studentSpacing.sm, marginBottom: studentSpacing.md },
  sectionHeading: { fontSize: 15, fontWeight: '700', color: studentPalette.onSurface, marginBottom: studentSpacing.sm },

  quickActionsRow: { flexDirection: 'row', gap: studentSpacing.sm },
  primaryActionBtn: {
    flex: 1,
    backgroundColor: studentPalette.primary,
    borderRadius: studentRadius.sm,
    paddingVertical: studentSpacing.sm + 2,
    paddingHorizontal: studentSpacing.md,
    alignItems: 'center',
  },
  primaryActionBtnText: { color: studentPalette.onPrimary, fontSize: 13, fontWeight: '700' },
  secondaryActionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: studentPalette.secondary,
    borderRadius: studentRadius.sm,
    paddingVertical: studentSpacing.sm + 2,
    paddingHorizontal: studentSpacing.md,
    alignItems: 'center',
  },
  secondaryActionBtnText: { color: studentPalette.secondary, fontSize: 13, fontWeight: '700' },

  activityEmpty: {
    ...studentCardStyles.base,
    alignItems: 'center',
    paddingVertical: studentSpacing.lg,
  },
  activityEmptyText: { fontSize: 13, color: studentPalette.onSurfaceVariant },
  activityList: {
    backgroundColor: studentPalette.surfaceContainerLowest,
    borderRadius: studentRadius.lg,
    borderWidth: 1,
    borderColor: studentPalette.outlineVariant,
    overflow: 'hidden',
  },
  activityRow: { flexDirection: 'row', gap: studentSpacing.sm, padding: studentSpacing.md, alignItems: 'flex-start' },
  activityRowDivider: { borderBottomWidth: 1, borderBottomColor: studentPalette.outlineVariant },
  activityIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: studentPalette.secondaryContainer,
    alignItems: 'center', justifyContent: 'center',
  },
  activityIconText: { fontSize: 16 },
  activityTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: studentSpacing.sm },
  activityTitle: { fontSize: 13, fontWeight: '700', color: studentPalette.onSurface, flex: 1 },
  activityTime: { fontSize: 11, color: studentPalette.onSurfaceVariant },
  activitySubtitle: { fontSize: 12, color: studentPalette.onSurfaceVariant, marginTop: 2, lineHeight: 17 },

  descCard: {
    ...studentCardStyles.base,
    marginTop: studentSpacing.xs,
  },
  descTitle: { fontSize: 14, fontWeight: '700', color: studentPalette.onSurface, marginBottom: studentSpacing.sm },
  descBody: { fontSize: 13, color: studentPalette.onSurfaceVariant, lineHeight: 20 },
});
