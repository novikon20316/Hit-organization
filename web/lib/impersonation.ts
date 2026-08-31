// lib/impersonation.ts
//
// Temporary debug tool (see server/src/config/featureFlags.ts's
// IMPERSONATION_ENABLED) — tracks an in-progress system_admin "view as
// another user" session in this tab only. sessionStorage (not localStorage)
// deliberately: the session dies with the tab, limiting how long a stray
// return token stays reachable.

const STORAGE_KEY = 'impersonation_session';

export interface ImpersonationSession {
  adminReturnToken: string;
  adminUid: string;
  adminDisplayName: string;
  targetUid: string;
  targetDisplayName: string;
  targetEmail: string;
  startedAt: string;
}

export function getActiveImpersonation(): ImpersonationSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ImpersonationSession) : null;
  } catch {
    return null;
  }
}

export function setActiveImpersonation(session: ImpersonationSession) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearActiveImpersonation() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
}
