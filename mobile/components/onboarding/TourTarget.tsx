// components/onboarding/TourTarget.tsx
// Thin wrapper for a tab-switcher button — registers its position with
// OnboardingTourContext while mounted so OnboardingTourOverlay can spotlight
// it, and unregisters on unmount (so a step for a tab on a screen the user
// has navigated away from correctly falls back to the overlay's centered,
// non-spotlighted card instead of pointing at nothing). Wrapping is the only
// per-screen edit needed for targeting — no logic lives here.
import { useEffect, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { useOnboardingTourTargets } from '@/contexts/OnboardingTourContext';

interface TourTargetProps {
  tourKey: string;
  children: ReactNode;
}

export function TourTarget({ tourKey, children }: TourTargetProps) {
  const ref = useRef<View>(null);
  const { registerTarget, unregisterTarget } = useOnboardingTourTargets();

  useEffect(() => {
    registerTarget(tourKey, ref);
    return () => unregisterTarget(tourKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- registerTarget/unregisterTarget are stable useCallbacks; re-running only on tourKey changes is intentional
  }, [tourKey]);

  // collapsable={false} keeps this View in Android's native tree — without
  // it, a childless-of-siblings wrapper like this can get optimized away,
  // which would make measureInWindow silently fail.
  return (
    <View ref={ref} collapsable={false}>
      {children}
    </View>
  );
}
