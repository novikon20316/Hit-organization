'use client';

// hooks/usePresenceHeartbeat.ts
// Feeds the system_admin-only "Live Transportation" live-user-count page
// (see server/src/controllers/presenceController.ts) — every signed-in web
// session sends a heartbeat while mounted so it counts as "active now" for
// as long as roughly HEARTBEAT_INTERVAL_MS keeps landing.

import { useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

const HEARTBEAT_INTERVAL_MS = 25_000;

export function usePresenceHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const send = () => {
      // silent: true — a missed heartbeat just means this session briefly
      // drops out of the live count, not a system_admin-worthy incident.
      // Without this, the 25s interval makes this by far the noisiest path
      // through the generic network_failure alerting in apiClient.ts.
      apiClient.post('/api/presence/heartbeat', { platform: 'web' }, { silent: true }).catch(() => {});
    };

    send();
    const id = setInterval(send, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled]);
}
