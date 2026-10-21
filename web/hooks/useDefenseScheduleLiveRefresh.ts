'use client';

// hooks/useDefenseScheduleLiveRefresh.ts
// Calls `refetch` whenever any defense's scheduling changes — examiners/panel
// assigned, a candidate-date round submitted or resolved, the date agreed or
// moved, the defense status, or its logistics (time, building, room, Zoom /
// in-person / hybrid) — whoever made the change, including an Admin-SDK
// script. Driven by config/defenseScheduleChangeSignal (see
// server/src/services/defenseScheduleChangeSignal.ts and
// useChangeSignalRefresh.ts). Fires for any project's defense, not just the
// ones on screen — the screen's re-fetch is scoped, and defense changes are
// rare enough that filtering client-side isn't worth it.

import { useChangeSignalRefresh } from './useChangeSignalRefresh';

export function useDefenseScheduleLiveRefresh(refetch: () => unknown) {
  useChangeSignalRefresh('defenseScheduleChangeSignal', refetch);
}
