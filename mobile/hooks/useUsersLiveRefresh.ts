// hooks/useUsersLiveRefresh.ts
// Calls `refetch` whenever any user account is added, edited or removed —
// including ones created behind the scenes (an Admin-SDK seed script, a bulk
// import, another staff member). Mirrors web's hook of the same name.
// Sibling of useLiveRefresh.ts, which only fires on the signed-in user's own
// notifications and so never sees a new account appear. Driven by config/usersChangeSignal, a marker doc the server
// bumps (see server/src/services/usersChangeSignal.ts); the screen re-fetches
// its own scoped endpoint, so what each role can see is unchanged. Never
// fires on mount — the screen's own initial load covers that.

import { useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { auth, db } from '../src/firebase/firebase';

// Several staff can be editing at once; one re-fetch per short burst is enough.
const REFETCH_DEBOUNCE_MS = 500;

export function useUsersLiveRefresh(refetch: () => unknown) {
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
        doc(db, 'config', 'usersChangeSignal'),
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
        // Non-critical: the list still works, it just won't auto-refresh.
        (err) => console.warn('usersChangeSignal listener failed:', err)
      );
    });
    return () => {
      unsubAuth();
      unsubSignal?.();
      if (timer) clearTimeout(timer);
    };
  }, []);
}
