// components/QuickTasksPanel.tsx
// "What needs my attention" summary for the supervisor dashboard — ports
// web/app/supervisor/dashboard/QuickTasksPanel.tsx. Built from data the
// dashboard already loaded (no new API calls), in the same order as web:
// committee reviews (substitute members only), submissions awaiting grading
// (oldest first), projects with a red/orange deadline (soonest first), then
// the oldest pending applications — capped at 3 items. Each row only
// navigates (switches tab / expands the card); every action it leads to is
// the dashboard's existing one with its existing checks.
// One exception to "no new API calls": committee reviews, fetched only for a
// supervisor with no higher role who's been substituted onto a committee
// (same gate as web — see firebase/roles.ts's isSupervisorWithoutHigherRole).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { apiClient, type CommitteePendingReview } from '@/src/api/apiClient';
import { useNotifications } from '@/src/context/NotificationsContext';
import { useActiveRole } from '@/contexts/ActiveRoleContext';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import { isSupervisorWithoutHigherRole } from '@/firebase/roles';
import { ap } from '@/constants/theme';
import type { Lang } from './i18n';
import type { Application, MyProject } from '@/types';

/** The fields this panel reads off a pending-grade row — the supervisor
 *  dashboard keeps its own richer PendingMilestone type. */
interface PendingGradeLike {
  id: string;
  projectTitleHe: string;
  projectTitleEn: string;
  submittedAt?: unknown;
}

const URGENCY_ICON: Record<'red' | 'orange', string> = { red: '🔴', orange: '🟠' };
const URGENCY_TEXT: Record<'red' | 'orange', string> = { red: '#a8433a', orange: '#b8862e' };

function toMs(v: unknown): number {
  if (!v) return 0;
  if (typeof v === 'object' && v !== null && 'seconds' in v) return Number((v as { seconds: number }).seconds) * 1000;
  const t = new Date(v as string).getTime();
  return Number.isNaN(t) ? 0 : t;
}

interface Item {
  key: string;
  icon: string;
  color: string;
  label: string;
  title: string;
  sub: string;
  onPress: () => void;
}

interface Props<T extends PendingGradeLike> {
  lang: Lang;
  myProjects: MyProject[];
  applications: Application[];
  pendingGrades: T[];
  /** Display name for a pending milestone — the dashboard's own
   *  milestoneDisplayName(m, lang, MILESTONE_LABEL). */
  milestoneLabel: (m: T) => string;
  onOpenGrade: (m: T) => void;
  onOpenProject: (p: MyProject) => void;
  onOpenApplications: () => void;
  onOpenCommittees: () => void;
}

