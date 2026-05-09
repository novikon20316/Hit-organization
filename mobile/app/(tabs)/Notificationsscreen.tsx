// app/notifications.tsx  — shared screen for ALL roles
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  SafeAreaView, ActivityIndicator, Animated,
} from 'react-native';
import {
  collection, query, where, onSnapshot,
  orderBy, Timestamp,
} from 'firebase/firestore';
import { db, auth } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import { markNotificationRead, markAllNotificationsRead } from '../../components/Notificationservice';
import type { Lang } from '../../components/i18n';

// ─── Types ─────────────────────────────────────────────────────────────────
interface Notif {
  id:                 string;
  type:               string;
  titleHe:            string;
  titleEn:            string;
  bodyHe:             string;
  bodyEn:             string;
  isRead:             boolean;
  createdAt:          Timestamp;
  relatedProjectId:   string | null;
  relatedMilestoneId: string | null;
}

// ─── Notification type → icon + color ──────────────────────────────────────
const TYPE_STYLE: Record<string, { icon: string; color: string; bg: string }> = {
  project_published:      { icon: '📢', color: '#2E86FF', bg: '#EFF6FF' },
  application_approved:   { icon: '✅', color: '#10B981', bg: '#ECFDF5' },
  application_rejected:   { icon: '❌', color: '#EF4444', bg: '#FEF2F2' },
  meeting_requested:      { icon: '📅', color: '#F97316', bg: '#FFF7ED' },
  milestone_graded:       { icon: '✏️', color: '#8B5CF6', bg: '#F5F3FF' },
  milestone_deadline_7d:  { icon: '⏰', color: '#F59E0B', bg: '#FFFBEB' },
  milestone_deadline_1d:  { icon: '🚨', color: '#EF4444', bg: '#FEF2F2' },
};

