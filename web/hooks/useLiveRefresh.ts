'use client';

// hooks/useLiveRefresh.ts
// Calls `refetch` whenever a new notification arrives for the signed-in user
// (see NotificationsContext.tsx's liveEventTick) — every meaningful
// workflow event (a submission, an approval/rejection, a committee decision,
// a conflict-of-interest hold) already notifies whoever it concerns, so this
// is the one generic "something happened to you, reload what you're looking
// at" trigger, instead of a bespoke Firestore listener per screen. Never
// fires on mount — the screen's own initial load covers that.
//
// Also re-fetches when the tab comes back into view after a while hidden —
// a laptop waking from sleep, or a change that didn't notify this user
// (another staff member acting on a shared queue).

import { useEffect, useRef } from 'react';
import { useNotifications } from '@/contexts/NotificationsContext';

// A quick alt-tab away and back isn't worth a re-fetch.
const REFRESH_AFTER_HIDDEN_MS = 30_000;

export function useLiveRefresh(refetch: () => unknown) {
  const { liveEventTick } = useNotifications();
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  const lastTick = useRef(liveEventTick);
  useEffect(() => {
    if (liveEventTick === lastTick.current) return;
    lastTick.current = liveEventTick;
    refetchRef.current();
  }, [liveEventTick]);

  useEffect(() => {
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (hiddenAt !== null) {
        if (Date.now() - hiddenAt >= REFRESH_AFTER_HIDDEN_MS) refetchRef.current();
        hiddenAt = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
}
