import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useNotifications } from '../src/context/NotificationsContext';
import { NotificationBellStyles } from '../constants/styles';

interface Props {
  lang?: 'he' | 'en';
}

export function NotificationBell({ lang = 'en' }: Props) {
  const router = useRouter();
  const { unreadCount } = useNotifications();

  return (
    <Pressable
      style={s.bellBtn}
      onPress={() => router.push('/(tabs)/notifications')}
      accessibilityRole="button"
      accessibilityLabel={lang === 'he' ? 'התראות' : 'Notifications'}
      hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
    >
      <Text style={s.bellIcon}>🔔</Text>
      {unreadCount > 0 && (
        <View style={s.badge}>
          <Text style={s.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

const s = NotificationBellStyles;