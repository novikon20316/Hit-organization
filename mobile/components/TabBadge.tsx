// components/TabBadge.tsx
// Small "new item" count pill for a tab/menu label — same red-pill idiom as
// NotificationBell.tsx's own badge. Renders nothing when count is 0.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  count: number;
}

export function TabBadge({ count }: Props) {
  if (count <= 0) return null;
  return (
    <View style={s.badge}>
      <Text style={s.badgeText}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginStart: 6,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
