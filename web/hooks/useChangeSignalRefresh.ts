'use client';

// hooks/useChangeSignalRefresh.ts
// Calls `refetch` whenever the server bumps config/<signalDocId> — a marker
// doc the server maintains by watching a collection (see
// server/src/services/changeSignal.ts), so it catches changes from any
// source: another user, a background job, an Admin-SDK script. The screen
// re-fetches its own scoped endpoint, so what each role can see is
// unchanged. Never fires on mount — the screen's own initial load covers
// that. Use the named wrappers (useUsersLiveRefresh,
// useDefenseScheduleLiveRefresh) rather than this directly.

import { useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

// Several staff can be editing at once; one re-fetch per short burst is enough.
const REFETCH_DEBOUNCE_MS = 500;

export function useChangeSignalRefresh(signalDocId: string, refetch: () => unknown) {
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    let unsubSignal: Unsubscribe | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubSignal?.();
      unsubSignal = null;
      if (!user) return;
      let lastSeen: number | null = null;
      unsubSignal = onSnapshot(
        doc(db, 'config', signalDocId),
        (snap) => {
          const changedAt = snap.data()?.changedAt?.toMillis?.() ?? 0;
          if (lastSeen === null) {
            lastSeen = changedAt;
            return;
          }
          if (changedAt === lastSeen) return;
          lastSeen = changedAt;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => refetchRef.current(), REFETCH_DEBOUNCE_MS);
        },
        // Non-critical: the screen still works, it just won't auto-refresh.
        (err) => console.warn(`${signalDocId} listener failed:`, err)
      );
    });
    return () => {
      unsubAuth();
      unsubSignal?.();
      if (timer) clearTimeout(timer);
    };
  }, [signalDocId]);
}
