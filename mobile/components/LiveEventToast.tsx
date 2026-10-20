// components/LiveEventToast.tsx
// Pops the newest live notification (NotificationsContext.liveEvent) on
// screen the moment it lands — a new milestone submission, an approval, a
// committee decision — on whatever screen the user is on, instead of it only
// showing up in the bell/email until they reopen the app. Mounted once in
// app/_layout.tsx. "View" goes straight to the notification's target screen,
// switching to the role it was resolved for when the user holds it — same
// rule as app/notification/[id].tsx. Mirrors web's components/LiveEventToast.tsx.

import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotifications } from '@/src/context/NotificationsContext';
import { useActiveRole } from '@/contexts/ActiveRoleContext';
import { apiClient } from '@/src/api/apiClient';
import { isValidRole } from '@/firebase/roles';
import { computeNotifTargetRoute } from '@/app/(tabs)/notifications';

const AUTO_HIDE_MS = 12_000;

export function LiveEventToast() {
  const { liveEvent, dismissLiveEvent } = useNotifications();
  const { activeRole, roles, setActiveRole, language } = useActiveRole();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isHe = language === 'he';

  useEffect(() => {
    if (!liveEvent) return;
    const timer = setTimeout(dismissLiveEvent, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [liveEvent, dismissLiveEvent]);

  if (!liveEvent) return null;

  const title = (isHe ? liveEvent.titleHe : liveEvent.titleEn) || liveEvent.titleHe || liveEvent.titleEn;
  const body = (isHe ? liveEvent.bodyHe : liveEvent.bodyEn) || liveEvent.bodyHe || liveEvent.bodyEn;
  const targetRole = liveEvent.targetRole && isValidRole(liveEvent.targetRole) && roles.includes(liveEvent.targetRole)
    ? liveEvent.targetRole
    : activeRole;

  const handleView = () => {
    const event = liveEvent;
    dismissLiveEvent();
    apiClient.markNotificationRead(event.id).catch(() => {});
    if (targetRole && targetRole !== activeRole) setActiveRole(targetRole);
    const route = computeNotifTargetRoute(event.type, targetRole, event.targetScreen);
    router.push((route || '/(tabs)/notifications') as any);
  };

  return (
    <View
      style={[styles.card, { top: insets.top + 8 }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.row, { flexDirection: isHe ? 'row-reverse' : 'row' }]}>
        <View style={styles.dot} />
        <View style={styles.textWrap}>
          <Text style={[styles.title, { textAlign: isHe ? 'right' : 'left' }]}>{title}</Text>
          {!!body && (
            <Text style={[styles.body, { textAlign: isHe ? 'right' : 'left' }]} numberOfLines={4}>{body}</Text>
          )}
        </View>
        <Pressable
          onPress={dismissLiveEvent}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={isHe ? 'סגירה' : 'Dismiss'}
        >
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: isHe ? 'row' : 'row-reverse', marginTop: 10 }}>
        <Pressable
          onPress={handleView}
          style={styles.viewBtn}
          accessibilityRole="button"
          accessibilityLabel={isHe ? 'צפייה' : 'View'}
        >
          <Text style={styles.viewText}>{isHe ? 'צפייה' : 'View'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 1000,
    elevation: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  row: { alignItems: 'flex-start', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2E86FF', marginTop: 5 },
  textWrap: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  body: { fontSize: 13, color: '#475569', marginTop: 4 },
  close: { fontSize: 16, color: '#64748B' },
  viewBtn: { backgroundColor: '#2E86FF', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  viewText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
