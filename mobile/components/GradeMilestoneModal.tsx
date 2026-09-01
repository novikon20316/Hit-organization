// components/GradeMilestoneModal.tsx
//
// Supervisor grading form — ported from the Stitch design "Staff Document
// Portal: Project Assessment" (web) / "Staff Document View: Project
// Assessment" (mobile), project "Unified Academic Project Manager". Uses the
// same "Academic Precision" tokens as MilestoneRoadmap.tsx (submission
// summary card, status/type pill, file chips, progress-style total bar) so
// the grading screen reads as the same design system, not a one-off.
//
// Purely presentational — all state (criteria, comment, individual scores)
// and submit logic stay owned by app/supervisor/dashboard.tsx, matching the
// web app's split (web/app/supervisor/dashboard/GradeMilestoneModal.tsx also
// receives fully-formed values and calls back up rather than owning state).

import React from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Linking, StyleSheet } from 'react-native';
import { milestonePalette as p, milestoneRadius as radius, milestoneSpacing as spacing } from '@/constants/milestoneTheme';

export interface GradeMilestoneModalField {
  key: string;
  max: number;
  weight: number;
  he: string;
  en: string;
}

export interface GradeMilestoneModalMilestone {
  id: string;
  type: string;
  projectTitleHe: string;
  projectTitleEn: string;
  studentNames: string[];
  studentIds: string[];
  fileUrls: string[];
  submissionNote: string;
  dueDate?: string | null;
  submittedAt?: string | null;
}

interface Props {
  visible: boolean;
  milestone: GradeMilestoneModalMilestone | null;
  lang: 'he' | 'en';
  isRtl: boolean;
  activeFields: GradeMilestoneModalField[];
  criteria: Record<string, string>;
  onCriteriaChange: (key: string, value: string) => void;
  individualScores: Record<string, string>;
  onIndividualScoreChange: (studentId: string, value: string) => void;
  comment: string;
  onCommentChange: (value: string) => void;
  totalScore: number;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

// Duplicated locally rather than imported — same per-screen local-copy
// convention already used by this file's siblings (see the top-of-file
// comment in app/supervisor/dashboard.tsx and components/MilestoneRoadmap.tsx).
const MILESTONE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר', en: 'Research Proposal' },
  progress_report: { he: 'דו"ח התקדמות', en: 'Progress Report' },
  final_report: { he: 'דו"ח מסכם', en: 'Final Report' },
  defense: { he: 'הגנה', en: 'Defense' },
  poster: { he: 'פוסטר', en: 'Poster Session' },
};

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(v: string | null | undefined, lang: 'he' | 'en'): string {
  const d = toDate(v);
  return d ? d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

function fileNameFromUrl(url: string, index: number, lang: 'he' | 'en'): string {
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    const last = path.split('/').filter(Boolean).pop();
    if (last) return last;
  } catch {
    // fall through to generic label below
  }
  return lang === 'he' ? `קובץ ${index + 1}` : `File ${index + 1}`;
}