// ─── Format relative time ──────────────────────────────────────────────────
function relativeTime(ts: Timestamp, lang: Lang): string {
  const now  = Date.now();
  const diff = now - ts.toMillis();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (lang === 'he') {
    if (mins < 1)   return 'עכשיו';
    if (mins < 60)  return `לפני ${mins} דקות`;
    if (hrs  < 24)  return `לפני ${hrs} שעות`;
    if (days < 7)   return `לפני ${days} ימים`;
    return ts.toDate().toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  } else {
    if (mins < 1)   return 'Just now';
    if (mins < 60)  return `${mins}m ago`;
    if (hrs  < 24)  return `${hrs}h ago`;
    if (days < 7)   return `${days}d ago`;
    return ts.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
}

// ─── Animated notification row ─────────────────────────────────────────────
function NotifRow({ notif, lang, isRtl, onPress }: {
  notif: Notif; lang: Lang; isRtl: boolean; onPress: () => void;
}) {
  const style     = TYPE_STYLE[notif.type] ?? TYPE_STYLE.project_published;
  const fadeAnim  = useRef(new Animated.Value(notif.isRead ? 1 : 0)).current;
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
        {/* Unread dot */}
        {!notif.isRead && <View style={[nr.unreadDot, { backgroundColor: style.color }]} />}

        {/* Icon bubble */}
        <View style={[nr.iconBubble, { backgroundColor: style.bg }]}>
          <Text style={nr.iconText}>{style.icon}</Text>
        </View>

        {/* Content */}
        <View style={[nr.content, isRtl && nr.contentRtl]}>
          <View style={[nr.titleRow, isRtl && nr.rowReverse]}>
            <Text style={[nr.title, isRtl && nr.textRight, !notif.isRead && nr.titleBold]} numberOfLines={1}>
              {lang === 'he' ? notif.titleHe : notif.titleEn}
            </Text>
            <Text style={nr.time}>
              {notif.createdAt ? relativeTime(notif.createdAt, lang) : ''}
            </Text>
          </View>
          <Text style={[nr.body, isRtl && nr.textRight]} numberOfLines={2}>
            {lang === 'he' ? notif.bodyHe : notif.bodyEn}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────
export default function NotificationsScreen() {
  const router = useRouter();
  const uid    = auth.currentUser?.uid;

  const [lang,          setLang]          = useState<Lang>('he');
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [filter,        setFilter]        = useState<'all' | 'unread'>('all');

  const isRtl      = lang === 'he';
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // Live Firestore listener
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', uid),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(q, (snap) => {
      setNotifications(
        snap.docs.map((d) => ({
          id:                 d.id,
          type:               d.data().type,
          titleHe:            d.data().titleHe,
          titleEn:            d.data().titleEn,
          bodyHe:             d.data().bodyHe,
          bodyEn:             d.data().bodyEn,
          isRead:             d.data().isRead,
          createdAt:          d.data().createdAt,
          relatedProjectId:   d.data().relatedProjectId   ?? null,
          relatedMilestoneId: d.data().relatedMilestoneId ?? null,
        }))
      );
      setLoading(false);
    });
  }, [uid]);

  const handleTap = async (notif: Notif) => {
    if (!notif.isRead) await markNotificationRead(notif.id);

    // Navigate based on type + role
    switch (notif.type) {
      case 'project_published':
        router.push('/student/home');
        break;
      case 'application_approved':
      case 'application_rejected':
      case 'meeting_requested':
        router.push('/student/home');
        break;
      case 'milestone_graded':
      case 'milestone_deadline_7d':
      case 'milestone_deadline_1d':
        router.push('/student/home');
        break;
      default:
        router.back();
    }
  };

  const handleMarkAllRead = async () => {
    if (!uid) return;
    await markAllNotificationsRead(uid);
  };

  const displayed = filter === 'unread'
    ? notifications.filter((n) => !n.isRead)
    : notifications;

  // Group by date
  const grouped: Record<string, Notif[]> = {};
  displayed.forEach((n) => {
    if (!n.createdAt) return;
    const date = n.createdAt.toDate();
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

  return (
    <SafeAreaView style={s.root}>

      {/* Header */}
      <View style={[s.header, isRtl && s.rowReverse]}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backText}>{isRtl ? '→' : '←'}</Text>
        </Pressable>

        <View style={[s.headerCenter, isRtl && s.alignRight]}>
          <Text style={s.headerTitle}>
            {lang === 'he' ? 'התראות' : 'Notifications'}
          </Text>
          {unreadCount > 0 && (
            <View style={s.unreadBadge}>
              <Text style={s.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>

        <View style={[s.headerRight, isRtl && s.rowReverse]}>
          {/* Lang toggle */}
          <Pressable style={s.langBtn} onPress={() => setLang(lang === 'he' ? 'en' : 'he')}>
            <Text style={s.langText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
          </Pressable>
        </View>
      </View>

      {/* Filter bar + Mark all read */}
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

      {/* List */}
      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color="#2E86FF" />
        </View>
      ) : displayed.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyEmoji}>🔔</Text>
          <Text style={s.emptyTitle}>
            {lang === 'he' ? 'אין התראות' : 'No notifications'}
          </Text>
          <Text style={s.emptyBody}>
            {lang === 'he'
              ? 'כשיהיו עדכונים חדשים, הם יופיעו כאן.'
              : 'When there are new updates, they will appear here.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
          {Object.entries(grouped).map(([dateLabel, notifs]) => (
            <View key={dateLabel}>
              {/* Date group header */}
              <View style={[s.dateHeader, isRtl && s.rowReverse]}>
                <View style={s.dateLine} />
                <Text style={s.dateLabel}>{dateLabel}</Text>
                <View style={s.dateLine} />
              </View>

              {notifs.map((n) => (
                <NotifRow
                  key={n.id}
                  notif={n}
                  lang={lang}
                  isRtl={isRtl}
                  onPress={() => handleTap(n)}
                />
              ))}
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#F0F4FF' },
  centered:   { flex: 1, justifyContent: 'center', alignItems: 'center' },
  rowReverse: { flexDirection: 'row-reverse' },
  alignRight: { alignItems: 'flex-end' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E0E8FF',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4,
  },
  backBtn:      { padding: 6, borderRadius: 10, backgroundColor: '#F0F4FF', borderWidth: 1, borderColor: '#D0DEFF' },
  backText:     { fontSize: 18, color: '#2E86FF', fontWeight: '700', paddingHorizontal: 4 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle:  { fontSize: 18, fontWeight: '800', color: '#111' },
  unreadBadge: {
    backgroundColor: '#EF4444', borderRadius: 10,
    minWidth: 20, height: 20,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5,
  },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  headerRight:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  langBtn: {
    backgroundColor: '#F0F4FF', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#D0DEFF',
  },
  langText: { fontSize: 12, fontWeight: '700', color: '#2E86FF' },

  // Toolbar
  toolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F4FF',
  },
  filters:     { flexDirection: 'row', gap: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#F0F4FF', borderWidth: 1, borderColor: '#D0DEFF',
  },
  filterChipActive: { backgroundColor: '#2E86FF', borderColor: '#2E86FF' },
  filterText:       { fontSize: 12, fontWeight: '600', color: '#8899BB' },
  filterTextActive: { color: '#fff' },
  markAllBtn:       { paddingHorizontal: 10, paddingVertical: 6 },
  markAllText:      { fontSize: 12, color: '#2E86FF', fontWeight: '600' },

  // List
  list: { paddingHorizontal: 14, paddingTop: 12 },

  // Date group
  dateHeader: { flexDirection: 'row', alignItems: 'center', marginVertical: 12, gap: 8 },
  dateLine:   { flex: 1, height: 1, backgroundColor: '#E0E8FF' },
  dateLabel:  { fontSize: 11, fontWeight: '700', color: '#8899BB', letterSpacing: 0.5 },

  // Empty state
  empty:       { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyEmoji:  { fontSize: 56, marginBottom: 16 },
  emptyTitle:  { fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 8, textAlign: 'center' },
  emptyBody:   { fontSize: 14, color: '#8899BB', textAlign: 'center', lineHeight: 20 },
});

// ─── Notification row styles ────────────────────────────────────────────────
const nr = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    marginBottom: 10, borderLeftWidth: 3,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
    position: 'relative',
  },
  cardUnread:   { backgroundColor: '#FAFCFF' },
  cardRtl:      { flexDirection: 'row-reverse', borderLeftWidth: 0, borderRightWidth: 3 },
  unreadDot: {
    position: 'absolute', top: 14, right: 14,
    width: 8, height: 8, borderRadius: 4,
  },
  iconBubble: {
    width: 42, height: 42, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12, flexShrink: 0,
  },
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