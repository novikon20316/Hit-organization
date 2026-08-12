'use client';

// hooks/useIdleTimer.ts
// Watches for user activity (mouse/keyboard/touch/scroll) and fires
// `onIdle` once no activity has been seen for `timeoutMs`. Used by
// AuthContext to show the "you've been inactive, log in again" modal —
// see components/SessionExpiredModal.tsx.

import { useEffect, useRef } from 'react';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

export function useIdleTimer(onIdle: () => void, timeoutMs: number, enabled: boolean) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled) return;

    const resetTimer = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => onIdleRef.current(), timeoutMs);
    };

    resetTimer();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [enabled, timeoutMs]);
}
