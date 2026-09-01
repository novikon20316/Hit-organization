// app/notification/[id].tsx — full-screen view of a single notification,
// reached by tapping a row in (tabs)/notifications.tsx. Also supports paging
// to the previous/next notification without going back to the list.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';
import { TYPE_STYLE, computeNotifTargetRoute } from '../(tabs)/notifications';
import { NotificationDetailStyles } from '../../constants/styles';
import { apiClient } from '../../src/api/apiClient';
import { useNotifications } from '../../src/context/NotificationsContext';

const s = NotificationDetailStyles;

interface AlertItem {
  id:        string;
  type:      string;
  titleHe:   string;
  titleEn:   string;
  bodyHe:    string;
  bodyEn:    string;
  createdAt: string;
  isRead:    boolean;
  targetScreen?: string | null;
}

export default function NotificationDetailScreen() {
  const router = useRouter();
  const { refresh } = useNotifications();
  const params = useLocalSearchParams<{
    id?:          string;
    type?:        string;
    titleHe?:     string;
    titleEn?:     string;
    bodyHe?:      string;
    bodyEn?:      string;
    createdAt?:   string;
    targetRoute?: string;
    lang?:        string;
  }>();

  const [lang, setLang] = useState<Lang>(params.lang === 'en' ? 'en' : 'he');
  const isRtl = lang === 'he';

  // Fetched once and reused across next/previous taps (the route stays
  // mounted across router.replace calls to the same [id] pattern) — lets
  // paging between notifications feel instant instead of refetching the
  // whole list on every tap.
  const [alerts,   setAlerts]   = useState<AlertItem[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [listReady, setListReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiClient.get('/api/notifications/feed'),
      apiClient.get('/api/users/profile'),
    ]).then(([feedRes, profileRes]) => {
      if (cancelled) return;
      const feed: AlertItem[] = (Array.isArray(feedRes.data) ? feedRes.data : [])
        .filter((n: AlertItem) => n.type !== 'new_message')
        .sort((a: AlertItem, b: AlertItem) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAlerts(feed);
      setUserRole(profileRes.data.role ?? null);
      setListReady(true);
    }).catch((err) => {
      console.error('Failed to load notification list for paging:', err);
      if (!cancelled) setListReady(true); // paging just stays disabled
    });
    return () => { cancelled = true; };
  }, []);

  const currentIndex = alerts.findIndex((n) => n.id === params.id);
  const current = currentIndex >= 0 ? alerts[currentIndex] : null;

  // Falls back to the data passed in from the list tap (already correct for
  // the notification the user actually tapped) until the list above finishes
  // loading, or if it's somehow missing from the fetched list.
  const type       = current?.type       ?? params.type       ?? '';
  const titleHe    = current?.titleHe    ?? params.titleHe    ?? '';
  const titleEn    = current?.titleEn    ?? params.titleEn    ?? '';
  const bodyHe     = current?.bodyHe     ?? params.bodyHe     ?? '';
  const bodyEn     = current?.bodyEn     ?? params.bodyEn     ?? '';
  const createdAt  = current?.createdAt  ?? params.createdAt  ?? '';
  // Only recomputed once the role is actually known — otherwise falls back
  // to whatever the list screen already computed for the tapped notification.
  const targetRoute = listReady ? computeNotifTargetRoute(type, userRole, current?.targetScreen) : (params.targetRoute ?? '');

  const style = TYPE_STYLE[type] ?? TYPE_STYLE.project_published;
  const title = lang === 'he' ? titleHe : titleEn;
  const body  = lang === 'he' ? bodyHe  : bodyEn;

  const date      = createdAt ? new Date(createdAt) : null;
  const timestamp = date && !isNaN(date.getTime())
    ? date.toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '';

  const hasPrev = listReady && currentIndex > 0;
  const hasNext = listReady && currentIndex >= 0 && currentIndex < alerts.length - 1;

  const goTo = (direction: 'prev' | 'next') => {
    const targetIndex = currentIndex + (direction === 'next' ? 1 : -1);
    if (targetIndex < 0 || targetIndex >= alerts.length) return;
    const target = alerts[targetIndex];

    if (!target.isRead) {
      apiClient.markNotificationRead(target.id).catch((err: unknown) => {
        console.error('Failed to mark notification as read:', err);
      });
      setAlerts((prev) => prev.map((n) => (n.id === target.id ? { ...n, isRead: true } : n)));
      refresh();
    }

    router.replace({
      pathname: '/notification/[id]',
      params: {
        id:          target.id,
        type:        target.type,
        titleHe:     target.titleHe,
        titleEn:     target.titleEn,
        bodyHe:      target.bodyHe,
        bodyEn:      target.bodyEn,
        createdAt:   target.createdAt,
        targetRoute: computeNotifTargetRoute(target.type, userRole, target.targetScreen),
        lang,
      },
    });
  };

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={[s.topRow, isRtl && s.rowReverse]}>
          <Pressable
            style={s.backBtn}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/notifications' as any))}
            accessibilityRole="button"
            accessibilityLabel={isRtl ? 'חזרה' : 'Go back'}
          >
            <Text style={s.backText}>{isRtl ? '→' : '←'}</Text>
          </Pressable>
          <Pressable
            style={s.langBtn}
            onPress={() => setLang(lang === 'he' ? 'en' : 'he')}
            accessibilityRole="button"
            accessibilityLabel={lang === 'he' ? 'החלף שפה לאנגלית' : 'Switch language to Hebrew'}
          >
            <Text style={s.langText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
          </Pressable>
        </View>

        <View style={[s.iconBubble, { backgroundColor: style.bg }]}>
          <Text style={s.iconText}>{style.icon}</Text>
        </View>

        <Text style={[s.title, isRtl && s.textRight]}>{title}</Text>
        {!!timestamp && <Text style={[s.timestamp, isRtl && s.textRight]}>{timestamp}</Text>}

        <View style={s.bodyCard}>
          <Text style={[s.bodyText, isRtl && s.textRight]}>{body}</Text>
        </View>

        <View style={s.navRow}>
          <Pressable
            style={[s.navBtn, !hasPrev && s.navBtnDisabled]}
            disabled={!hasPrev}
            onPress={() => goTo('prev')}
            accessibilityRole="button"
          >
            <Text style={s.navBtnText}>{lang === 'he' ? '‹ הקודם' : '‹ Previous'}</Text>
          </Pressable>
          <Pressable
            style={[s.navBtn, !hasNext && s.navBtnDisabled]}
            disabled={!hasNext}
            onPress={() => goTo('next')}
            accessibilityRole="button"
          >
            <Text style={s.navBtnText}>{lang === 'he' ? 'הבא ›' : 'Next ›'}</Text>
          </Pressable>
        </View>

        {!!targetRoute && (
          <Pressable style={s.actionBtn} onPress={() => router.replace(targetRoute as any)} accessibilityRole="button">
            <Text style={s.actionBtnText}>
              {lang === 'he' ? 'עבור לדשבורד' : 'Go to dashboard'}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
