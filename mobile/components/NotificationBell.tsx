import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useNotifications } from '../src/context/NotificationsContext';
import { NotificationBellStyles } from '../constants/styles';

export function NotificationBell() {
  const router = useRouter();
  const { unreadCount } = useNotifications();

  return (
    <Pressable style={s.bellBtn} onPress={() => router.push('/(tabs)/notifications')}>
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