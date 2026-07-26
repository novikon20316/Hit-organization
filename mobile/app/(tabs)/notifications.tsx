// app/(tabs)/notifications.tsx  — shared screen for ALL roles
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Animated, FlatList, Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context'
import { auth } from '../../src/firebase/firebase';
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

const TYPE_STYLE: Record<string, { icon: string; color: string; bg: string }> = {
  project_published:      { icon: '📢', color: '#2E86FF', bg: '#EFF6FF' },
  application_received:   { icon: '📥', color: '#2E86FF', bg: '#EFF6FF' },
  application_approved:   { icon: '✅', color: '#10B981', bg: '#ECFDF5' },
  application_rejected:   { icon: '❌', color: '#EF4444', bg: '#FEF2F2' },
  meeting_requested:      { icon: '📅', color: '#F97316', bg: '#FFF7ED' },
  milestone_graded:       { icon: '✏️', color: '#8B5CF6', bg: '#F5F3FF' },
  milestone_deadline_7d:  { icon: '⏰', color: '#F59E0B', bg: '#FFFBEB' },
  milestone_deadline_1d:  { icon: '🚨', color: '#EF4444', bg: '#FEF2F2' },
  milestone_overdue:      { icon: '⏰', color: '#EF4444', bg: '#FEF2F2' },
  account_created:        { icon: '🎓', color: '#2E86FF', bg: '#EFF6FF' },
  broadcast:              { icon: '📢', color: '#EF4444', bg: '#FEF2F2' },
  new_message:            { icon: '💬', color: '#2E86FF', bg: '#EFF6FF' },
};

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

function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
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
            <Text style={nr.time}>{new Date(notif.createdAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}</Text>
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
  useEffect(() => {
    if (!uid) return;

    const fetchInboxData = async () => {
      try {
        // 🚀 FIX: Changed from setLoading to setLoadingChats
        setLoadingChats(true);

        const response = await apiClient.get('/api/chats/dashboard');
        const chats = response.data.chats || []
        setChats(chats);
      } catch (err) {
        console.error("Failed compiling chat list feed items:", err);
      } finally {
        // 🚀 FIX: Changed from setLoading to setLoadingChats
        setLoadingChats(false);
      }
    };

    fetchInboxData();

    // 💡 Optional background polling setup to fetch updates every 30 seconds since onSnapshot is removed
    const inboxInterval = setInterval(fetchInboxData, 30000);
    return () => clearInterval(inboxInterval);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const fetchNotifications = async () => {
      try {
        setLoadingNotifs(true);
        const response = await apiClient.get('/api/notifications/feed');
        // API returns array directly (see getUserNotificationFeed controller)
        setNotifications(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        console.error('Failed fetching notifications:', err);
      } finally {
        setLoadingNotifs(false);
      }
    };

    fetchNotifications();

    // Poll every 30 seconds — same pattern as your chat polling
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [uid]);

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
    switch (userRole) {
      case 'student':              router.replace('/student/home');           break;
      case 'supervisor':
      case 'secondary_supervisor': router.replace('/supervisor/dashboard');    break;
      case 'internal_examiner':    router.replace('/examinor/home');           break;
      case 'coordinator':          router.replace('/coordinator/home');        break;
      case 'faculty_admin':        router.replace('/faculty_admin/dashboard'); break;
      case 'program_head':         router.replace('/program_head/program_head_dashboard'); break;
      case 'administrative_secretary':  router.replace('/administrative_secretary/administrative_secretary_dashboard'); break;
      case 'grad_school_head':     router.replace('/grad_school_head/grad_school_head_dashboard'); break;
      case 'system_admin':         router.replace('/admin/panel');             break;
      default:                     router.replace('/(auth)/login');
    }
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
    switch (notif.type) {
      case 'new_message':
        if (notif.chatId) {
          router.push({
            pathname: '/message/[chatId]',
            params: { chatId: notif.chatId, otherName: notif.senderName ?? '', otherRole: '' },
          });
        }
        break;
      case 'project_published':
      case 'application_approved':
      case 'application_rejected':
      case 'meeting_requested':
      case 'milestone_graded':
      case 'milestone_deadline_7d':
      case 'milestone_deadline_1d':
      case 'milestone_overdue':
        // Always student-directed types.
        router.push('/student/home');
        break;
      case 'application_received':
        // Supervisor-directed — send to their own home, not the student's.
        goHomeByRole();
        break;
      case 'account_created':
        // Recipient can be any role — route to whichever home matches theirs.
        goHomeByRole();
        break;
      default:
        router.back();
    }
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
        <Pressable style={s.backBtn} onPress={goHomeByRole}>
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
          <Pressable style={s.langBtn} onPress={() => setLang(lang === 'he' ? 'en' : 'he')}>
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
        >
          <Text style={[s.tabBtnText, activeTab === 'notifs' && s.tabBtnTextActive]} numberOfLines={1}>
            🔔 {lang === 'he' ? 'התראות' : 'Alerts'}
            {unreadCount > 0 ? ` (${unreadCount})` : ''}
          </Text>
        </Pressable>
        <Pressable
          style={[s.tabBtn, activeTab === 'chats' && s.tabBtnActive]}
          onPress={() => setActiveTab('chats')}
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
          >
            <Text style={[s.tabBtnText, activeTab === 'feedback' && s.tabBtnTextActive]} numberOfLines={1}>
              🗨️ {lang === 'he' ? 'משוב' : 'Feedback'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* ══ NOTIFICATIONS TAB ══ */}
      {activeTab === 'notifs' && (
        <>
          <View style={[s.toolbar, isRtl && s.rowReverse]}>
            <View style={[s.filters, isRtl && s.rowReverse]}>
              {(['all', 'unread'] as const).map((f) => (
                <Pressable
                  key={f}
                  style={[s.filterChip, filter === f && s.filterChipActive]}
                  onPress={() => setFilter(f)}
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
            >
              <Text style={s.markAllText}>
                {lang === 'he' ? 'סמן הכל כנקרא' : 'Mark all read'}
              </Text>
            </Pressable>
          </View>

          {loadingNotifs ? (
            <View style={s.centered}><ActivityIndicator size="large" color="#2E86FF" /></View>
          ) : displayed.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>🔔</Text>
              <Text style={s.emptyTitle}>{lang === 'he' ? 'אין התראות' : 'No notifications'}</Text>
              <Text style={s.emptyBody}>
                {lang === 'he' ? 'כשיהיו עדכונים חדשים, הם יופיעו כאן.' : 'New updates will appear here.'}
              </Text>
            </View>
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
          {loadingChats ? (
            <View style={s.centered}><ActivityIndicator size="large" color="#2E86FF" /></View>
          ) : chats.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>💬</Text>
              <Text style={s.emptyTitle}>{lang === 'he' ? 'אין שיחות' : 'No conversations yet'}</Text>
              <Text style={s.emptyBody}>
                {lang === 'he' ? 'לחץ על + כדי להתחיל שיחה חדשה' : 'Tap + to start a new conversation'}
              </Text>
            </View>
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
          <Pressable style={s.fab} onPress={() => setChatSheetVisible(true)}>
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