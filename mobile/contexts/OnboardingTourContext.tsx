// contexts/OnboardingTourContext.tsx
// Holds refs to whichever tab-switcher buttons are currently mounted, so
// OnboardingTourOverlay (mounted once at the app root) can spotlight the
// real on-screen button for the tour's current step. Each role's dashboard
// screen owns its own tab buttons and registers/unregisters them as it
// mounts/unmounts via <TourTarget> (components/onboarding/TourTarget.tsx) —
// this context is just the shared registry between "whatever screen happens
// to be on screen" and "the one overlay that needs to find its target".
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { View } from 'react-native';

interface OnboardingTourContextValue {
  registerTarget: (key: string, ref: RefObject<View | null>) => void;
  unregisterTarget: (key: string) => void;
  getTarget: (key: string) => RefObject<View | null> | undefined;
  /** Bumped on every register/unregister — the ref map itself isn't state,
   *  so OnboardingTourOverlay depends on this to know when to re-measure. */
  targetVersion: number;
}

const OnboardingTourContext = createContext<OnboardingTourContextValue | null>(null);

export function OnboardingTourProvider({ children }: { children: ReactNode }) {
  const targets = useRef<Map<string, RefObject<View | null>>>(new Map());
  const [targetVersion, setTargetVersion] = useState(0);

  const registerTarget = useCallback((key: string, ref: RefObject<View | null>) => {
    targets.current.set(key, ref);
    setTargetVersion((v) => v + 1);
  }, []);

  const unregisterTarget = useCallback((key: string) => {
    targets.current.delete(key);
    setTargetVersion((v) => v + 1);
  }, []);

  const getTarget = useCallback((key: string) => targets.current.get(key), []);

  const value = useMemo(
    () => ({ registerTarget, unregisterTarget, getTarget, targetVersion }),
    [registerTarget, unregisterTarget, getTarget, targetVersion],
  );

  return <OnboardingTourContext.Provider value={value}>{children}</OnboardingTourContext.Provider>;
}

export function useOnboardingTourTargets(): OnboardingTourContextValue {
  const ctx = useContext(OnboardingTourContext);
  if (!ctx) throw new Error('useOnboardingTourTargets must be used within an OnboardingTourProvider');
  return ctx;
}
