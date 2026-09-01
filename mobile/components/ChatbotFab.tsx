// components/ChatbotFab.tsx
//
// Realizes the Stitch design "Academic Assistant: Mobile AI Chatbot" (project
// "Unified Academic Project Manager"): pushes the full-screen chat at
// app/chatbot.tsx instead of the old "coming soon" Alert. Mounted on every
// role's home/dashboard screen except system_admin's. `lang` is forwarded as
// a route param since this app has no global language context — each screen
// (including app/chatbot.tsx) holds its own local `lang` state.

import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import type { Lang } from './i18n';
import { ChatbotFabStyles } from '../constants/styles';

interface Props {
  lang: Lang;
  corner?: 'bottom-right' | 'bottom-left';
  /** Distance from the bottom of the screen (default 24) — raise this when a fixed footer bar is also on screen so the FAB doesn't sit under it. */
  bottomOffset?: number;
}

export default function ChatbotFab({ lang, corner = 'bottom-left', bottomOffset = 24 }: Props) {
  const router = useRouter();
  const [showTooltip, setShowTooltip] = useState(false);
  const screenOffset = corner === 'bottom-left' ? { left: 20 } : { right: 20 };

  const handlePress = () => {
    router.push({ pathname: '/chatbot', params: { lang } });
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
        accessibilityRole="button"
        accessibilityLabel={lang === 'he' ? 'עוזר AI' : 'AI Assistant'}
      >
        <Text style={styles.fabIcon}>🤖</Text>
      </Pressable>
    </View>
  );
}

const styles = ChatbotFabStyles;
