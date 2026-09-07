// contexts/FieldGuideContext.tsx
// Registry of currently-mounted field containers for the first-visit
// per-tab/per-form walkthrough (components/guidance/FieldGuideOverlay.tsx) —
// deliberately a separate registry from contexts/OnboardingTourContext.tsx
// (which serves the single, app-wide, sidebar-tab tour) rather than reusing
// it, so the two overlay systems can never step on each other. Each screen
// that renders a FieldGuideOverlay wraps its fields in <FieldGuideTarget> to
// register them here.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { View } from 'react-native';

interface FieldGuideContextValue {
  registerTarget: (key: string, ref: RefObject<View | null>) => void;
  unregisterTarget: (key: string) => void;
  getTarget: (key: string) => RefObject<View | null> | undefined;
  /** Bumped on every register/unregister — the ref map itself isn't state,
   *  so FieldGuideOverlay depends on this to know when to re-measure. */
  targetVersion: number;
}

const FieldGuideContext = createContext<FieldGuideContextValue | null>(null);

export function FieldGuideProvider({ children }: { children: ReactNode }) {
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

  return <FieldGuideContext.Provider value={value}>{children}</FieldGuideContext.Provider>;
}

export function useFieldGuideTargets(): FieldGuideContextValue {
  const ctx = useContext(FieldGuideContext);
  if (!ctx) throw new Error('useFieldGuideTargets must be used within a FieldGuideProvider');
  return ctx;
}
