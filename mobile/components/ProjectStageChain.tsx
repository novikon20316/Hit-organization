// components/ProjectStageChain.tsx
// Additive per-student "stages of the project" view — mirrors
// web/components/ProjectStageChain.tsx. Groups a student's real milestones
// (whatever the faculty's workflow template actually configured) into four
// visual buckets: Supervisor & Topic Approval (synthetic — implied by the
// project/enrollment existing, no separate milestone doc for it),
// Pre-Project Approval, Milestones, and Final Submission. No new schema —
// every field here already exists server-side (percentOfFinalGrade/
// dueDate/submittedAt per milestone, createdAt on the project). Rendered
// BELOW whatever per-student view a screen already has — see
// ProjectWorkflowSection.tsx and app/coordinator/home.tsx, its two call sites.

import React from 'react';
import { View, Text } from 'react-native';
import type { Lang } from './i18n';

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

interface Props {
  lang: Lang;
  createdAt?: string | null;
  milestones: StageChainMilestone[];
}

const FALLBACK_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר', en: 'Research Proposal' },
  progress_report: { he: 'דו"ח התקדמות', en: 'Progress Report' },
  final_report: { he: 'דו"ח מסכם', en: 'Final Report' },
  defense: { he: 'הגנה', en: 'Defense' },
  poster: { he: 'פוסטר', en: 'Poster Session' },
};

const PRE_PROJECT_TYPES = new Set(['research_proposal', 'track_selection', 'specification']);
const FINAL_TYPES = new Set(['final_report', 'defense', 'closure', 'judgment', 'submit_for_judgment', 'oral_exam']);

function bucketFor(type: string): 'preProject' | 'milestones' | 'final' {
  if (PRE_PROJECT_TYPES.has(type)) return 'preProject';
  if (FINAL_TYPES.has(type)) return 'final';
  return 'milestones';
}

function statusInfo(status: string, lang: Lang) {
  if (status === 'coordinator_approved' || status === 'completed') {
    return { icon: '✓', color: '#10B981', bg: '#DCFCE7', label: lang === 'he' ? 'אושר' : 'Approved' };
  }
  if (status === 'submitted' || status === 'supervisor_graded' || status === 'graded') {
    return { icon: '⏳', color: '#F59E0B', bg: '#FEF3C7', label: lang === 'he' ? 'הועבר לאישור' : 'Forwarded for approval' };
  }
  if (status === 'rejected') {
    return { icon: '↩', color: '#EF4444', bg: '#FEE2E2', label: lang === 'he' ? 'הוחזר לתיקון' : 'Returned for revision' };
  }
  return { icon: '⏳', color: '#94A3B8', bg: '#F1F0EC', label: lang === 'he' ? 'עתידי' : 'Upcoming' };
}

function formatDate(iso: string | null | undefined, lang: Lang): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ProjectStageChain({ lang, createdAt, milestones }: Props) {
  const groups: { key: string; titleHe: string; titleEn: string; rows: (StageChainMilestone & { syntheticDate?: string | null })[] }[] = [
    {
      key: 'topicApproval',
      titleHe: 'אישור מנחה ונושא',
      titleEn: 'Supervisor & Topic Approval',
      rows: createdAt ? [{ type: '__topic_approval__', status: 'coordinator_approved', syntheticDate: createdAt }] : [],
    },
    { key: 'preProject', titleHe: 'קדם אישור פרויקט', titleEn: 'Pre-Project Approval', rows: milestones.filter((m) => bucketFor(m.type) === 'preProject') },
    { key: 'milestones', titleHe: 'אבני דרך', titleEn: 'Milestones', rows: milestones.filter((m) => bucketFor(m.type) === 'milestones') },
    { key: 'final', titleHe: 'הגשת פרויקט', titleEn: 'Final Submission', rows: milestones.filter((m) => bucketFor(m.type) === 'final') },
  ].filter((g) => g.rows.length > 0);

  if (groups.length === 0) return null;

  return (
    <View style={{ marginTop: 10, gap: 8 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: '#94A3B8' }}>
        {lang === 'he' ? 'שלבי הפרויקט' : 'Project Stages'}
      </Text>
      {groups.map((g) => {
        const allApproved = g.rows.every((r) => r.status === 'coordinator_approved' || r.status === 'completed');
        return (
          <View key={g.key} style={{ borderRadius: 10, backgroundColor: '#FAFAFA', borderWidth: 1, borderColor: '#E2E8F0', padding: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B' }}>{lang === 'he' ? g.titleHe : g.titleEn}</Text>
              <View
                style={{
                  width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: allApproved ? '#10B981' : '#F59E0B',
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>{allApproved ? '✓' : g.rows.length}</Text>
              </View>
            </View>
            <View style={{ gap: 6 }}>
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
                  <View
                    key={`${m.type}-${idx}`}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRadius: 8, backgroundColor: '#fff', padding: 8 }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#1E293B' }} numberOfLines={1}>{label}</Text>
                      {date && (
                        <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
                          {isDone ? (lang === 'he' ? 'תאריך ביצוע: ' : 'Completed: ') : (lang === 'he' ? 'תאריך יעד: ' : 'Due: ')}
                          {date}
                        </Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {typeof m.percentOfFinalGrade === 'number' && m.percentOfFinalGrade > 0 && (
                        <View style={{ borderRadius: 20, backgroundColor: '#EDE9FE', paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: '#7C3AED' }}>
                            {lang === 'he' ? `משקל ${m.percentOfFinalGrade}` : `${m.percentOfFinalGrade}% weight`}
                          </Text>
                        </View>
                      )}
                      {typeof m.grade === 'number' && (
                        <View style={{ borderRadius: 20, backgroundColor: '#EDE9FE', paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: '#7C3AED' }}>
                            {lang === 'he' ? `ציון ${m.grade}` : `Grade ${m.grade}`}
                          </Text>
                        </View>
                      )}
                      <View style={{ borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: info.bg }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: info.color }}>
                          {info.icon} {info.label}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}
