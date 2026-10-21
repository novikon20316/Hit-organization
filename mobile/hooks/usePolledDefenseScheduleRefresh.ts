// hooks/usePolledDefenseScheduleRefresh.ts
// useDefenseScheduleLiveRefresh for the external examiner pages
// (examiner-access, defense-access), which have no Firebase session and so
// can't listen to config/defenseScheduleChangeSignal. Polls the same marker
// through a public, data-free endpoint instead
// (server/src/services/defenseScheduleChangeSignal.ts) and calls `refetch`
// when it moves. Never fires on mount.
//
// The marker moves for ANY project's defense, and these pages' own token
// endpoints are limited to 20 requests per 15 minutes per IP — so re-fetches
// are spaced at least MIN_REFETCH_GAP_MS apart (a change inside the gap is
// picked up when it ends), keeping a busy scheduling day from locking an
// examiner out of their own page.

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { apiClient } from '../src/api/apiClient';

const POLL_MS = 15_000;
const MIN_REFETCH_GAP_MS = 90_000;

export function usePolledDefenseScheduleRefresh(refetch: () => unknown) {
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    let cancelled = false;
    let lastSeen: number | null = null;
    let lastRefetchAt = 0;
    let pendingRefetch: ReturnType<typeof setTimeout> | null = null;

    const runRefetch = () => {
      pendingRefetch = null;
      lastRefetchAt = Date.now();
      refetchRef.current();
    };

    const poll = async () => {
      let changedAt: number;
      try {
        changedAt = (await apiClient.get('/api/change-signals/defense-schedule')).data?.changedAt ?? 0;
      } catch {
        return; // non-critical — try again next tick
      }
      if (cancelled) return;
      if (lastSeen === null) {
        lastSeen = changedAt;
        return;
      }
      if (changedAt === lastSeen) return;
      lastSeen = changedAt;
      if (pendingRefetch) return;
      const wait = lastRefetchAt + MIN_REFETCH_GAP_MS - Date.now();
      if (wait <= 0) runRefetch();
      else pendingRefetch = setTimeout(runRefetch, wait);
    };

    // Only while the app is in the foreground; catch up as soon as it returns.
    poll();
    const interval = setInterval(() => { if (AppState.currentState === 'active') poll(); }, POLL_MS);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') poll(); });
    return () => {
      cancelled = true;
      clearInterval(interval);
      sub.remove();
      if (pendingRefetch) clearTimeout(pendingRefetch);
    };
  }, []);
}
