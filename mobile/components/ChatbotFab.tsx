// components/ChatbotFab.tsx
//
// Placeholder floating button for the future AI chatbot — no chatbot
// behavior yet, just the affordance + a "coming soon" note. Mounted on
// every role's home/dashboard screen except system_admin's.

import React, { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import type { Lang } from './i18n';
import { ChatbotFabStyles } from '../constants/styles';

interface Props {
  lang: Lang;
  corner?: 'bottom-right' | 'bottom-left';
  /** Distance from the bottom of the screen (default 24) — raise this when a fixed footer bar is also on screen so the FAB doesn't sit under it. */
  bottomOffset?: number;
}

export default function ChatbotFab({ lang, corner = 'bottom-left', bottomOffset = 24 }: Props) {
  const [showTooltip, setShowTooltip] = useState(false);
  const screenOffset = corner === 'bottom-left' ? { left: 20 } : { right: 20 };

  const handlePress = () => {
    Alert.alert(
      lang === 'he' ? '🤖 עוזר AI' : '🤖 AI Assistant',
      lang === 'he' ? 'העוזר החכם יגיע בקרוב.' : 'The AI assistant is coming soon.'
    );
  };

  return (
    <View style={[styles.container, screenOffset, { bottom: bottomOffset }]} pointerEvents="box-none">
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

const styles = ChatbotFabStyles;
