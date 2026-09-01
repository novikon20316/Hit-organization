// components/MilestoneRoadmap.tsx
//
// Shared "Mobile Milestone Tracker with Files" visual — ported from the
// Stitch design of the same name. A project-progress bar plus one card per
// milestone: numbered/checked step marker, status badge, a due/submitted/
// grade stat row, and a "Submitted Files" chip list that opens each file in
// the device browser. Read-only by design — every current consumer
// (system_admin's project milestones screen, administrative_coordinator's
// student drill-down) only ever displays milestones, never grades/approves
// them here; that stays on each role's own dedicated action screens. Mirrors
// web's components/MilestoneTimeline.tsx card layout so both platforms read
// as one design.

import React from 'react';
import { View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import { milestonePalette as p, milestoneRadius as radius, milestoneSpacing as spacing } from '@/constants/milestoneTheme';

export interface RoadmapMilestone {
  id: string;
  type: string;
  status: string;
  dueDate: string | null;
  submittedAt?: string | null;
  fileUrls?: string[];
  finalGrade?: number | null;
  defenseDate?: string | null;
  defenseRoom?: string | null;
  defenseBuilding?: string | null;
  defenseTime?: string | null;
  onlineDefenseLink?: string | null;
}

interface Props {
  milestones: RoadmapMilestone[];
  lang: 'he' | 'en';
  isRtl: boolean;
}

// Duplicated locally rather than imported — this repo's own convention is a
// small per-screen/per-component copy since a milestone type can also be a
// faculty-defined `custom_xxxxx` string none of these maps cover (see web's
// app/student/home/types.ts's own comment on MILESTONE_LABEL).
const MILESTONE_TYPE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר', en: 'Research Proposal' },
  progress_report: { he: 'דו"ח התקדמות', en: 'Progress Report' },
  final_report: { he: 'דו"ח מסכם', en: 'Final Report' },
  defense: { he: 'הגנה', en: 'Defense' },
  poster: { he: 'פוסטר', en: 'Poster Session' },
};

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: string; he: string; en: string }> = {
  pending: { color: p.outline, bg: p.surfaceVariant, icon: '⏳', he: 'ממתין', en: 'Pending' },
  submitted: { color: '#b8862e', bg: '#fbf3e3', icon: '📤', he: 'הוגש', en: 'Submitted' },
  rejected: { color: p.error, bg: p.errorContainer, icon: '❌', he: 'הוחזר לתיקון', en: 'Returned' },
  supervisor_graded: { color: '#3e6c8c', bg: '#e9f0f5', icon: '👨‍🏫', he: 'נוקד ע"י מנחה', en: 'Supervisor Graded' },
  graded: { color: '#3e6c8c', bg: '#e9f0f5', icon: '👨‍🏫', he: 'נוקד', en: 'Graded' },
  coordinator_approved: { color: p.primary, bg: '#e3e8f7', icon: '✅', he: 'אושר', en: 'Approved' },
  examiners_assigned: { color: '#736b8c', bg: '#edebf2', icon: '👥', he: 'בוחנים הוקצו', en: 'Examiners Assigned' },
  examiner_graded: { color: p.success, bg: p.successContainer, icon: '🎓', he: 'נוקד ע"י בוחן', en: 'Examiner Graded' },
  both_examiners_graded: { color: p.success, bg: p.successContainer, icon: '🎓', he: 'שני הבוחנים ניקדו', en: 'Both Graded' },
  awaiting_defense_date: { color: '#b8862e', bg: '#fbf3e3', icon: '📅', he: 'ממתין לתאריך', en: 'Awaiting Date' },
  date_conflict: { color: p.error, bg: p.errorContainer, icon: '⚠️', he: 'התנגשות מועדים', en: 'Date Conflict' },
  defense_date_set: { color: '#736b8c', bg: '#edebf2', icon: '📌', he: 'מועד הגנה נקבע', en: 'Date Set' },
  scheduled: { color: p.success, bg: p.successContainer, icon: '🎓', he: 'מתוזמן', en: 'Scheduled' },
  completed: { color: p.success, bg: p.successContainer, icon: '🏁', he: 'הושלם', en: 'Completed' },
};