export function GradeMilestoneModal({
  visible, milestone, lang, isRtl, activeFields,
  criteria, onCriteriaChange, individualScores, onIndividualScoreChange,
  comment, onCommentChange, totalScore, submitting, onClose, onSubmit,
}: Props) {
  const isGroupProject = (milestone?.studentIds.length ?? 0) > 1;
  const pct = Math.max(0, Math.min(100, totalScore));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet">
      <View style={s.root}>
        <View style={[s.header, isRtl && s.rowReverse]}>
          <View>
            <Text style={[s.headerTitle, isRtl && s.textRight]}>{lang === 'he' ? 'טופס ציון' : 'Grading Form'}</Text>
            <Text style={[s.headerSubtitle, isRtl && s.textRight]}>
              {lang === 'he' ? 'הערכת הגשת הסטודנט' : 'Evaluate the student submission'}
            </Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={lang === 'he' ? 'סגור' : 'Close'} hitSlop={10}>
            <Text style={s.closeBtn}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {milestone && (
            <View style={s.card}>
              <View style={[s.rowBetween, isRtl && s.rowReverse]}>
                <View style={s.typeBadge}>
                  <Text style={s.typeBadgeText}>{MILESTONE_LABEL[milestone.type]?.[lang] ?? milestone.type}</Text>
                </View>
                {!!milestone.submittedAt && (
                  <Text style={s.metaText}>📤 {formatDate(milestone.submittedAt, lang)}</Text>
                )}
              </View>

              <Text style={[s.projectTitle, isRtl && s.textRight]}>
                {lang === 'he' ? milestone.projectTitleHe : milestone.projectTitleEn}
              </Text>

              <View style={[s.chipsRow, isRtl && s.rowReverse]}>
                {milestone.studentNames.map((name, idx) => (
                  <View key={milestone.studentIds[idx] ?? idx} style={s.studentChip}>
                    <Text style={s.studentChipText}>👤 {name}</Text>
                  </View>
                ))}
              </View>

              {!!milestone.submissionNote && (
                <View style={s.noteBox}>
                  <Text style={[s.noteText, isRtl && s.textRight]}>💬 {milestone.submissionNote}</Text>
                </View>
              )}

              {!!milestone.fileUrls?.length && (
                <View style={{ marginTop: spacing.sm }}>
                  <Text style={[s.statLabel, isRtl && s.textRight]}>{lang === 'he' ? 'קבצים שהוגשו' : 'Submitted Files'}</Text>
                  <View style={[s.chipsRow, isRtl && s.rowReverse]}>
                    {milestone.fileUrls.map((url, idx) => (
                      <Pressable key={idx} onPress={() => Linking.openURL(url)} style={s.fileChip} accessibilityRole="link">
                        <Text style={s.fileChipText} numberOfLines={1}>📄 {fileNameFromUrl(url, idx, lang)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}

          <View style={s.card}>
            <Text style={[s.cardTitle, isRtl && s.textRight]}>{lang === 'he' ? 'מחוון ציונים' : 'Grading Rubric'}</Text>

            {activeFields.map((field, idx) => (
              <View
                key={field.key}
                style={[s.rubricRow, isRtl && s.rowReverse, idx < activeFields.length - 1 && s.rubricRowDivider]}
              >
                <Text style={[s.rubricLabel, isRtl && s.textRight]}>{lang === 'he' ? field.he : field.en}</Text>
                <View style={[s.scoreBox, isRtl && s.rowReverse]}>
                  <TextInput
                    style={s.scoreInput}
                    keyboardType="numeric"
                    value={criteria[field.key]}
                    onChangeText={(v) => onCriteriaChange(field.key, v)}
                    accessibilityLabel={lang === 'he' ? field.he : field.en}
                  />
                  <Text style={s.scoreMax}>/{field.max}</Text>
                </View>
              </View>
            ))}

            <View style={[s.totalRow, isRtl && s.rowReverse]}>
              <Text style={s.totalLabel}>{lang === 'he' ? 'ציון כולל' : 'Total Score'}</Text>
              <Text style={s.totalValue}>{totalScore}/100</Text>
            </View>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${pct}%` }]} />
            </View>
          </View>

          {isGroupProject && milestone && (
            <View style={s.card}>
              <Text style={[s.cardTitle, isRtl && s.textRight]}>
                {lang === 'he' ? 'ציון אישי (לצד הציון הקבוצתי)' : 'Individual grade (on top of the group score)'}
              </Text>
              {milestone.studentIds.map((sid, idx) => (
                <View key={sid} style={{ marginTop: spacing.sm }}>
                  <Text style={[s.statLabel, isRtl && s.textRight]}>👤 {milestone.studentNames[idx] ?? sid}</Text>
                  <TextInput
                    style={[s.input, isRtl && s.textRight]}
                    keyboardType="numeric"
                    placeholder={lang === 'he' ? 'ציון אישי 0–100 (אופציונלי)' : 'Individual score 0–100 (optional)'}
                    placeholderTextColor={p.outline}
                    value={individualScores[sid] ?? ''}
                    onChangeText={(v) => onIndividualScoreChange(sid, v)}
                  />
                </View>
              ))}
            </View>
          )}

          <View style={s.card}>
            <Text style={[s.cardTitle, isRtl && s.textRight]}>{lang === 'he' ? 'הערות לסטודנט' : 'Comments to Student'}</Text>
            <TextInput
              style={[s.input, s.textarea, isRtl && s.textRight]}
              value={comment}
              onChangeText={onCommentChange}
              multiline
              numberOfLines={5}
              placeholder={lang === 'he' ? 'הערות...' : 'Comments...'}
              placeholderTextColor={p.outline}
              textAlign={isRtl ? 'right' : 'left'}
            />
          </View>

          <Pressable
            style={[s.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={onSubmit}
            disabled={submitting}
            accessibilityRole="button"
          >
            {submitting
              ? <ActivityIndicator color={p.onPrimary} />
              : <Text style={s.submitBtnText}>{lang === 'he' ? 'שלח ציון' : 'Submit Grade'}</Text>
            }
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: p.surface },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowReverse: { flexDirection: 'row-reverse' },
  textRight: { textAlign: 'right' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: p.outlineVariant,
    backgroundColor: p.surfaceContainerLowest,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: p.onSurface },
  headerSubtitle: { fontSize: 12, color: p.onSurfaceVariant, marginTop: 2 },
  closeBtn: { fontSize: 20, color: p.onSurfaceVariant, padding: spacing.xs },

  content: { padding: spacing.md, paddingBottom: spacing.lg * 2, gap: spacing.sm },

  card: {
    backgroundColor: p.surfaceContainerLowest,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: p.outlineVariant,
    padding: spacing.md,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: p.onSurface, marginBottom: spacing.sm },

  typeBadge: { backgroundColor: p.primaryContainer, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  typeBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', color: p.onPrimary },
  metaText: { fontSize: 11, color: p.onSurfaceVariant },

  projectTitle: { fontSize: 16, fontWeight: '700', color: p.onSurface, marginTop: spacing.sm },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  studentChip: {
    backgroundColor: p.surfaceContainer,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  studentChipText: { fontSize: 12, fontWeight: '600', color: p.onSurface },

  noteBox: {
    backgroundColor: p.surfaceContainerLow,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: p.outline,
  },
  noteText: { fontSize: 12, color: p.onSurfaceVariant, fontStyle: 'italic' },

  statLabel: { fontSize: 10, fontWeight: '700', color: p.onSurfaceVariant, textTransform: 'uppercase', marginBottom: 4 },

  fileChip: {
    borderWidth: 1,
    borderColor: p.outlineVariant,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: p.surfaceContainerLow,
    maxWidth: 220,
  },
  fileChipText: { fontSize: 11, color: p.onSurface },

  rubricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  rubricRowDivider: { borderBottomWidth: 1, borderBottomColor: p.outlineVariant },
  rubricLabel: { flex: 1, fontSize: 13, color: p.onSurface, paddingRight: spacing.sm },
  scoreBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scoreInput: {
    width: 52,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: p.primary,
    borderWidth: 1.5,
    borderColor: p.outlineVariant,
    borderRadius: 8,
    paddingVertical: 6,
  },
  scoreMax: { fontSize: 12, color: p.onSurfaceVariant, fontWeight: '600' },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  totalLabel: { fontSize: 12, fontWeight: '700', color: p.onSurface, textTransform: 'uppercase' },
  totalValue: { fontSize: 18, fontWeight: '800', color: p.primary },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: p.surfaceContainer, overflow: 'hidden', marginTop: 6 },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: p.primary },

  input: {
    backgroundColor: p.surfaceContainerLowest,
    borderWidth: 1.5,
    borderColor: p.outlineVariant,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: p.onSurface,
  },
  textarea: { textAlignVertical: 'top', minHeight: 100 },

  submitBtn: {
    backgroundColor: p.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitBtnText: { color: p.onPrimary, fontSize: 15, fontWeight: '700' },
});