export function QuickTasksPanel<T extends PendingGradeLike>({ lang, myProjects, applications, pendingGrades, milestoneLabel, onOpenGrade, onOpenProject, onOpenApplications, onOpenCommittees }: Props<T>) {
  const he = lang === 'he';
  const { roles } = useActiveRole();
  const { isCommitteeSubstitute } = useNotifications();
  const showCommittee = isCommitteeSubstitute && isSupervisorWithoutHigherRole(roles);
  const [committeeReviews, setCommitteeReviews] = useState<CommitteePendingReview[]>([]);

  const fetchCommitteeReviews = useCallback(() => {
    if (!showCommittee) return;
    apiClient.getMyPendingCommitteeReviews().then((r) => setCommitteeReviews(r.reviews)).catch(() => setCommitteeReviews([]));
  }, [showCommittee]);
  useEffect(fetchCommitteeReviews, [fetchCommitteeReviews]);
  useLiveRefresh(fetchCommitteeReviews);

  const gradesAwaitingReview = pendingGrades.slice().sort((a, b) => toMs(a.submittedAt) - toMs(b.submittedAt));

  const urgentProjects = myProjects
    .filter((p) => p.currentMilestone?.urgency === 'red' || p.currentMilestone?.urgency === 'orange')
    .sort((a, b) => (a.currentMilestone!.daysLeft ?? 0) - (b.currentMilestone!.daysLeft ?? 0));

  const pendingApps = applications
    .filter((a) => a.status === 'applied')
    .sort((a, b) => toMs(a.submittedAt) - toMs(b.submittedAt));

  const items: Item[] = [
    ...(showCommittee ? committeeReviews : []).map((r) => ({
      key: `c-${r.milestoneId}`,
      icon: '🧑‍⚖️',
      color: URGENCY_TEXT.red,
      label: he ? 'בדיקת ועדה ממתינה' : 'Committee review pending',
      title: he ? r.projectTitleHe : r.projectTitleEn,
      sub: he ? `${r.voteCount}/${r.memberCount} הצביעו` : `${r.voteCount}/${r.memberCount} voted`,
      onPress: onOpenCommittees,
    })),
    ...gradesAwaitingReview.map((m) => ({
      key: `g-${m.id}`,
      icon: URGENCY_ICON.red,
      color: URGENCY_TEXT.red,
      label: he ? 'ציון ממתין לבדיקה' : 'Grade pending review',
      title: milestoneLabel(m),
      sub: he ? m.projectTitleHe : m.projectTitleEn,
      onPress: () => onOpenGrade(m),
    })),
    ...urgentProjects.map((p) => {
      const urgency = p.currentMilestone!.urgency as 'red' | 'orange';
      const daysLeft = p.currentMilestone!.daysLeft;
      return {
        key: `p-${p.id}`,
        icon: URGENCY_ICON[urgency],
        color: URGENCY_TEXT[urgency],
        label: he ? p.currentMilestone!.nameHe : p.currentMilestone!.nameEn,
        title: he ? p.titleHe : p.titleEn,
        sub:
          daysLeft === null
            ? ''
            : daysLeft < 0
              ? he ? `באיחור של ${Math.abs(daysLeft)} ימים` : `${Math.abs(daysLeft)} days overdue`
              : he ? `${daysLeft} ימים נותרו` : `${daysLeft} days left`,
        onPress: () => onOpenProject(p),
      };
    }),
    ...pendingApps.map((a) => ({
      key: `a-${a.id}`,
      icon: '📨',
      color: ap.secondary,
      label: he ? 'מועמדות ממתינה' : 'New Applicant',
      title: a.studentName || (he ? 'שם לא זמין' : 'Name unavailable'),
      sub: he ? a.projectTitleHe : a.projectTitleEn,
      onPress: onOpenApplications,
    })),
  ].slice(0, 3);

  const align = he ? 'right' : 'left';

  return (
    <View style={{ marginBottom: 14, borderRadius: 14, borderWidth: 1, borderColor: ap.outlineVariant, backgroundColor: '#fff', padding: 14 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: ap.onSurface, textAlign: align, paddingBottom: 8, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: ap.outlineVariant }}>
        {he ? 'משימות מהירות' : 'Quick Tasks'}
      </Text>
      {items.length === 0 ? (
        <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, textAlign: align }}>{he ? 'אין משימות דחופות כרגע' : 'Nothing urgent right now'}</Text>
      ) : (
        items.map((item, i) => (
          <Pressable
            key={item.key}
            onPress={item.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${item.label}: ${item.title}${item.sub ? `, ${item.sub}` : ''}`}
            style={({ pressed }) => ({
              flexDirection: he ? 'row-reverse' : 'row',
              alignItems: 'flex-start',
              gap: 8,
              paddingVertical: 8,
              borderTopWidth: i > 0 ? 1 : 0,
              borderTopColor: ap.outlineVariant,
              borderStyle: 'dashed',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ marginTop: 1 }}>{item.icon}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: item.color, textAlign: align }} numberOfLines={1}>{item.label}</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: ap.onSurface, textAlign: align }} numberOfLines={1}>{item.title}</Text>
              {item.sub ? <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, textAlign: align }} numberOfLines={1}>{item.sub}</Text> : null}
            </View>
          </Pressable>
        ))
      )}
    </View>
  );
}
