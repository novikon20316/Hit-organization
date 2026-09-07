// components/guidance/FieldGuideOverlay.tsx
// First-visit, per-tab/per-form "here's what every field means" walkthrough
// — mobile counterpart of web's components/guidance/FieldGuideOverlay.tsx.
// Copies OnboardingTourOverlay.tsx's proven spotlight+card animation
// mechanics (deliberately not shared/modified — that component is mounted
// once at the app root and must keep working unmodified) but is mounted
// PER SCREEN, scoped to that screen's own FieldGuideTarget-wrapped fields via
// the separate FieldGuideContext registry, and gated per-guideKey
// (seenFieldGuides) instead of the single app-wide hasSeenOnboardingTour.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useActiveRole } from '@/contexts/ActiveRoleContext';
import { useFieldGuideTargets } from '@/contexts/FieldGuideContext';
import { FieldGuideStyles as s } from '@/constants/styles';
import { apiClient } from '@/src/api/apiClient';
import type { FieldGuideStep } from './types';

const SPOTLIGHT_DURATION = 200;

interface MeasuredRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FieldGuideOverlayProps {
  guideKey: string;
  steps: FieldGuideStep[];
}

export function FieldGuideOverlay({ guideKey, steps }: FieldGuideOverlayProps) {
  const { language, seenFieldGuides, markFieldGuideSeen } = useActiveRole();
  const { getTarget, targetVersion } = useFieldGuideTargets();

  const [stepIndex, setStepIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [rect, setRect] = useState<MeasuredRect | null>(null);

  const alreadySeen = seenFieldGuides.includes(guideKey);
  const step = steps[stepIndex];

  const rectX = useSharedValue(0);
  const rectY = useSharedValue(0);
  const rectW = useSharedValue(0);
  const rectH = useSharedValue(0);
  const hasHadRect = useRef(false);

  useEffect(() => {
    if (alreadySeen || !step) {
      setRect(null);
      return;
    }
    const targetRef = getTarget(step.key);
    const view = targetRef?.current;
    if (!view) {
      setRect(null);
      return;
    }
    view.measureInWindow((x, y, width, height) => {
      const next = width > 0 && height > 0 ? { x, y, width, height } : null;
      setRect(next);
      if (next) {
        if (hasHadRect.current) {
          rectX.value = withTiming(next.x, { duration: SPOTLIGHT_DURATION });
          rectY.value = withTiming(next.y, { duration: SPOTLIGHT_DURATION });
          rectW.value = withTiming(next.width, { duration: SPOTLIGHT_DURATION });
          rectH.value = withTiming(next.height, { duration: SPOTLIGHT_DURATION });
        } else {
          rectX.value = next.x;
          rectY.value = next.y;
          rectW.value = next.width;
          rectH.value = next.height;
          hasHadRect.current = true;
        }
      }
    });
  }, [step, alreadySeen, targetVersion, getTarget, rectX, rectY, rectW, rectH]);

  const { width: screenW, height: screenH } = Dimensions.get('window');

  const topMaskStyle = useAnimatedStyle(() => ({
    top: 0, left: 0, width: screenW, height: Math.max(rectY.value - 4, 0),
  }));
  const bottomMaskStyle = useAnimatedStyle(() => ({
    top: rectY.value + rectH.value + 4,
    left: 0,
    width: screenW,
    height: Math.max(screenH - (rectY.value + rectH.value + 4), 0),
  }));
  const leftMaskStyle = useAnimatedStyle(() => ({
    top: Math.max(rectY.value - 4, 0),
    left: 0,
    width: Math.max(rectX.value - 4, 0),
    height: rectH.value + 8,
  }));
  const rightMaskStyle = useAnimatedStyle(() => ({
    top: Math.max(rectY.value - 4, 0),
    left: rectX.value + rectW.value + 4,
    width: Math.max(screenW - (rectX.value + rectW.value + 4), 0),
    height: rectH.value + 8,
  }));
  const ringStyle = useAnimatedStyle(() => ({
    top: rectY.value - 4, left: rectX.value - 4, width: rectW.value + 8, height: rectH.value + 8,
  }));

  const finish = useCallback(() => {
    setDismissed(true);
    markFieldGuideSeen(guideKey);
    // Best-effort, same tolerant fallback as OnboardingTourOverlay's own
    // complete-onboarding-tour call — a lost network call just means this
    // walkthrough reappears next visit.
    apiClient.post('/api/users/mark-field-guide-seen', { guideKey }).catch(() => {});
  }, [guideKey, markFieldGuideSeen]);

  if (dismissed || alreadySeen || steps.length === 0 || !step) {
    return null;
  }

  const isLast = stepIndex === steps.length - 1;
  const isHe = language === 'he';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={finish}>
      <View style={s.root} pointerEvents="box-none">
        {rect ? (
          <>
            <Animated.View pointerEvents="none" style={[s.mask, topMaskStyle]} />
            <Animated.View pointerEvents="none" style={[s.mask, bottomMaskStyle]} />
            <Animated.View pointerEvents="none" style={[s.mask, leftMaskStyle]} />
            <Animated.View pointerEvents="none" style={[s.mask, rightMaskStyle]} />
            <Animated.View pointerEvents="none" style={[s.ring, ringStyle]} />
          </>
        ) : (
          <View pointerEvents="none" style={[s.mask, { top: 0, left: 0, width: screenW, height: screenH }]} />
        )}

        <View style={s.card}>
          <Text style={s.stepCounter}>
            {isHe ? `שדה ${stepIndex + 1} מתוך ${steps.length}` : `Field ${stepIndex + 1} of ${steps.length}`}
          </Text>
          <Text style={s.title}>{isHe ? step.label.he : step.label.en}</Text>
          <Text style={s.body}>{isHe ? step.description.he : step.description.en}</Text>

          <View style={s.footer}>
            <Pressable onPress={finish} accessibilityRole="button">
              <Text style={s.skip}>{isHe ? 'דלג' : 'Skip'}</Text>
            </Pressable>
            <View style={s.footerButtons}>
              {stepIndex > 0 && (
                <Pressable
                  style={s.backBtn}
                  onPress={() => setStepIndex((i) => Math.max(0, i - 1))}
                  accessibilityRole="button"
                >
                  <Text style={s.backBtnText}>{isHe ? 'הקודם' : 'Back'}</Text>
                </Pressable>
              )}
              <Pressable
                style={s.nextBtn}
                onPress={() => (isLast ? finish() : setStepIndex((i) => i + 1))}
                accessibilityRole="button"
              >
                <Text style={s.nextBtnText}>{isLast ? (isHe ? 'סיום' : 'Finish') : isHe ? 'הבא' : 'Next'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
