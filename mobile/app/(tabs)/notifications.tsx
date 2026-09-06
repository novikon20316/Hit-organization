// app/(tabs)/notifications.tsx  — shared screen for ALL roles
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Animated, FlatList, Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context'
import { collection, query, where, orderBy, limit, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { auth, db } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';
import NewChatSheet from '../message/new';
import { apiClient } from '../../src/api/apiClient';
import { useNotifications } from '../../src/context/NotificationsContext';
import FeedbackChat from '../../components/FeedbackChat';
import { NotificationsStyles, NotificationsRowStyles, ChatRowStyles } from '../../constants/styles';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Notif {
  id:                 string;
  type:               string;
  titleHe:            string;
  titleEn:            string;
  bodyHe:             string;
  bodyEn:             string;
  isRead:             boolean;
  createdAt:          string;
  relatedProjectId:   string | null;
  relatedMilestoneId: string | null;
  chatId?:            string | null;
  senderName?:        string | null;
  /** Semantic screen key set server-side at creation time (see
   *  server/src/services/notificationTargets.ts) — resolved via
   *  TARGET_SCREEN_ROUTE above. Older notifications won't have it;
   *  computeNotifTargetRoute falls back to its by-type switch for those. */
  targetScreen?:      string | null;
}

interface ChatRow {
  chatId:        string;
  otherUid:      string;
  otherName:     string;
  otherRole:     string;
  lastMessage:   string;
  updatedAt:     string | null;
  unreadCount:   number;
  deletedBy:     string[];   // uids who soft-deleted this chat
  participants:  string[];
}

// ─── Notification type → icon + color ────────────────────────────────────────

export const TYPE_STYLE: Record<string, { icon: string; color: string; bg: string }> = {
  project_published:      { icon: '📢', color: '#2E86FF', bg: '#EFF6FF' },
  application_received:   { icon: '📥', color: '#2E86FF', bg: '#EFF6FF' },
  application_approved:   { icon: '✅', color: '#10B981', bg: '#ECFDF5' },
  application_rejected:   { icon: '❌', color: '#EF4444', bg: '#FEF2F2' },
  meeting_requested:      { icon: '📅', color: '#F97316', bg: '#FFF7ED' },
  milestone_graded:       { icon: '✏️', color: '#8B5CF6', bg: '#F5F3FF' },
  milestone_deadline_7d:  { icon: '⏰', color: '#F59E0B', bg: '#FFFBEB' },
  milestone_deadline_1d:  { icon: '🚨', color: '#EF4444', bg: '#FEF2F2' },
  milestone_overdue:      { icon: '⏰', color: '#EF4444', bg: '#FEF2F2' },
  milestone_submitted:    { icon: '📤', color: '#2E86FF', bg: '#EFF6FF' },
  account_created:        { icon: '🎓', color: '#2E86FF', bg: '#EFF6FF' },
  broadcast:              { icon: '📢', color: '#EF4444', bg: '#FEF2F2' },
  new_message:            { icon: '💬', color: '#2E86FF', bg: '#EFF6FF' },
};

export function roleHomeRoute(role: string | null): string {
  switch (role) {
    case 'student':                  return '/student/home';
    case 'supervisor':
    case 'secondary_supervisor':     return '/supervisor/dashboard';
    case 'internal_examiner':        return '/examinor/home';
    case 'coordinator':              return '/coordinator/home';
    case 'faculty_admin':            return '/faculty_admin/dashboard';
    case 'program_head':             return '/program_head/program_head_dashboard';
    case 'administrative_secretary': return '/administrative_coordinator/administrative_coordinator_dashboard';
    case 'grad_school_head':         return '/grad_school_head/grad_school_head_dashboard';
    case 'system_admin':             return '/admin/overview';
    default:                         return '/(auth)/login';
  }
}

// Resolves a semantic targetScreen key (see server/src/services/
// notificationTargets.ts) to an actual mobile route. Kept separate from
// web's own lookup table (web/app/notifications/types.ts) since the two
// don't always spell the same tab the same way — e.g. the internal
// examiner's default tab is 'projects' here but 'defenses' on web — and
// mobile has no /committees screen at all, so that key is simply omitted
// (falls through to no destination rather than a dead link).
const TARGET_SCREEN_ROUTE: Record<string, string> = {
  coordinator_pending: '/coordinator/home?tab=pending',
  coordinator_signoffs: '/coordinator/home?tab=signoffs',
  coordinator_deadlines: '/coordinator/home?tab=deadlines',
  coordinator_defense: '/coordinator/home?tab=defense',
  coordinator_archived: '/coordinator/home?tab=archived',
  admin_coordinator_overrides: '/administrative_coordinator/administrative_coordinator_dashboard?tab=overrides',
  supervisor_applications: '/supervisor/dashboard?tab=applications',
  supervisor_signoffs: '/supervisor/dashboard?tab=signoffs',
  supervisor_projects: '/supervisor/dashboard?tab=projects',
  faculty_admin_projects: '/faculty_admin/dashboard?tab=projects',
  faculty_admin_signoffs: '/faculty_admin/dashboard?tab=signoffs',
  faculty_admin_deadlines: '/faculty_admin/dashboard?tab=deadlines',
  program_head_approvals: '/program_head/program_head_dashboard?tab=approvals',
  grad_school_head_approvals: '/grad_school_head/grad_school_head_dashboard?tab=approvals',
  grad_school_head_examiners: '/grad_school_head/grad_school_head_dashboard?tab=examiners',
  examiner_defenses: '/examinor/home?tab=projects',
  examiner_schedule: '/examinor/home?tab=schedule',
  admin_panel_milestones: '/admin/panel?tab=milestones',
  admin_panel_signoffs: '/admin/panel?tab=signoffs',
  admin_panel_feedback: '/admin/panel?tab=feedback',
  login_security: '/login-security',
};

// Shared by handleTapNotif below and the [id] detail screen's own
// next/previous navigation, so a sibling notification opened via those
// buttons gets the exact same "Go to dashboard" target as one opened fresh
// from this list.
export function computeNotifTargetRoute(type: string, role: string | null, targetScreen?: string | null): string {
  if (targetScreen && TARGET_SCREEN_ROUTE[targetScreen]) return TARGET_SCREEN_ROUTE[targetScreen];
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
    case 'milestone_submitted':
      // Recipient can be any role (supervisor, coordinator, administrative
      // coordinator) — route to whichever home matches theirs. Notifications
      // of these types written before targetScreen existed fall back here.
      return roleHomeRoute(role);
    default:
      return '';
  }
}

