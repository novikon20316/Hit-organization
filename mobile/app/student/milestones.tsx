// app/student/milestones.tsx — React Native (Expo) version
//
// Bottom-nav "Milestones" tab (see (tabs)/_layout.tsx's ROLE_TABS.student).
// Mirrors student/home.tsx's session/routing pattern (same useStudentData()
// hook, same TEMP-2-ACTIVE-PROJECTS multi-project switcher) but renders the
// "Mobile Milestone Tracker with Files" Stitch design instead of the full
// active-project dashboard — a focused, scrollable list of the active
// project's milestones, each with its submitted files as tappable chips.
// (Upgraded from the plain, no-files "Mobile Milestone Tracker" variant —
// same card/requirements/submit logic throughout, just restyled plus a real
// file-chip list where a "N files submitted" text line used to be.)

import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '@/src/api/apiClient';
import { useStudentData } from '../../hooks/useStudentData';
import { tx, type Lang } from '../../components/i18n';
import { TopBar } from '../../components/shared';
import { studentHomeStyles } from '@/constants';
import { studentPalette, studentRadius, studentSpacing, studentCardStyles } from '@/constants';
import SubmitMilestoneModal from '@/components/modals/SubmitMilestoneModal';
import ProgressReportFormModal from '@/components/modals/ProgressReportFormModal';
import type { Milestone, MilestoneType } from '@/types';

// ─── Milestone type labels ──────────────────────────────────────────────────
// Duplicated locally rather than imported from Activedashboard.tsx/
// SubmitMilestoneModal.tsx — this repo's own convention (see those files'
// comments) is a small local copy per screen, since a milestone type can also
// be a faculty-defined `custom_xxxxx` string none of these maps cover.
const MILESTONE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר',    en: 'Research Proposal' },
  progress_report:   { he: 'דו"ח התקדמות', en: 'Progress Report' },
  final_report:      { he: 'דו"ח מסכם',    en: 'Final Report' },
  defense:           { he: 'הגנה',          en: 'Defense' },
  poster:            { he: 'פוסטר',        en: 'Poster Session' },
};

