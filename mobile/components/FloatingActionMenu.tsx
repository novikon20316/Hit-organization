// components/FloatingActionMenu.tsx
//
// A floating action button that expands into a small vertical stack of
// action buttons. Used to replace clusters of inline buttons (Add User,
// Import, Export, ...) with a single tidy floating control.

import React, { useRef, useState } from 'react';
import { View, Text, Pressable, Animated, ActivityIndicator, Easing } from 'react-native';
import type { Lang } from './i18n';
import { FloatingActionMenuStyles } from '../constants/styles';

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

// Fallback spacing used only until a pill's real height is measured (its
// very first render) — actual spacing below is always driven by onLayout
// measurements, so labels that wrap onto 2 lines never overlap their
// neighbor the way a fixed one-line assumption would.
const DEFAULT_PILL_HEIGHT = 56;
const PILL_GAP = 12;

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
  const [pillHeights, setPillHeights] = useState<number[]>([]);
  const anim = useRef(new Animated.Value(0)).current; // drives the FAB's own rotate

  // One Animated.Value per pill so they can cascade in/out instead of all
  // moving in lockstep — closest-to-FAB pill leads on open, trails on close,
  // giving the stack a "scrolling" reveal instead of a single flat pop.
  const pillAnimsRef = useRef<Animated.Value[]>([]);
  if (pillAnimsRef.current.length !== actions.length) {
    pillAnimsRef.current = actions.map(() => new Animated.Value(0));
  }
  const pillAnims = pillAnimsRef.current;

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);

    Animated.timing(anim, {
      toValue:  next ? 1 : 0,
      duration: 220,
      easing:   Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const cascadeOrder = next ? pillAnims : [...pillAnims].reverse();
    Animated.stagger(
      60,
      cascadeOrder.map((v) => Animated.timing(v, {
        toValue:  next ? 1 : 0,
        duration: 200,
        easing:   Easing.out(Easing.cubic),
        useNativeDriver: true,
      })),
    ).start();
  };

  // `screenOffset` positions the whole widget on screen; `edgeStyle` then
  // anchors the absolutely-positioned pills/tooltip to the same edge of the
  // widget's own (auto-sized) container so they line up with the FAB.
  const screenOffset = corner === 'bottom-left' ? { left: 20 } : { right: 20 };
  const edgeStyle     = corner === 'bottom-left' ? { left: 0 }  : { right: 0 };
  const tooltipText = lang === 'he' ? tooltipLabel.he : tooltipLabel.en;

  // Cumulative distance to push pill `i` up by, based on the REAL measured
  // height of every pill below it (falling back to DEFAULT_PILL_HEIGHT only
  // until that pill's own onLayout has fired) — this is what keeps equal
  // gaps between pills regardless of how many lines a label wraps onto.
  const offsetFor = (index: number) => {
    let offset = 0;
    for (let j = 0; j <= index; j++) {
      offset += (pillHeights[j] ?? DEFAULT_PILL_HEIGHT) + PILL_GAP;
    }
    return offset;
  };

  return (
    <View
      style={[styles.container, screenOffset, { alignItems: corner === 'bottom-left' ? 'flex-start' : 'flex-end' }]}
      pointerEvents="box-none"
    >
      {/* Expanded action pills */}
      {actions.map((action, i) => {
        const pillAnim = pillAnims[i];
        const translateY = pillAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -offsetFor(i)],
        });
        return (
          <Animated.View
            key={action.key}
            pointerEvents={expanded ? 'auto' : 'none'}
            style={[
              styles.pillWrapper,
              edgeStyle,
              {
                opacity: pillAnim,
                transform: [{ translateY }],
              },
            ]}
          >
            <Pressable
              style={[styles.pill, isRtl && styles.pillRtl]}
              onPress={() => { toggle(); action.onPress(); }}
              disabled={action.loading}
              onLayout={(e) => {
                const h = Math.ceil(e.nativeEvent.layout.height);
                setPillHeights((prev) => {
                  if (prev[i] === h) return prev;
                  const next = [...prev];
                  next[i] = h;
                  return next;
                });
              }}
            >
              {isRtl && <Text style={styles.pillLabel} numberOfLines={2}>{action.label}</Text>}
              <View style={[styles.pillIcon, { backgroundColor: color }]}>
                {action.loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.pillIconText}>{action.icon}</Text>}
              </View>
              {!isRtl && <Text style={styles.pillLabel} numberOfLines={2}>{action.label}</Text>}
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

const styles = FloatingActionMenuStyles;
