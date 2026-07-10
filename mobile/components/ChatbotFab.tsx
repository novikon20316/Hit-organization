// components/ChatbotFab.tsx
//
// Placeholder floating button for the future AI chatbot. Student-only for
// now — no chatbot behavior yet, just the affordance + a "coming soon" note.

import React, { useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import type { Lang } from './i18n';

interface Props {
  lang: Lang;
  corner?: 'bottom-right' | 'bottom-left';
}

export default function ChatbotFab({ lang, corner = 'bottom-left' }: Props) {
  const [showTooltip, setShowTooltip] = useState(false);
  const screenOffset = corner === 'bottom-left' ? { left: 20 } : { right: 20 };

  const handlePress = () => {
    Alert.alert(
      lang === 'he' ? '🤖 עוזר AI' : '🤖 AI Assistant',
      lang === 'he' ? 'העוזר החכם יגיע בקרוב.' : 'The AI assistant is coming soon.'
    );
  };

  return (
    <View style={[styles.container, screenOffset]} pointerEvents="box-none">
      {showTooltip && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipText}>{lang === 'he' ? 'עוזר AI' : 'AI Assistant'}</Text>
        </View>
      )}
      <Pressable
        style={styles.fab}
        onPress={handlePress}
        onHoverIn={() => setShowTooltip(true)}
        onHoverOut={() => setShowTooltip(false)}
      >
        <Text style={styles.fabIcon}>🤖</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    alignItems: 'center',
    zIndex: 50,
  },
  fab: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#8B5CF6',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6,
    elevation: 6,
  },
  fabIcon: { fontSize: 26 },
  tooltip: {
    position: 'absolute',
    bottom: 64,
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8,
  },
  tooltipText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