function isCompletedStatus(status: string): boolean {
  return status === 'coordinator_approved' || status === 'completed';
}

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(v: string | null | undefined, lang: 'he' | 'en'): string {
  const d = toDate(v);
  return d ? d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

// Milestone file URLs carry no separate filename field — derive a
// human-readable one from the URL itself, same approach as web's
// components/MilestoneTimeline.tsx fileNameFromUrl.
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

export function MilestoneRoadmap({ milestones, lang, isRtl }: Props) {
  if (milestones.length === 0) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyIcon}>📋</Text>
        <Text style={s.emptyText}>
          {lang === 'he'
            ? 'אבני הדרך ייווצרו אוטומטית עם אישור הסטודנט לפרויקט.'
            : 'Milestones will be created automatically when the student is approved.'}
        </Text>
      </View>
    );
  }

  const completed = milestones.filter((m) => isCompletedStatus(m.status)).length;
  const progress = Math.round((completed / milestones.length) * 100);
  const firstIncompleteIndex = milestones.findIndex((m) => !isCompletedStatus(m.status));

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={s.progressCard}>
        <View style={[s.rowBetween, isRtl && s.rowReverse]}>
          <Text style={s.progressTitle}>{lang === 'he' ? 'התקדמות הפרויקט' : 'Project Progress'}</Text>
          <Text style={s.progressPct}>{progress}%</Text>
        </View>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={[s.progressSub, isRtl && s.textRight]}>
          <Text style={{ writingDirection: 'ltr' }}>{completed} / {milestones.length}</Text>{' '}
          {lang === 'he' ? 'אבני דרך הושלמו' : 'milestones completed'}
        </Text>
      </View>

      {milestones.map((m, i) => {
        const isCompleted = isCompletedStatus(m.status);
        const isCurrent = !isCompleted && i === firstIncompleteIndex;
        const isFuture = !isCompleted && !isCurrent;
        const cfg = STATUS_CONFIG[m.status] ?? { color: p.outline, bg: p.surfaceVariant, icon: '❔', he: m.status, en: m.status };
        const label = MILESTONE_TYPE_LABEL[m.type]?.[lang] ?? m.type;
        const isDefense = m.type === 'defense';

        return (
          <View
            key={m.id}
            style={[
              s.card,
              { borderLeftColor: cfg.color, borderLeftWidth: 4 },
              isCurrent && s.cardCurrent,
              isFuture && s.cardFuture,
            ]}
          >
            <View style={[s.rowBetween, { alignItems: 'flex-start' }, isRtl && s.rowReverse]}>
              <View style={[s.cardHeaderLeft, isRtl && s.rowReverse]}>
                <View
                  style={[
                    s.stepCircle,
                    isFuture
                      ? { borderWidth: 2, borderColor: cfg.color, backgroundColor: p.surface }
                      : { backgroundColor: isCompleted ? p.success : cfg.color },
                  ]}
                >
                  <Text style={[s.stepCircleText, isFuture && { color: cfg.color }]}>{isCompleted ? '✓' : i + 1}</Text>
                </View>
                <Text style={[s.cardTitle, isRtl && s.textRight]} numberOfLines={2}>
                  {label}
                </Text>
              </View>
              <View style={[s.badge, { backgroundColor: cfg.bg }]}>
                <Text style={[s.badgeText, { color: cfg.color }]}>
                  {cfg.icon} {lang === 'he' ? cfg.he : cfg.en}
                </Text>
              </View>
            </View>

            <View style={[s.statsGrid, isRtl && s.rowReverse]}>
              <View style={s.statCell}>
                <Text style={[s.statLabel, isRtl && s.textRight]}>{lang === 'he' ? 'תאריך יעד' : 'Due Date'}</Text>
                <Text style={[s.statValue, isRtl && s.textRight]}>📅 {formatDate(m.dueDate, lang)}</Text>
              </View>
              {!!m.submittedAt && (
                <View style={s.statCell}>
                  <Text style={[s.statLabel, isRtl && s.textRight]}>{lang === 'he' ? 'הוגש' : 'Submitted'}</Text>
                  <Text style={[s.statValue, isRtl && s.textRight]}>📤 {formatDate(m.submittedAt, lang)}</Text>
                </View>
              )}
              {m.finalGrade != null && (
                <View style={s.statCell}>
                  <Text style={[s.statLabel, isRtl && s.textRight]}>{lang === 'he' ? 'ציון סופי' : 'Final Grade'}</Text>
                  <Text style={[s.statValue, s.statValueStrong, isRtl && s.textRight]}>🏆 {m.finalGrade}</Text>
                </View>
              )}
            </View>

            {isDefense && !!m.defenseDate && (
              <Text style={[s.defenseText, isRtl && s.textRight]}>
                🎓 {formatDate(m.defenseDate, lang)}
                {m.defenseTime ? `  ·  🕐 ${m.defenseTime}` : ''}
                {m.defenseBuilding ? `  ·  🏢 ${m.defenseBuilding}` : ''}
                {m.defenseRoom ? `  ·  🏛️ ${m.defenseRoom}` : ''}
              </Text>
            )}
            {isDefense && !!m.onlineDefenseLink && (
              <Pressable onPress={() => Linking.openURL(m.onlineDefenseLink!)} accessibilityRole="link">
                <Text style={[s.linkText, isRtl && s.textRight]}>💻 {lang === 'he' ? 'הצטרפות מקוונת' : 'Join online'}</Text>
              </Pressable>
            )}

            {!!m.fileUrls?.length && (
              <View style={{ marginTop: spacing.sm }}>
                <Text style={[s.statLabel, isRtl && s.textRight]}>{lang === 'he' ? 'קבצים שהוגשו' : 'Submitted Files'}</Text>
                <View style={[s.filesRow, isRtl && s.rowReverse]}>
                  {m.fileUrls.map((url, idx) => (
                    <Pressable key={idx} onPress={() => Linking.openURL(url)} style={s.fileChip} accessibilityRole="link">
                      <Text style={s.fileChipText} numberOfLines={1}>
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
  );
}

const s = StyleSheet.create({
  empty: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: p.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: p.outlineVariant,
  },
  emptyIcon: { fontSize: 28, marginBottom: 8 },
  emptyText: { fontSize: 13, color: p.onSurfaceVariant, textAlign: 'center', paddingHorizontal: 24 },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  rowReverse: { flexDirection: 'row-reverse' },
  textRight: { textAlign: 'right' },

  progressCard: { backgroundColor: p.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: p.outlineVariant, padding: spacing.md },
  progressTitle: { fontSize: 12, fontWeight: '700', color: p.onSurface, textTransform: 'uppercase' },
  progressPct: { fontSize: 12, fontWeight: '700', color: p.onSurfaceVariant },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: p.surfaceContainer, overflow: 'hidden', marginTop: 8 },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: p.primary },
  progressSub: { fontSize: 11, color: p.onSurfaceVariant, marginTop: 6 },

  card: { backgroundColor: p.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: p.outlineVariant, padding: spacing.md },
  cardCurrent: { borderColor: p.primary, borderWidth: 2 },
  cardFuture: { opacity: 0.75 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1, paddingRight: 8 },
  stepCircle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepCircleText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: p.onSurface, flexShrink: 1 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: p.outlineVariant },
  statCell: { minWidth: '30%' },
  statLabel: { fontSize: 9, fontWeight: '700', color: p.onSurfaceVariant, textTransform: 'uppercase', marginBottom: 2 },
  statValue: { fontSize: 12, color: p.onSurface },
  statValueStrong: { fontWeight: '700' },

  defenseText: { fontSize: 12, color: p.onSurface, marginTop: 10 },
  linkText: { fontSize: 12, color: p.primary, marginTop: 4, textDecorationLine: 'underline' },

  filesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: p.outlineVariant,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: p.surfaceContainerLow,
    maxWidth: 220,
  },
  fileChipText: { fontSize: 11, color: p.onSurface },
});
