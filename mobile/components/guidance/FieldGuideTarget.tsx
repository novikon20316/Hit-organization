// components/guidance/FieldGuideTarget.tsx
// Thin wrapper for one field's container — registers its position with
// FieldGuideContext while mounted so FieldGuideOverlay can spotlight it, and
// unregisters on unmount. Mirrors components/onboarding/TourTarget.tsx
// exactly, against the separate field-guide registry instead of the
// onboarding-tour one.
import { useEffect, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { useFieldGuideTargets } from '@/contexts/FieldGuideContext';

interface FieldGuideTargetProps {
  fieldKey: string;
  children: ReactNode;
}

export function FieldGuideTarget({ fieldKey, children }: FieldGuideTargetProps) {
  const ref = useRef<View>(null);
  const { registerTarget, unregisterTarget } = useFieldGuideTargets();

  useEffect(() => {
    registerTarget(fieldKey, ref);
    return () => unregisterTarget(fieldKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- registerTarget/unregisterTarget are stable useCallbacks; re-running only on fieldKey changes is intentional
  }, [fieldKey]);

  // collapsable={false} keeps this View in Android's native tree — without
  // it, a childless-of-siblings wrapper like this can get optimized away,
  // which would make measureInWindow silently fail.
  return (
    <View ref={ref} collapsable={false}>
      {children}
    </View>
  );
}
