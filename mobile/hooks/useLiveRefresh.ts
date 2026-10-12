// hooks/useLiveRefresh.ts
// Calls `refetch` whenever a new notification arrives for the signed-in user
// (see src/context/NotificationsContext.tsx's liveEventTick) — every
// meaningful workflow event (a submission, an approval/rejection, a
// committee decision, a conflict-of-interest hold) already notifies whoever
// it concerns, so this is the one generic "something happened to you,
// reload what you're looking at" trigger. Mirrors web's hook of the same
// name. Never fires on mount — the screen's own initial load covers that.

import { useEffect, useRef } from 'react';
import { useNotifications } from '../src/context/NotificationsContext';

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
}
