// app/notifications/types.ts

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
  application_approved: { icon: '✅', color: 'var(--success)', bg: 'var(--success-bg)' },
  application_rejected: { icon: '❌', color: 'var(--danger)', bg: 'var(--danger-bg)' },
  meeting_requested: { icon: '📅', color: 'var(--accent)', bg: '#FBF3E3' },
  milestone_graded: { icon: '✏️', color: '#6E5A99', bg: '#EFEBF6' },
  milestone_deadline_7d: { icon: '⏰', color: 'var(--accent)', bg: '#FBF3E3' },
  milestone_deadline_1d: { icon: '🚨', color: 'var(--danger)', bg: 'var(--danger-bg)' },
  broadcast: { icon: '📢', color: 'var(--danger)', bg: 'var(--danger-bg)' },
  new_message: { icon: '💬', color: '#3E6C8C', bg: '#E9F0F5' },
};

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
