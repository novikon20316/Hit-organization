// app/(tabs)/notifications.tsx  — shared screen for ALL roles
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, Animated, FlatList, Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context'
import { auth } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';
import NewChatSheet from '../message/new';
import { apiClient } from '../../src/api/apiClient';
import { useNotifications } from '../../src/context/NotificationsContext';

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
  application_approved:   { icon: '✅', color: '#10B981', bg: '#ECFDF5' },
  application_rejected:   { icon: '❌', color: '#EF4444', bg: '#FEF2F2' },
  meeting_requested:      { icon: '📅', color: '#F97316', bg: '#FFF7ED' },
  milestone_graded:       { icon: '✏️', color: '#8B5CF6', bg: '#F5F3FF' },
  milestone_deadline_7d:  { icon: '⏰', color: '#F59E0B', bg: '#FFFBEB' },
  milestone_deadline_1d:  { icon: '🚨', color: '#EF4444', bg: '#FEF2F2' },
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
  const [activeTab,        setActiveTab]        = useState<'notifs' | 'chats'>('notifs');
  const [notifications,    setNotifications]    = useState<Notif[]>([]);
  const [chats,            setChats]            = useState<ChatRow[]>([]);
  const [loadingNotifs,    setLoadingNotifs]    = useState(true);
  const [loadingChats,     setLoadingChats]     = useState(true);
  const [filter,           setFilter]           = useState<'all' | 'unread'>('all');
  const [userRole,         setUserRole]         = useState<string | null>(null);
  const [chatSheetVisible, setChatSheetVisible] = useState(false);
  const [deletingChatId,   setDeletingChatId]   = useState<string | null>(null);

  const isRtl       = lang === 'he';
  const unreadCount = notifications.filter((n) => !n.isRead).length;
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
      case 'student':       router.replace('/student/home');           break;
      case 'supervisor':    router.replace('/supervisor/dashboard');    break;
      case 'examiner':      router.replace('/examinor/home');           break;
      case 'coordinator':   router.replace('/coordinator/home');        break;
      case 'faculty_admin': router.replace('/faculty_admin/dashboard'); break;
      case 'system_admin':  router.replace('/admin/panel');             break;
      default:              router.replace('/(auth)/login');
    }
  }, [userRole]);

  const handleTapNotif = async (notif: Notif) => {
    if (!notif.isRead) await apiClient.markNotificationRead(notif.id);
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
        router.push('/student/home');
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
    ? notifications.filter((n) => !n.isRead)
    : notifications;

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
              ? (activeTab === 'notifs' ? 'התראות' : 'הודעות')
              : (activeTab === 'notifs' ? 'Notifications' : 'Messages')}
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

      {/* ── Tab switcher ── */}
      <View style={[s.tabBar, isRtl && s.rowReverse]}>
        <Pressable
          style={[s.tabBtn, activeTab === 'notifs' && s.tabBtnActive]}
          onPress={() => setActiveTab('notifs')}
        >
          <Text style={[s.tabBtnText, activeTab === 'notifs' && s.tabBtnTextActive]}>
            🔔 {lang === 'he' ? 'התראות' : 'Notifications'}
            {unreadCount > 0 ? ` (${unreadCount})` : ''}
          </Text>
        </Pressable>
        <Pressable
          style={[s.tabBtn, activeTab === 'chats' && s.tabBtnActive]}
          onPress={() => setActiveTab('chats')}
        >
          <Text style={[s.tabBtnText, activeTab === 'chats' && s.tabBtnTextActive]}>
            💬 {lang === 'he' ? 'הודעות' : 'Chats'}
            {unreadChats > 0 ? ` (${unreadChats})` : ''}
          </Text>
        </Pressable>
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
            {unreadCount > 0 && (
              <Pressable style={s.markAllBtn} onPress={handleMarkAllRead}>
                <Text style={s.markAllText}>
                  {lang === 'he' ? 'סמן הכל כנקרא' : 'Mark all read'}
                </Text>
              </Pressable>
            )}
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

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#F0F4FF' },
  centered:   { flex: 1, justifyContent: 'center', alignItems: 'center' },
  rowReverse: { flexDirection: 'row-reverse' },
  alignRight: { alignItems: 'flex-end' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E0E8FF',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4,
  },
  backBtn:         { padding: 6, borderRadius: 10, backgroundColor: '#F0F4FF', borderWidth: 1, borderColor: '#D0DEFF' },
  backText:        { fontSize: 18, color: '#2E86FF', fontWeight: '700', paddingHorizontal: 4 },
  headerCenter:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle:     { fontSize: 18, fontWeight: '800', color: '#111' },
  unreadBadge:     { backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  headerRight:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  langBtn:         { backgroundColor: '#F0F4FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#D0DEFF' },
  langText:        { fontSize: 12, fontWeight: '700', color: '#2E86FF' },

  tabBar:          { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E0E8FF' },
  tabBtn:          { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive:    { borderBottomColor: '#2E86FF' },
  tabBtnText:      { fontSize: 13, fontWeight: '600', color: '#8899BB' },
  tabBtnTextActive:{ color: '#2E86FF', fontWeight: '700' },

  toolbar:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F4FF' },
  filters:          { flexDirection: 'row', gap: 8 },
  filterChip:       { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F0F4FF', borderWidth: 1, borderColor: '#D0DEFF' },
  filterChipActive: { backgroundColor: '#2E86FF', borderColor: '#2E86FF' },
  filterText:       { fontSize: 12, fontWeight: '600', color: '#8899BB' },
  filterTextActive: { color: '#fff' },
  markAllBtn:       { paddingHorizontal: 10, paddingVertical: 6 },
  markAllText:      { fontSize: 12, color: '#2E86FF', fontWeight: '600' },

  longPressHint: { textAlign: 'center', fontSize: 11, color: '#9BA8C0', paddingVertical: 6, backgroundColor: '#F8FAFF' },

  list:      { paddingHorizontal: 14, paddingTop: 12 },
  separator: { height: 1, backgroundColor: '#F0F4FF', marginHorizontal: 16 },

  dateHeader: { flexDirection: 'row', alignItems: 'center', marginVertical: 12, gap: 8 },
  dateLine:   { flex: 1, height: 1, backgroundColor: '#E0E8FF' },
  dateLabel:  { fontSize: 11, fontWeight: '700', color: '#8899BB', letterSpacing: 0.5 },

  empty:      { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 8, textAlign: 'center' },
  emptyBody:  { fontSize: 14, color: '#8899BB', textAlign: 'center', lineHeight: 20 },

  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: '#2E86FF',
    justifyContent: 'center', alignItems: 'center',
    elevation: 6,
    shadowColor: '#2E86FF', shadowOpacity: 0.35, shadowRadius: 8,
  },
  fabText: { color: '#fff', fontSize: 30, fontWeight: '700' },
});

const nr = StyleSheet.create({
  card:        { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, borderLeftWidth: 3, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1, position: 'relative' },
  cardUnread:  { backgroundColor: '#FAFCFF' },
  cardRtl:     { flexDirection: 'row-reverse', borderLeftWidth: 0, borderRightWidth: 3 },
  unreadDot:   { position: 'absolute', top: 14, right: 14, width: 8, height: 8, borderRadius: 4 },
  iconBubble:  { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12, flexShrink: 0 },
  iconText:    { fontSize: 20 },
  content:     { flex: 1 },
  contentRtl:  { marginRight: 12, marginLeft: 0 },
  titleRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  rowReverse:  { flexDirection: 'row-reverse' },
  textRight:   { textAlign: 'right' },
  title:       { fontSize: 13, fontWeight: '500', color: '#445', flex: 1, marginRight: 8 },
  titleBold:   { fontWeight: '700', color: '#111' },
  time:        { fontSize: 11, color: '#9BA8C0', flexShrink: 0 },
  body:        { fontSize: 12, color: '#8899BB', lineHeight: 17 },
});

const cr = StyleSheet.create({
  row:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14 },
  rowRtl:       { flexDirection: 'row-reverse' },
  avatar:       { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText:   { color: '#fff', fontWeight: '900', fontSize: 18 },
  body:         { flex: 1 },
  topLine:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  name:         { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1 },
  time:         { fontSize: 11, color: '#9BA8C0' },
  bottomLine:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  preview:      { fontSize: 13, color: '#8899BB', flex: 1, marginRight: 8 },
  previewBold:  { color: '#111827', fontWeight: '600' },
  badge:        { backgroundColor: '#2E86FF', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  badgeText:    { color: '#fff', fontSize: 11, fontWeight: '800' },
  rolePill:     { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  roleText:     { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  deleteHint:   { fontSize: 18, color: '#D0DEFF', paddingLeft: 8 },
});