'use client';

// hooks/useMilestoneChangeRefresh.ts
// Calls `refetch` when one of the signed-in user's milestones changes — as a
// student, supervisor or secondary supervisor. Listens to their own
// milestoneSignals/{uid} marker (server/src/services/milestoneChangeSignal.ts),
// never to milestone docs themselves: those carry examiner-only forms and
// unreleased grades, so these roles read milestones only through the API.
// Never fires on mount — the screen's own initial load covers that.

import { useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

// A multi-field server write lands as one bump; fold stragglers anyway.
const REFETCH_DEBOUNCE_MS = 250;

export function useMilestoneChangeRefresh(refetch: () => unknown, enabled = true) {
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    if (!enabled) return;
    let unsubSignal: Unsubscribe | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubSignal?.();
      unsubSignal = null;
      if (!user) return;
      let lastSeen: number | null = null;
      unsubSignal = onSnapshot(
        doc(db, 'milestoneSignals', user.uid),
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
        () => {}
      );
    });
    return () => {
      unsubAuth();
      unsubSignal?.();
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);
}
