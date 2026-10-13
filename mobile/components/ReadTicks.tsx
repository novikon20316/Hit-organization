// WhatsApp-style read receipt for a message the current user sent:
// one grey tick = delivered to the server, two blue ticks = the other
// participant has opened the chat since it was sent. Mirrors web's
// components/ReadTicks.tsx.

import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import type { Lang } from './i18n';

export default function ReadTicks({ seen, lang, style }: { seen: boolean; lang: Lang; style?: StyleProp<TextStyle> }) {
  const label = seen
    ? (lang === 'he' ? 'נקרא' : 'Seen')
    : (lang === 'he' ? 'נשלח' : 'Sent');
  return (
    <Text
      accessibilityLabel={label}
      style={[
        { fontSize: 12, fontWeight: '700', letterSpacing: -3, color: seen ? '#34B7F1' : '#9CA3AF' },
        style,
      ]}
    >
      {seen ? '✓✓' : '✓'}
    </Text>
  );
}
