// components/onboarding/OnboardingTourOverlay.tsx
// The one-time, first-login "here's every tab" walkthrough — mounted once
// at the app root (app/_layout.tsx), next to OnboardingTourProvider. Steps
// come from constants/onboardingTours.ts, keyed per role; each step's
// target button (if the screen that owns it is currently mounted) is
// spotlighted via OnboardingTourContext's registered <TourTarget> refs. If
// the target isn't currently on screen (the user is on a different route
// than the one that owns this step's tab), the step still shows as a plain
// centered-card explanation instead of silently breaking or skipping.
import { useCallback, useEffect, useState } from 'react';
import { Dimensions, Modal, Pressable, Text, View } from 'react-native';
import { useActiveRole } from '@/contexts/ActiveRoleContext';
import { useOnboardingTourTargets } from '@/contexts/OnboardingTourContext';
import { ONBOARDING_TOURS } from '@/constants/onboardingTours';
import { OnboardingTourStyles as s } from '@/constants/styles';
import { apiClient } from '@/src/api/apiClient';

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
      setRect(width > 0 && height > 0 ? { x, y, width, height } : null);
    });
    // targetVersion changes whenever any screen registers/unregisters a
    // target — re-measure then, since the step's own target may have just
    // mounted (e.g. the user happened to already be on the right screen).
  }, [step, targetVersion, getTarget]);

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

  const { width: screenW, height: screenH } = Dimensions.get('window');
  const isLast = stepIndex === steps.length - 1;
  const isHe = language === 'he';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={finish}>
      <View style={s.root} pointerEvents="box-none">
        {rect ? (
          <>
            <View
              pointerEvents="none"
              style={[s.mask, { top: 0, left: 0, width: screenW, height: Math.max(rect.y - 4, 0) }]}
            />
            <View
              pointerEvents="none"
              style={[
                s.mask,
                {
                  top: rect.y + rect.height + 4,
                  left: 0,
                  width: screenW,
                  height: Math.max(screenH - (rect.y + rect.height + 4), 0),
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                s.mask,
                { top: Math.max(rect.y - 4, 0), left: 0, width: Math.max(rect.x - 4, 0), height: rect.height + 8 },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                s.mask,
                {
                  top: Math.max(rect.y - 4, 0),
                  left: rect.x + rect.width + 4,
                  width: Math.max(screenW - (rect.x + rect.width + 4), 0),
                  height: rect.height + 8,
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[s.ring, { top: rect.y - 4, left: rect.x - 4, width: rect.width + 8, height: rect.height + 8 }]}
            />
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