const LEGACY_MILESTONE_TYPE_ORDER: MilestoneType[] = [
  'research_proposal', 'progress_report', 'final_report', 'defense', 'poster',
];
function resolveMilestoneOrder(m: { type?: string; order?: number }): number {
  if (typeof m.order === 'number') return m.order;
  const idx = m.type ? LEGACY_MILESTONE_TYPE_ORDER.indexOf(m.type as MilestoneType) : -1;
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

function toDate(val: any): Date | null {
  if (!val) return null;
  if (typeof val?.toDate === 'function') return val.toDate();
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function daysUntil(val: any): number | null {
  const d = toDate(val);
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// Milestone file URLs carry no separate filename field — derive a
// human-readable one from the URL itself, same approach as web's
// components/MilestoneTimeline.tsx fileNameFromUrl.
function fileNameFromUrl(url: string, index: number, lang: Lang): string {
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    const last = path.split('/').filter(Boolean).pop();
    if (last) return last;
  } catch {
    // fall through to generic label below
  }
  return lang === 'he' ? `קובץ ${index + 1}` : `File ${index + 1}`;
}

const SUBMISSION_REQUIREMENT_LABEL: Record<string, { he: string; en: string }> = {
  file:    { he: 'יש לצרף קובץ',                 en: 'A file must be attached' },
  comment: { he: 'יש לכתוב הערה',                en: 'A note must be written' },
  both:    { he: 'יש לצרף קובץ ולכתוב הערה',     en: 'A file and a note are both required' },
  none:    { he: 'ניתן להגיש ללא קובץ או הערה',  en: 'Can be submitted with no file or note' },
};

export default function StudentMilestones() {
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';
  const [selectedProjectIndex, setSelectedProjectIndex] = useState(0);
  const [submitTarget, setSubmitTarget] = useState<Milestone | null>(null);

  const {
    studentState, studentName,
    activeProjects, cancelAllListeners,
  } = useStudentData();

  const handleBeforeSignOut = async () => {
    try {
      await apiClient.post('/api/users/logout');
    } catch {
      // non-fatal — sign-out proceeds regardless, same as student/home.tsx
    } finally {
      cancelAllListeners();
    }
  };

  if (studentState === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={studentPalette.primary} />
        <Text style={styles.loadingText}>{tx('loading', lang)}</Text>
      </View>
    );
  }

  const hasActiveProject = studentState === 'active' && activeProjects.length > 0;

  return (
    <SafeAreaView style={[styles.root, isRtl && styles.rtl]}>
      <TopBar
        name={studentName}
        role="student"
        lang={lang}
        isRtl={isRtl}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
        onBeforeSignOut={handleBeforeSignOut}
      />

      {!hasActiveProject ? (
        <View style={mt.empty}>
          <Text style={mt.emptyIcon}>🎯</Text>
          <Text style={mt.emptyText}>
            {lang === 'he'
              ? 'אבני הדרך שלך יופיעו כאן לאחר שתתחיל פרויקט פעיל.'
              : 'Your milestones will show up here once you have an active project.'}
          </Text>
        </View>
      ) : (
        <>
          {activeProjects.length > 1 && (
            <View style={[mt.switcherRow, isRtl && mt.switcherRowRtl]}>
              {activeProjects.map((ap, i) => (
                <Pressable
                  key={ap.project.id}
                  style={[mt.switcherPill, i === selectedProjectIndex && mt.switcherPillActive]}
                  onPress={() => setSelectedProjectIndex(i)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: i === selectedProjectIndex }}
                >
                  <Text
                    style={[mt.switcherText, i === selectedProjectIndex && mt.switcherTextActive]}
                    numberOfLines={1}
                  >
                    {lang === 'he' ? ap.project.titleHe : ap.project.titleEn}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {(() => {
            const selected = activeProjects[Math.min(selectedProjectIndex, activeProjects.length - 1)];
            const { project, milestones, progress } = selected;
            const completed = milestones.filter((m) => m.status === 'coordinator_approved' || m.status === 'completed').length;

            const isUnlocked = (m: Milestone): boolean => {
              const order = resolveMilestoneOrder(m);
              return milestones
                .filter((prev) => resolveMilestoneOrder(prev) < order)
                .every((prev) => prev.status === 'coordinator_approved' || prev.status === 'completed');
            };

            return (
              <ScrollView contentContainerStyle={mt.content} showsVerticalScrollIndicator={false}>
                {/* Project context */}
                <View style={mt.projectHeader}>
                  <Text style={[mt.projectTitle, isRtl && styles.textRight]} numberOfLines={2}>
                    {lang === 'he' ? project.titleHe : project.titleEn}
                  </Text>
                  <Text style={[mt.projectSub, isRtl && styles.textRight]}>
                    {project.supervisorName} · {project.academicYear}
                  </Text>
                  <View style={mt.progressTrack}>
                    <View style={[mt.progressFill, { width: `${progress}%` }]} />
                  </View>
                  <View style={[mt.progressLabelsRow, isRtl && styles.rowReverse]}>
                    <Text style={mt.progressLabel}>
                      {progress}% {lang === 'he' ? 'הושלם' : 'Completed'}
                    </Text>
                    <Text style={mt.progressLabel}>
                      {completed} {lang === 'he' ? `מתוך ${milestones.length} אבני דרך` : `of ${milestones.length} Milestones`}
                    </Text>
                  </View>
                </View>

                {/* Milestone cards */}
                <View style={{ gap: studentSpacing.md }}>
                  {milestones.map((m) => {
                    const unlocked = isUnlocked(m);
                    const label = lang === 'he' ? (MILESTONE_LABEL[m.type]?.he ?? m.type) : (MILESTONE_LABEL[m.type]?.en ?? m.type);
                    const isDefense = m.type === 'defense';
                    const isApprovedOrDone = m.status === 'coordinator_approved' || m.status === 'completed';
                    const isSubmittedInReview = (['submitted', 'supervisor_graded', 'graded', 'examiners_assigned', 'examiner_graded', 'both_examiners_graded'] as string[]).includes(m.status);
                    const isRejected = m.status === 'rejected';
                    const isCurrent = unlocked && !isApprovedOrDone && !isSubmittedInReview;

                    const pillLabel = isApprovedOrDone
                      ? (lang === 'he' ? 'נוקד' : 'Graded')
                      : isRejected
                        ? (lang === 'he' ? 'הוחזר לתיקון' : 'Returned')
                        : isSubmittedInReview
                          ? (lang === 'he' ? 'ממתין לבדיקה' : 'Awaiting Review')
                          : isCurrent
                            ? (lang === 'he' ? 'בתהליך' : 'In Progress')
                            : (lang === 'he' ? 'קרוב' : 'Upcoming');

                    const pillColor = isApprovedOrDone ? studentPalette.statusGraded
                      : isRejected ? studentPalette.error
                      : isSubmittedInReview ? studentPalette.statusAwaiting
                      : isCurrent ? studentPalette.statusInProgress
                      : studentPalette.statusUpcoming;
                    const pillBg = isApprovedOrDone ? studentPalette.statusGradedBg
                      : isRejected ? studentPalette.errorContainer
                      : isSubmittedInReview ? studentPalette.statusAwaitingBg
                      : isCurrent ? studentPalette.statusInProgressBg
                      : studentPalette.statusUpcomingBg;

                    const dueLabel = isDefense
                      ? (toDate(m.defenseDate)?.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short' }) ?? (lang === 'he' ? 'טרם נקבע' : 'Not set'))
                      : (toDate(m.dueDate)?.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short' }) ?? '—');
                    const days = daysUntil(m.dueDate);

                    return (
                      <View
                        key={m.id}
                        style={[
                          mt.card,
                          { borderLeftWidth: 4, borderLeftColor: pillColor },
                          isCurrent && mt.cardCurrent,
                          !unlocked && mt.cardLocked,
                        ]}
                      >
                        <View style={[mt.cardTopRow, isRtl && styles.rowReverse]}>
                          <View style={{ flex: 1 }}>
                            <View style={[mt.pill, { backgroundColor: pillBg }]}>
                              <Text style={[mt.pillText, { color: pillColor }]}>{pillLabel}</Text>
                            </View>
                            <Text style={[mt.cardTitle, isRtl && styles.textRight]}>{label}</Text>
                          </View>
                          <Text style={mt.cardDate}>{dueLabel}</Text>
                        </View>

                        {/* Graded */}
                        {isApprovedOrDone && (
                          <View style={[mt.cardFooterRow, isRtl && styles.rowReverse]}>
                            <Text style={mt.gradeText}>
                              ✓ {m.finalGrade != null ? `${m.finalGrade}/100` : (lang === 'he' ? 'ציון לא זמין' : 'Grade unavailable')}
                            </Text>
                            {m.coordinatorComment && (
                              <Text style={[mt.feedbackText, isRtl && styles.textRight]} numberOfLines={2}>
                                💬 {m.coordinatorComment}
                              </Text>
                            )}
                          </View>
                        )}

                        {/* Awaiting review */}
                        {isSubmittedInReview && !isApprovedOrDone && (
                          <Text style={[mt.waitingText, isRtl && styles.textRight]}>
                            📤 {lang === 'he' ? 'הוגש — ממתין לאישור' : 'Submitted — awaiting approval'}
                          </Text>
                        )}

                        {/* Rejected — needs resubmission */}
                        {isRejected && (
                          <View style={mt.rejectionBox}>
                            <Text style={[mt.rejectionLabel, isRtl && styles.textRight]}>
                              {lang === 'he' ? 'סיבת ההחזרה:' : 'Reason for return:'}
                            </Text>
                            {!!m.rejectionReason && (
                              <Text style={[mt.rejectionText, isRtl && styles.textRight]}>{m.rejectionReason}</Text>
                            )}
                            <Pressable style={mt.submitBtn} onPress={() => setSubmitTarget(m)} accessibilityRole="button">
                              <Text style={mt.submitBtnText}>
                                {lang === 'he' ? 'הגש גרסה מתוקנת' : 'Submit Corrected Version'}
                              </Text>
                            </Pressable>
                          </View>
                        )}

                        {/* Current, actionable milestone — Requirements + Submit */}
                        {isCurrent && !isDefense && (
                          <View style={mt.requirementsBox}>
                            <Text style={[mt.requirementsTitle, isRtl && styles.textRight]}>
                              {lang === 'he' ? 'דרישות' : 'Requirements'}
                            </Text>
                            <Text style={[mt.requirementsText, isRtl && styles.textRight]}>
                              {(SUBMISSION_REQUIREMENT_LABEL[m.submissionRequirement ?? 'both']?.[lang]) ?? ''}
                            </Text>
                            {days !== null && (
                              <Text style={[mt.dueHint, days < 0 ? mt.dueHintLate : null, isRtl && styles.textRight]}>
                                {days < 0
                                  ? (lang === 'he' ? `${Math.abs(days)} ימי איחור` : `${Math.abs(days)} days overdue`)
                                  : (lang === 'he' ? `נותרו ${days} ימים` : `${days} days left`)}
                              </Text>
                            )}
                            <Pressable style={mt.submitBtn} onPress={() => setSubmitTarget(m)} accessibilityRole="button">
                              <Text style={mt.submitBtnText}>
                                {lang === 'he' ? 'הגש אבן דרך' : 'Submit Milestone'}
                              </Text>
                            </Pressable>
                          </View>
                        )}

                        {/* Defense details */}
                        {isDefense && (
                          <View style={mt.requirementsBox}>
                            {m.defenseDate ? (
                              <>
                                <Text style={[mt.requirementsText, isRtl && styles.textRight]}>
                                  🎓 {toDate(m.defenseDate)?.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                  {m.defenseTime ? `  •  ${m.defenseTime}` : ''}
                                </Text>
                                {(m.defenseBuilding || m.defenseRoom) && (
                                  <Text style={[mt.requirementsText, isRtl && styles.textRight]}>
                                    🏫 {m.defenseBuilding ?? ''} {m.defenseRoom ?? ''}
                                  </Text>
                                )}
                                {m.examinerNames?.length > 0 && (
                                  <Text style={[mt.requirementsText, isRtl && styles.textRight]}>
                                    👥 {m.examinerNames.join(', ')}
                                  </Text>
                                )}
                              </>
                            ) : (
                              <Text style={[mt.requirementsText, isRtl && styles.textRight]}>
                                {lang === 'he' ? 'מועד ההגנה טרם נקבע' : 'Defense date not scheduled yet'}
                              </Text>
                            )}
                          </View>
                        )}

                        {/* Locked / upcoming */}
                        {!unlocked && (
                          <Text style={[mt.lockedText, isRtl && styles.textRight]}>
                            🔒 {lang === 'he' ? 'יש להשלים אבני דרך קודמות' : 'Complete previous milestones first'}
                          </Text>
                        )}

                        {m.fileUrls?.length > 0 && (
                          <View style={mt.filesSection}>
                            <Text style={[mt.filesLabel, isRtl && styles.textRight]}>
                              {lang === 'he' ? 'קבצים שהוגשו' : 'Submitted Files'}
                            </Text>
                            <View style={[mt.filesRow, isRtl && styles.rowReverse]}>
                              {m.fileUrls.map((url, idx) => (
                                <Pressable key={idx} onPress={() => Linking.openURL(url)} style={mt.fileChip} accessibilityRole="link">
                                  <Text style={mt.fileChipText} numberOfLines={1}>
                                    📄 {fileNameFromUrl(url, idx, lang)}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>

                <View style={{ height: 40 }} />
              </ScrollView>
            );
          })()}
        </>
      )}

      {submitTarget && (() => {
        const selected = activeProjects[Math.min(selectedProjectIndex, activeProjects.length - 1)];
        if (submitTarget.type === 'progress_report' && submitTarget.studentFormFields?.length) {
          return (
            <ProgressReportFormModal
              milestone={submitTarget}
              project={selected.project}
              lang={lang}
              isRtl={isRtl}
              onClose={() => setSubmitTarget(null)}
              onSubmitted={() => setSubmitTarget(null)}
            />
          );
        }
        return (
          <SubmitMilestoneModal
            milestone={submitTarget}
            projectId={selected.project.id}
            lang={lang}
            isRtl={isRtl}
            onClose={() => setSubmitTarget(null)}
            onSubmitted={() => setSubmitTarget(null)}
          />
        );
      })()}
    </SafeAreaView>
  );
}

const styles = studentHomeStyles;

const mt = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: studentSpacing.xl },
  emptyIcon: { fontSize: 40, marginBottom: studentSpacing.md },
  emptyText: { fontSize: 14, color: studentPalette.onSurfaceVariant, textAlign: 'center' },

  switcherRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: studentPalette.surfaceContainerLowest, borderBottomWidth: 1, borderBottomColor: studentPalette.outlineVariant },
  switcherRowRtl: { flexDirection: 'row-reverse' },
  switcherPill: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: studentRadius.lg, backgroundColor: studentPalette.surfaceContainerLow, borderWidth: 1, borderColor: studentPalette.outlineVariant, alignItems: 'center' },
  switcherPillActive: { backgroundColor: studentPalette.primary, borderColor: studentPalette.primary },
  switcherText: { fontSize: 12, fontWeight: '600', color: studentPalette.onSurfaceVariant },
  switcherTextActive: { color: studentPalette.onPrimary },

  content: { padding: studentSpacing.md, backgroundColor: studentPalette.surface },

  projectHeader: { marginBottom: studentSpacing.lg },
  projectTitle: { fontSize: 20, fontWeight: '700', color: studentPalette.onSurface },
  projectSub: { fontSize: 13, color: studentPalette.onSurfaceVariant, marginTop: 2, marginBottom: studentSpacing.md },
  progressTrack: { height: 8, borderRadius: studentRadius.lg, backgroundColor: studentPalette.surfaceContainer, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: studentRadius.lg, backgroundColor: studentPalette.primary },
  progressLabelsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: studentSpacing.xs },
  progressLabel: { fontSize: 12, fontWeight: '600', color: studentPalette.onSurfaceVariant },

  card: { ...studentCardStyles.base },
  cardCurrent: { borderColor: studentPalette.primary, borderWidth: 1.5 },
  cardLocked: { opacity: 0.6 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: studentSpacing.sm },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: studentRadius.md, marginBottom: 6 },
  pillText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: studentPalette.onSurface },
  cardDate: { fontSize: 12, fontWeight: '600', color: studentPalette.onSurfaceVariant },

  cardFooterRow: { justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  gradeText: { fontSize: 13, fontWeight: '700', color: studentPalette.statusGraded },
  feedbackText: { fontSize: 12, color: studentPalette.onSurfaceVariant, marginTop: 4 },
  waitingText: { fontSize: 12, fontWeight: '600', color: studentPalette.statusAwaiting },

  rejectionBox: { marginTop: studentSpacing.xs, paddingTop: studentSpacing.sm, borderTopWidth: 1, borderTopColor: studentPalette.outlineVariant },
  rejectionLabel: { fontSize: 12, fontWeight: '700', color: studentPalette.error },
  rejectionText: { fontSize: 12, color: studentPalette.error, marginTop: 2, marginBottom: studentSpacing.sm },

  requirementsBox: { marginTop: studentSpacing.sm, paddingTop: studentSpacing.sm, borderTopWidth: 1, borderTopColor: studentPalette.outlineVariant },
  requirementsTitle: { fontSize: 12, fontWeight: '700', color: studentPalette.onSurface, marginBottom: 4 },
  requirementsText: { fontSize: 12, color: studentPalette.onSurfaceVariant, marginBottom: 4 },
  dueHint: { fontSize: 11, fontWeight: '600', color: studentPalette.onSurfaceVariant, marginBottom: studentSpacing.sm },
  dueHintLate: { color: studentPalette.error },

  lockedText: { fontSize: 12, color: studentPalette.onSurfaceVariant, marginTop: studentSpacing.xs },

  filesSection: { marginTop: studentSpacing.sm },
  filesLabel: { fontSize: 9, fontWeight: '700', color: studentPalette.onSurfaceVariant, textTransform: 'uppercase', marginBottom: 4 },
  filesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: studentPalette.outlineVariant,
    borderRadius: studentRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: studentPalette.surfaceContainerLow,
    maxWidth: 220,
  },
  fileChipText: { fontSize: 11, color: studentPalette.onSurface },

  submitBtn: { backgroundColor: studentPalette.primary, borderRadius: studentRadius.md, paddingVertical: 10, alignItems: 'center' },
  submitBtnText: { color: studentPalette.onPrimary, fontSize: 13, fontWeight: '700' },
});
