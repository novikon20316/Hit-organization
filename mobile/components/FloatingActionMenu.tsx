// components/FloatingActionMenu.tsx
//
// A floating action button that expands into a small vertical stack of
// action buttons. Used to replace clusters of inline buttons (Add User,
// Import, Export, ...) with a single tidy floating control.

import React, { useRef, useState } from 'react';
import { View, Text, Pressable, Animated, ActivityIndicator, StyleSheet } from 'react-native';
import type { Lang } from './i18n';

export interface FloatingAction {
  key: string;
  label: string;
  icon: string;
  onPress: () => void;
  loading?: boolean;
}

interface Props {
  actions: FloatingAction[];
  lang: Lang;
  isRtl: boolean;
  corner?: 'bottom-right' | 'bottom-left';
  color?: string;
  tooltipLabel?: { he: string; en: string };
}

export default function FloatingActionMenu({
  actions,
  lang,
  isRtl,
  corner = 'bottom-right',
  color = '#2E86FF',
  tooltipLabel = { he: 'פעולות', en: 'Actions' },
}: Props) {
  const [expanded, setExpanded]   = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    Animated.spring(anim, {
      toValue: next ? 1 : 0,
      useNativeDriver: true,
      friction: 7,
    }).start();
  };

  // `screenOffset` positions the whole widget on screen; `edgeStyle` then
  // anchors the absolutely-positioned pills/tooltip to the same edge of the
  // widget's own (auto-sized) container so they line up with the FAB.
  const screenOffset = corner === 'bottom-left' ? { left: 20 } : { right: 20 };
  const edgeStyle     = corner === 'bottom-left' ? { left: 0 }  : { right: 0 };
  const tooltipText = lang === 'he' ? tooltipLabel.he : tooltipLabel.en;

  return (
    <View
      style={[styles.container, screenOffset, { alignItems: corner === 'bottom-left' ? 'flex-start' : 'flex-end' }]}
      pointerEvents="box-none"
    >
      {/* Expanded action pills */}
      {actions.map((action, i) => {
        const translateY = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -(56 * (i + 1))],
        });
        return (
          <Animated.View
            key={action.key}
            pointerEvents={expanded ? 'auto' : 'none'}
            style={[
              styles.pillWrapper,
              edgeStyle,
              {
                opacity: anim,
                transform: [{ translateY }],
              },
            ]}
          >
            <Pressable
              style={[styles.pill, isRtl && styles.pillRtl]}
              onPress={() => { toggle(); action.onPress(); }}
              disabled={action.loading}
            >
              {isRtl && <Text style={styles.pillLabel}>{action.label}</Text>}
              <View style={[styles.pillIcon, { backgroundColor: color }]}>
                {action.loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.pillIconText}>{action.icon}</Text>}
              </View>
              {!isRtl && <Text style={styles.pillLabel}>{action.label}</Text>}
            </Pressable>
          </Animated.View>
        );
      })}

      {/* Tooltip bubble (pointer/web hover — no-op on touch-only devices) */}
      {showTooltip && !expanded && (
        <View style={[styles.tooltip, edgeStyle]}>
          <Text style={styles.tooltipText}>{tooltipText}</Text>
        </View>
      )}

      {/* Main FAB */}
      <Pressable
        style={[styles.fab, { backgroundColor: color }]}
        onPress={toggle}
        onHoverIn={() => setShowTooltip(true)}
        onHoverOut={() => setShowTooltip(false)}
      >
        <Animated.Text
          style={[
            styles.fabIcon,
            {
              transform: [{
                rotate: anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '135deg'] }),
              }],
            },
          ]}
        >
          +
        </Animated.Text>
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
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6,
    elevation: 6,
  },
  fabIcon: { color: '#fff', fontSize: 30, fontWeight: '400', marginTop: -2 },
  pillWrapper: {
    position: 'absolute',
    bottom: 0,
  },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 24, paddingVertical: 6, paddingHorizontal: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4,
    elevation: 4,
  },
  pillRtl: { flexDirection: 'row-reverse' },
  pillIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  pillIconText: { fontSize: 18 },
  pillLabel: {
    fontSize: 13, fontWeight: '700', color: '#1a1a2e',
    marginHorizontal: 10,
  },
  tooltip: {
    position: 'absolute',
    bottom: 64,
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8,
  },
  tooltipText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