const ROLE_COLOR: Record<string, string> = {
  student:       '#2E86FF',
  supervisor:    '#10B981',
  examiner:      '#8B5CF6',
  coordinator:   '#F59E0B',
  faculty_admin: '#EF4444',
  system_admin:  '#111827',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────


function relativeTime(ts: string | null | undefined, lang: Lang): string {
  if (!ts) return '';
  const timestampMillis = new Date(ts).getTime();
  if (isNaN(timestampMillis)) return '';
  const diff = Date.now() - timestampMillis;
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (lang === 'he') {
    if (mins < 1)  return 'עכשיו';
    if (mins < 60) return `${mins}ד'`;
    if (hrs  < 24) return `${hrs}ש'`;
    if (days < 7)  return `${days}י'`;
    return new Date(ts).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });  
  }
  if (mins < 1)  return 'now';
  if (mins < 60) return `${mins}m`;
  if (hrs  < 24) return `${hrs}h`;
  if (days < 7)  return `${days}d`;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Shows a bare time (e.g. "14:30") for notifications from today, since the
// date is already redundant with that day's "Today" section header — and a
// full date (e.g. "3 Aug") for anything older, since those rows aren't
// grouped under a dated header the same way.
function rowTimestamp(ts: string, lang: Lang): string {
  const date = new Date(ts);
  if (isNaN(date.getTime())) return '';
  const isToday = date.toDateString() === new Date().toDateString();
  if (isToday) {
    return date.toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short' });
}

function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

// Inline error + retry banner — mirrors web's own fix for the same "failed
// fetch looks identical to genuinely empty" problem.
function ErrorBanner({ message, lang, onRetry, dismissible }: { message: string; lang: Lang; onRetry?: () => void; dismissible?: () => void }) {
  return (
    <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, borderWidth: 1, borderColor: '#F2C7C2', padding: 10, marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 12, color: '#A8433A', flex: 1 }}>⚠️ {message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} accessibilityRole="button">
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#A8433A', textDecorationLine: 'underline' }}>{lang === 'he' ? 'נסה שוב' : 'Retry'}</Text>
        </Pressable>
      )}
      {dismissible && (
        <Pressable
          onPress={dismissible}
          style={{ marginLeft: 8 }}
          accessibilityRole="button"
          accessibilityLabel={lang === 'he' ? 'סגור' : 'Dismiss'}
        >
          <Text style={{ fontSize: 14, color: '#A8433A' }}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Animated notification row ────────────────────────────────────────────────

function NotifRow({ notif, lang, isRtl, onPress }: {
  notif: Notif; lang: Lang; isRtl: boolean; onPress: () => void;
}) {
  const style     = TYPE_STYLE[notif.type] ?? TYPE_STYLE.project_published;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{
      opacity:   fadeAnim,
      transform: [{ translateY: slideAnim.interpolate({ inputRange: [0,1], outputRange: [12,0] }) }],
    }}>
      <Pressable
        onPress={onPress}
        style={[
          nr.card,
          !notif.isRead && nr.cardUnread,
          isRtl && nr.cardRtl,
          { borderLeftColor: notif.isRead ? '#E0E8FF' : style.color },
        ]}
        accessibilityRole="button"
      >
        {!notif.isRead && <View style={[nr.unreadDot, { backgroundColor: style.color }]} />}
        <View style={[nr.iconBubble, { backgroundColor: style.bg }]}>
          <Text style={nr.iconText}>{style.icon}</Text>
        </View>
        <View style={[nr.content, isRtl && nr.contentRtl]}>
          <View style={[nr.titleRow, isRtl && nr.rowReverse]}>
            <Text style={[nr.title, isRtl && nr.textRight, !notif.isRead && nr.titleBold]} numberOfLines={1}>
              {lang === 'he' ? notif.titleHe : notif.titleEn}
            </Text>
            <Text style={nr.time}>{rowTimestamp(notif.createdAt, lang)}</Text>
          </View>
          <Text style={[nr.body, isRtl && nr.textRight]} numberOfLines={2}>
            {lang === 'he' ? notif.bodyHe : notif.bodyEn}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Chat row (WhatsApp-style, with long-press delete) ────────────────────────

function ChatRowItem({ chat, lang, isRtl, onPress, onLongPress }: {
  chat: ChatRow; lang: Lang; isRtl: boolean;
  onPress: () => void; onLongPress: () => void;
}) {
  const color = ROLE_COLOR[chat.otherRole] ?? '#9BA8C0';
  return (
    <Pressable
      style={[cr.row, isRtl && cr.rowRtl]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      accessibilityRole="button"
    >
      <View style={[cr.avatar, { backgroundColor: color }]}>
        <Text style={cr.avatarText}>{initials(chat.otherName)}</Text>
      </View>
      <View style={cr.body}>
        <View style={cr.topLine}>
          <Text style={cr.name} numberOfLines={1}>{chat.otherName}</Text>
          <Text style={cr.time}>{relativeTime(chat.updatedAt, lang)}</Text>
        </View>
        <View style={cr.bottomLine}>
          <Text style={[cr.preview, chat.unreadCount > 0 && cr.previewBold]} numberOfLines={1}>
            {chat.lastMessage || (lang === 'he' ? 'אין הודעות' : 'No messages yet')}
          </Text>
          {chat.unreadCount > 0 && (
            <View style={cr.badge}>
              <Text style={cr.badgeText}>{chat.unreadCount > 9 ? '9+' : chat.unreadCount}</Text>
            </View>
          )}
        </View>
        <View style={[cr.rolePill, { backgroundColor: color + '22' }]}>
          <Text style={[cr.roleText, { color }]}>{chat.otherRole.replace('_', ' ')}</Text>
        </View>
      </View>
      {/* Long press hint */}
      <Text style={cr.deleteHint}>⋯</Text>
    </Pressable>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const router = useRouter();
  const uid    = auth.currentUser?.uid;
  const { refresh } = useNotifications();
  const unsubNotifsRef = useRef<(() => void) | null>(null);
  const unsubChatsRef  = useRef<(() => void) | null>(null);

  const [lang,             setLang]             = useState<Lang>('he');
  const [activeTab,        setActiveTab]        = useState<'notifs' | 'chats' | 'feedback'>('notifs');
  const [notifications,    setNotifications]    = useState<Notif[]>([]);
  const [chats,            setChats]            = useState<ChatRow[]>([]);
  const [loadingNotifs,    setLoadingNotifs]    = useState(true);
  const [loadingChats,     setLoadingChats]     = useState(true);
  // Distinct from "genuinely empty" — a failed fetch used to render
  // identically to zero notifications/chats, so a real outage looked like
  // an empty inbox instead of a broken screen (mirrors web's own fix).
  const [notifsError,      setNotifsError]      = useState('');
  const [chatsError,       setChatsError]       = useState('');
  const [actionError,      setActionError]      = useState('');
  const [filter,           setFilter]           = useState<'all' | 'unread'>('all');
  const [userRole,         setUserRole]         = useState<string | null>(null);
  const [chatSheetVisible, setChatSheetVisible] = useState(false);
  const [deletingChatId,   setDeletingChatId]   = useState<string | null>(null);

  const isRtl       = lang === 'he';
  // Chat-originated entries belong to the Messages tab, not Alerts — they're
  // already fully represented there via each chat's own unreadCount, so they're
  // excluded here rather than double-counted/shown in both places.
  const alerts      = notifications.filter((n) => n.type !== 'new_message');
  const unreadCount = alerts.filter((n) => !n.isRead).length;
  const unreadChats = chats.filter((c) => c.unreadCount > 0).length;

  // ── 1. Fetch User Role ──────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) return;

    const fetchUserRole = async () => {
      try {
        // 🚀 REPLACED: Get current user profile from backend
        const response = await apiClient.get('/api/users/profile');
        setUserRole(response.data.role ?? null);
      } catch (err) {
        console.error('Failed fetching user role context:', err);
      }
    };

    fetchUserRole();
  }, [uid]);

  // ── 1. Fetch Notification Inbox & Active Chats ────────────────────────
  // Lifted out of the effect (was an inline const before) so the "Retry"
  // button on ErrorBanner can call the exact same fetch on demand, not just
  // the automatic 30s poll.
  const fetchInboxData = useCallback(async () => {
    if (!uid) return;
    try {
      // 🚀 FIX: Changed from setLoading to setLoadingChats
      setLoadingChats(true);

      const response = await apiClient.get('/api/chats/dashboard');
      const chats = response.data.chats || []
      setChats(chats);
      setChatsError('');
    } catch (err) {
      console.error("Failed compiling chat list feed items:", err);
      setChatsError(lang === 'he' ? 'טעינת השיחות נכשלה' : 'Failed to load conversations');
    } finally {
      // 🚀 FIX: Changed from setLoading to setLoadingChats
      setLoadingChats(false);
    }
  }, [uid, lang]);

  useEffect(() => {
    if (!uid) return;
    fetchInboxData();

    // 💡 Optional background polling setup to fetch updates every 30 seconds since onSnapshot is removed
    const inboxInterval = setInterval(fetchInboxData, 30000);
    return () => clearInterval(inboxInterval);
  }, [uid, fetchInboxData]);

  // Live listener (replaces the old 30s REST poll of /api/notifications/feed)
  // — same idiom used across the app's other listeners (ref + cancel +
  // permission-denied swallowed). `retryTick` exists purely so the existing
  // "Retry" affordance has something to do — onSnapshot itself already
  // auto-reconnects on transient network errors, this just re-attaches from
  // scratch for a genuine permission/config issue.
  const [retryTick, setRetryTick] = useState(0);
  const unsubNotifs = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    if (unsubNotifs.current) { unsubNotifs.current(); unsubNotifs.current = null; }
    if (!uid) return;
    setLoadingNotifs(true);

    const q = query(collection(db, 'notifications'), where('recipientId', '==', uid), orderBy('createdAt', 'desc'), limit(100));
    unsubNotifs.current = onSnapshot(
      q,
      (snapshot) => {
        setNotifications(
          snapshot.docs.map((d) => {
            const data: any = d.data();
            return {
              id: d.id,
              ...data,
              createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt ?? null,
            } as Notif;
          })
        );
        setNotifsError('');
        setLoadingNotifs(false);
      },
      (err: any) => {
        if (err?.code === 'permission-denied') return; // expected during sign-out
        console.error('notifications: live listener error', err);
        setNotifsError(lang === 'he' ? 'טעינת ההתראות נכשלה' : 'Failed to load notifications');
        setLoadingNotifs(false);
      }
    );
    return () => {
      if (unsubNotifs.current) { unsubNotifs.current(); unsubNotifs.current = null; }
    };
  }, [uid, lang, retryTick]);

  const fetchNotifications = useCallback(() => setRetryTick((t) => t + 1), []);

  // ── Delete chat (soft delete for this user) ───────────────────────────────
  const handleDeleteChat = (chatId: string) => {
    Alert.alert(
      lang === 'he' ? 'מחיקת שיחה' : 'Delete Conversation',
      lang === 'he' ? 'האם אתה בטוח שברצונך למחוק שיחה זו?' : 'Are you sure you want to delete this conversation?',
      [
        { text: lang === 'he' ? 'ביטול' : 'Cancel', style: 'cancel' },
        {
          text: lang === 'he' ? 'מחק' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // 🚀 REPLACED: direct deleteDoc removed. Requests the backend to archive/delete the room safely
              await apiClient.delete(`/api/chats/${chatId}`);

              // 💡 OPTIMIZATION: Filter the chat item out of your local array state instantly
              setChats((prev) => prev.filter((c) => c.chatId !== chatId));

              Alert.alert('✅', lang === 'he' ? 'השיחה נמחקה' : 'Conversation deleted');
            } catch (err: any) {
              console.error("Failed to delete conversational thread:", err);
              Alert.alert(
                '❌',
                err.response?.data?.error || (lang === 'he' ? 'מחיקת השיחה נכשלה' : 'Failed to delete chat')
              );
            }
          },
        },
      ],
    );
  };

  // ── Navigation ──────────────────────────────────────────────────────────────
  const goHomeByRole = useCallback(() => {
    unsubNotifsRef.current?.();
    unsubChatsRef.current?.();
    router.replace(roleHomeRoute(userRole) as any);
  }, [userRole]);

  const handleTapNotif = async (notif: Notif) => {
    // Marking as read is a non-critical side effect — a failure here must
    // never block navigation, which is the actual point of tapping a notification.
    if (!notif.isRead) {
      try {
        await apiClient.markNotificationRead(notif.id);
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    }
    refresh();

    if (notif.type === 'new_message') {
      if (notif.chatId) {
        router.push({
          pathname: '/message/[chatId]',
          params: { chatId: notif.chatId, otherName: notif.senderName ?? '', otherRole: '' },
        });
      }
      return;
    }

    // Every other type opens its own full-screen detail view (full title +
    // body) instead of silently jumping straight to a dashboard — that
    // dashboard never showed the notification's actual content anywhere, so
    // the redirect looked like it had no reason behind it.
    const targetRoute = computeNotifTargetRoute(notif.type, userRole, notif.targetScreen);

    router.push({
      pathname: '/notification/[id]',
      params: {
        id:        notif.id,
        type:      notif.type,
        titleHe:   notif.titleHe,
        titleEn:   notif.titleEn,
        bodyHe:    notif.bodyHe,
        bodyEn:    notif.bodyEn,
        createdAt: notif.createdAt,
        targetRoute,
        lang,
      },
    });
  };

  const handleTapChat = (chat: ChatRow) => {
    router.push({
      pathname: '/message/[chatId]',
      params: { chatId: chat.chatId, otherName: chat.otherName, otherRole: chat.otherRole },
    });
  };

  const handleMarkAllRead = async () => {
    try {
      // 🚀 Send a bulk update request to your Node.js backend
      await apiClient.post('/api/notifications/mark-all-read');

      // 💡 Instantly update your local UI state array to set everything to read
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      refresh();
    } catch (err: any) {
      console.error('Failed to mark all notifications as read:', err);
      setActionError(lang === 'he' ? 'סימון הכל כנקרא נכשל' : 'Failed to mark all as read');
    }
  };

  // ── Grouped notifications ────────────────────────────────────────────────────
  const displayed = filter === 'unread'
    ? alerts.filter((n) => !n.isRead)
    : alerts;

  const grouped: Record<string, Notif[]> = {};
  displayed.forEach((n) => {
    if (!n.createdAt) return;
    const date      = new Date(n.createdAt);
    const today     = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    let key: string;
    if (date.toDateString() === today.toDateString()) {
      key = lang === 'he' ? 'היום' : 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      key = lang === 'he' ? 'אתמול' : 'Yesterday';
    } else {
      key = date.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', {
        weekday: 'long', day: 'numeric', month: 'long',
      });
    }
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(n);
  });

  // IDs of chats that are still visible to the current user (not soft-deleted)
  const activeChatIds = new Set(chats.map((c) => c.chatId));

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.root}>

      {/* ── Top header ── */}
      <View style={[s.header, isRtl && s.rowReverse]}>
        <Pressable
          style={s.backBtn}
          onPress={goHomeByRole}
          accessibilityRole="button"
          accessibilityLabel={lang === 'he' ? 'חזרה למסך הבית' : 'Back to home'}
        >
          <Text style={s.backText}>{isRtl ? '→' : '←'}</Text>
        </Pressable>
        <View style={[s.headerCenter, isRtl && s.alignRight]}>
          <Text style={s.headerTitle}>
            {lang === 'he'
              ? (activeTab === 'notifs' ? 'התראות' : activeTab === 'chats' ? 'הודעות' : 'משוב')
              : (activeTab === 'notifs' ? 'Alerts' : activeTab === 'chats' ? 'Messages' : 'Feedback')}
          </Text>
          {activeTab === 'notifs' && unreadCount > 0 && (
            <View style={s.unreadBadge}><Text style={s.unreadBadgeText}>{unreadCount}</Text></View>
          )}
          {activeTab === 'chats' && unreadChats > 0 && (
            <View style={s.unreadBadge}><Text style={s.unreadBadgeText}>{unreadChats}</Text></View>
          )}
        </View>
        <View style={[s.headerRight, isRtl && s.rowReverse]}>
          <Pressable
            style={s.langBtn}
            onPress={() => setLang(lang === 'he' ? 'en' : 'he')}
            accessibilityRole="button"
            accessibilityLabel={lang === 'he' ? 'החלף לאנגלית' : 'Switch to Hebrew'}
          >
            <Text style={s.langText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Tab switcher — full-width flex tabs, not a scroller: with only
          2-3 tabs here (never enough to need scrolling), flex fills the
          screen edge-to-edge instead of leaving dead space or clipping. ── */}
      <View style={[s.tabBar, isRtl && s.rowReverse]}>
        <Pressable
          style={[s.tabBtn, activeTab === 'notifs' && s.tabBtnActive]}
          onPress={() => setActiveTab('notifs')}
          accessibilityRole="button"
        >
          <Text style={[s.tabBtnText, activeTab === 'notifs' && s.tabBtnTextActive]} numberOfLines={1}>
            🔔 {lang === 'he' ? 'התראות' : 'Alerts'}
            {unreadCount > 0 ? ` (${unreadCount})` : ''}
          </Text>
        </Pressable>
        <Pressable
          style={[s.tabBtn, activeTab === 'chats' && s.tabBtnActive]}
          onPress={() => setActiveTab('chats')}
          accessibilityRole="button"
        >
          <Text style={[s.tabBtnText, activeTab === 'chats' && s.tabBtnTextActive]} numberOfLines={1}>
            💬 {lang === 'he' ? 'הודעות' : 'Messages'}
            {unreadChats > 0 ? ` (${unreadChats})` : ''}
          </Text>
        </Pressable>
        {/* Permanent feedback/bug-report chat — every role except system_admin,
            who reviews real feedback in the admin panel instead. */}
        {userRole !== 'system_admin' && (
          <Pressable
            style={[s.tabBtn, activeTab === 'feedback' && s.tabBtnActive]}
            onPress={() => setActiveTab('feedback')}
            accessibilityRole="button"
          >
            <Text style={[s.tabBtnText, activeTab === 'feedback' && s.tabBtnTextActive]} numberOfLines={1}>
              🗨️ {lang === 'he' ? 'משוב' : 'Feedback'}
            </Text>
          </Pressable>
        )}
      </View>

      {actionError && (
        <ErrorBanner message={actionError} lang={lang} dismissible={() => setActionError('')} />
      )}

      {/* ══ NOTIFICATIONS TAB ══ */}
      {activeTab === 'notifs' && (
        <>
          {notifsError && <ErrorBanner message={notifsError} lang={lang} onRetry={fetchNotifications} />}
          <View style={[s.toolbar, isRtl && s.rowReverse]}>
            <View style={[s.filters, isRtl && s.rowReverse]}>
              {(['all', 'unread'] as const).map((f) => (
                <Pressable
                  key={f}
                  style={[s.filterChip, filter === f && s.filterChipActive]}
                  onPress={() => setFilter(f)}
                  accessibilityRole="button"
                >
                  <Text style={[s.filterText, filter === f && s.filterTextActive]}>
                    {f === 'all'
                      ? (lang === 'he' ? 'הכל' : 'All')
                      : (lang === 'he' ? `לא נקראו (${unreadCount})` : `Unread (${unreadCount})`)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[s.markAllBtn, unreadCount === 0 && s.markAllBtnHidden]}
              onPress={handleMarkAllRead}
              disabled={unreadCount === 0}
              accessibilityRole="button"
            >
              <Text style={s.markAllText}>
                {lang === 'he' ? 'סמן הכל כנקרא' : 'Mark all read'}
              </Text>
            </Pressable>
          </View>

          {loadingNotifs ? (
            <View style={s.centered}><ActivityIndicator size="large" color="#2E86FF" /></View>
          ) : displayed.length === 0 ? (
            notifsError ? null : (
              <View style={s.empty}>
                <Text style={s.emptyEmoji}>🔔</Text>
                <Text style={s.emptyTitle}>{lang === 'he' ? 'אין התראות' : 'No notifications'}</Text>
                <Text style={s.emptyBody}>
                  {lang === 'he' ? 'כשיהיו עדכונים חדשים, הם יופיעו כאן.' : 'New updates will appear here.'}
                </Text>
              </View>
            )
          ) : (
            <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
              {Object.entries(grouped).map(([dateLabel, notifs]) => (
                <View key={dateLabel}>
                  <View style={[s.dateHeader, isRtl && s.rowReverse]}>
                    <View style={s.dateLine} />
                    <Text style={s.dateLabel}>{dateLabel}</Text>
                    <View style={s.dateLine} />
                  </View>
                  {notifs.map((n) => (
                    <NotifRow key={n.id} notif={n} lang={lang} isRtl={isRtl} onPress={() => handleTapNotif(n)} />
                  ))}
                </View>
              ))}
              <View style={{ height: 100 }} />
            </ScrollView>
          )}
        </>
      )}

      {/* ══ CHATS TAB ══ */}
      {activeTab === 'chats' && (
        <>
          {chatsError && <ErrorBanner message={chatsError} lang={lang} onRetry={fetchInboxData} />}
          {loadingChats ? (
            <View style={s.centered}><ActivityIndicator size="large" color="#2E86FF" /></View>
          ) : chats.length === 0 ? (
            chatsError ? null : (
              <View style={s.empty}>
                <Text style={s.emptyEmoji}>💬</Text>
                <Text style={s.emptyTitle}>{lang === 'he' ? 'אין שיחות' : 'No conversations yet'}</Text>
                <Text style={s.emptyBody}>
                  {lang === 'he' ? 'לחץ על + כדי להתחיל שיחה חדשה' : 'Tap + to start a new conversation'}
                </Text>
              </View>
            )
          ) : (
            <>
              {/* Long press hint */}
              <Text style={s.longPressHint}>
                {lang === 'he' ? 'לחיצה ארוכה למחיקת שיחה' : 'Long press a chat to delete it'}
              </Text>
              <FlatList
                data={chats}
                keyExtractor={(item) => item.chatId}
                contentContainerStyle={{ paddingBottom: 100 }}
                ItemSeparatorComponent={() => <View style={s.separator} />}
                renderItem={({ item }) => (
                  <View style={{ opacity: deletingChatId === item.chatId ? 0.4 : 1 }}>
                    <ChatRowItem
                      chat={item}
                      lang={lang}
                      isRtl={isRtl}
                      onPress={() => handleTapChat(item)}
                      onLongPress={() => handleDeleteChat(item.chatId)}
                    />
                  </View>
                )}
              />
            </>
          )}
          <Pressable
            style={s.fab}
            onPress={() => setChatSheetVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={lang === 'he' ? 'שיחה חדשה' : 'New conversation'}
          >
            <Text style={s.fabText}>+</Text>
          </Pressable>
        </>
      )}

      {/* ══ FEEDBACK TAB ══ */}
      {activeTab === 'feedback' && userRole !== 'system_admin' && (
        <FeedbackChat lang={lang} />
      )}

      {/* ── New chat sheet ── */}
      <NewChatSheet
        visible={chatSheetVisible}
        onClose={() => setChatSheetVisible(false)}
        existingChatIds={activeChatIds}        // ← pass active chat IDs to filter list
        onChatCreated={(chatId, otherName, otherRole) => {
          setChatSheetVisible(false);
          router.push({
            pathname: '/message/[chatId]',
            params: { chatId, otherName, otherRole },
          });
        }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = NotificationsStyles;

const nr = NotificationsRowStyles;

const cr = ChatRowStyles;