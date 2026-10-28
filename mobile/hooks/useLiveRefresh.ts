// hooks/useLiveRefresh.ts
// Calls `refetch` whenever a new notification arrives for the signed-in user
// (see src/context/NotificationsContext.tsx's liveEventTick) — every
// meaningful workflow event (a submission, an approval/rejection, a
// committee decision, a conflict-of-interest hold) already notifies whoever
// it concerns, so this is the one generic "something happened to you,
// reload what you're looking at" trigger. Mirrors web's hook of the same
// name. Never fires on mount — the screen's own initial load covers that.
//
// Also re-fetches when the screen regains focus (navigating back to it) and
// when the app returns to the foreground after a while — so a list isn't
// left showing what it looked like before the user went and acted on it.

import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useNotifications } from '../src/context/NotificationsContext';

// A quick app switch away and back isn't worth a re-fetch.
const REFRESH_AFTER_BACKGROUND_MS = 30_000;

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

  // The first focus is the mount itself — skip it like the tick above does.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) refetchRef.current();
      focusedOnce.current = true;
    }, [])
  );

  useEffect(() => {
    let backgroundedAt: number | null = null;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (backgroundedAt !== null && Date.now() - backgroundedAt >= REFRESH_AFTER_BACKGROUND_MS) {
          refetchRef.current();
        }
        backgroundedAt = null;
      } else if (backgroundedAt === null) {
        backgroundedAt = Date.now();
      }
    });
    return () => sub.remove();
  }, []);
}
