// components/onboarding/OnboardingTourOverlay.tsx
// The one-time, first-login "here's every tab" walkthrough — mounted once
// at the app root (app/_layout.tsx), next to OnboardingTourProvider. Steps
// come from constants/onboardingTours.ts, keyed per role; each step's
// target button (if the screen that owns it is currently mounted) is
// spotlighted via OnboardingTourContext's registered <TourTarget> refs. If
// the target isn't currently on screen (the user is on a different route
// than the one that owns this step's tab), the step still shows as a plain
// centered-card explanation instead of silently breaking or skipping.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useActiveRole } from '@/contexts/ActiveRoleContext';
import { useOnboardingTourTargets } from '@/contexts/OnboardingTourContext';
import { ONBOARDING_TOURS } from '@/constants/onboardingTours';
import { OnboardingTourStyles as s } from '@/constants/styles';
import { apiClient } from '@/src/api/apiClient';

// Matches web's spotlight glide exactly (see OnboardingTour.tsx's
// `transition-all duration-200`) — only the spotlight geometry animates,
// never the tooltip card, which web also repositions instantly with no
// CSS transition.
const SPOTLIGHT_DURATION = 200;

interface MeasuredRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function OnboardingTourOverlay() {
  const { activeRole, language, hasSeenOnboardingTour, markOnboardingTourSeen } = useActiveRole();
  const { getTarget, targetVersion } = useOnboardingTourTargets();

  const steps = (activeRole ? ONBOARDING_TOURS[activeRole] : undefined) ?? [];
  const [stepIndex, setStepIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [rect, setRect] = useState<MeasuredRect | null>(null);

  const step = steps[stepIndex];

  // Spotlight geometry as shared values, animated with withTiming to glide
  // between steps instead of snapping — `rect` state above still drives the
  // tooltip's (un-animated, matching web) position and the "no target"
  // fallback branch. hasRect tracks whether we've ever had a real target so
  // the very first spotlight appears immediately rather than growing in
  // from (0,0,0,0).
  const rectX = useSharedValue(0);
  const rectY = useSharedValue(0);
  const rectW = useSharedValue(0);
  const rectH = useSharedValue(0);
  const hasHadRect = useRef(false);

  // A fresh sign-in / role change should always restart at step 0 rather
  // than carrying over whatever index a previous user/role left behind.
  useEffect(() => {
    setStepIndex(0);
  }, [activeRole]);

  useEffect(() => {
    if (!step) {
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
    // targetVersion changes whenever any screen registers/unregisters a
    // target — re-measure then, since the step's own target may have just
    // mounted (e.g. the user happened to already be on the right screen).
  }, [step, targetVersion, getTarget, rectX, rectY, rectW, rectH]);

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
    markOnboardingTourSeen();
    // Best-effort — a lost network call here just means the tour reappears
    // next login, the same tolerable fallback used elsewhere in this app.
    apiClient.post('/api/users/complete-onboarding-tour').catch(() => {});
  }, [markOnboardingTourSeen]);

  if (dismissed || hasSeenOnboardingTour || !activeRole || steps.length === 0 || !step) {
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
            {isHe ? `שלב ${stepIndex + 1} מתוך ${steps.length}` : `Step ${stepIndex + 1} of ${steps.length}`}
          </Text>
          <Text style={s.title}>{isHe ? step.title.he : step.title.en}</Text>
          <Text style={s.body}>{isHe ? step.body.he : step.body.en}</Text>

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
