// app/notifications/types.ts

import { getHomeRoute, type AppRole } from '@/lib/roles';

export interface Notif {
  id: string;
  type: string;
  titleHe: string;
  titleEn: string;
  bodyHe: string;
  bodyEn: string;
  isRead: boolean;
  createdAt: string;
  relatedProjectId: string | null;
  relatedMilestoneId: string | null;
  chatId?: string | null;
  senderName?: string | null;
}

export interface ChatRow {
  chatId: string;
  otherUid: string;
  otherName: string;
  otherRole: string;
  lastMessage: string;
  updatedAt: string | null;
  unreadCount: number;
}

export const TYPE_STYLE: Record<string, { icon: string; color: string; bg: string }> = {
  project_published: { icon: '📢', color: '#3E6C8C', bg: '#E9F0F5' },
  application_received: { icon: '📥', color: '#3E6C8C', bg: '#E9F0F5' },
  application_approved: { icon: '✅', color: 'var(--success)', bg: 'var(--success-bg)' },
  application_rejected: { icon: '❌', color: 'var(--danger)', bg: 'var(--danger-bg)' },
  meeting_requested: { icon: '📅', color: 'var(--accent)', bg: '#FBF3E3' },
  milestone_graded: { icon: '✏️', color: '#6E5A99', bg: '#EFEBF6' },
  milestone_deadline_7d: { icon: '⏰', color: 'var(--accent)', bg: '#FBF3E3' },
  milestone_deadline_1d: { icon: '🚨', color: 'var(--danger)', bg: 'var(--danger-bg)' },
  milestone_overdue: { icon: '⏰', color: 'var(--danger)', bg: 'var(--danger-bg)' },
  account_created: { icon: '🎓', color: '#3E6C8C', bg: '#E9F0F5' },
  broadcast: { icon: '📢', color: 'var(--danger)', bg: 'var(--danger-bg)' },
  new_message: { icon: '💬', color: '#3E6C8C', bg: '#E9F0F5' },
};

// Shows a bare time (e.g. "14:30") for notifications from today, since the
// date is already redundant with that day's own date-group header — and a
// full date (e.g. "3 Aug") for anything older. Same fix as mobile's
// rowTimestamp (mobile/app/(tabs)/notifications.tsx).
export function rowTimestamp(ts: string, lang: 'he' | 'en'): string {
  const date = new Date(ts);
  if (isNaN(date.getTime())) return '';
  const isToday = date.toDateString() === new Date().toDateString();
  if (isToday) {
    return date.toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short' });
}

export function relativeTime(ts: string | null | undefined, lang: 'he' | 'en'): string {
  if (!ts) return '';
  const ms = new Date(ts).getTime();
  if (isNaN(ms)) return '';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (lang === 'he') {
    if (mins < 1) return 'עכשיו';
    if (mins < 60) return `${mins}ד'`;
    if (hrs < 24) return `${hrs}ש'`;
    if (days < 7) return `${days}י'`;
    return new Date(ts).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  }
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (hrs < 24) return `${hrs}h`;
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Shared by app/notifications/page.tsx's tap handler and the [id] detail
// page's own next/previous navigation, so a sibling notification opened via
// those buttons gets the exact same "Go to dashboard" target as one opened
// fresh from this list.
export function computeNotifTargetRoute(type: string, role: AppRole | undefined): string {
  switch (type) {
    case 'project_published':
    case 'application_approved':
    case 'application_rejected':
    case 'meeting_requested':
    case 'milestone_graded':
    case 'milestone_deadline_7d':
    case 'milestone_deadline_1d':
    case 'milestone_overdue':
      // Always student-directed types.
      return '/student/home';
    case 'application_received':
    case 'account_created':
      // Recipient can be any role — route to whichever home matches theirs.
      return getHomeRoute(role);
    default:
      return '';
  }
}

export function initials(name: string): string {
  return (
    name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}
