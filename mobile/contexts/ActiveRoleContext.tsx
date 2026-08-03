// contexts/ActiveRoleContext.tsx
// Lets a multi-role user (e.g. system_admin who's also a supervisor) pick
// which role's dashboard they're currently viewing — see components/shared.tsx's
// TopBar role switcher. State here is populated by app/_layout.tsx's existing
// profile-fetch effect (no extra network call); switching persists the choice
// (firebase/activeRole.ts) and navigates to that role's home route.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import type { AppRole } from '@/components/i18n';
import { getHomeRoute } from '@/firebase/roles';
import { setStoredActiveRole } from '@/firebase/activeRole';

interface ActiveRoleContextValue {
  /** All distinct roles the signed-in user holds. */
  roles: AppRole[];
  /** Which of `roles` the user is currently viewing the app as. */
  activeRole: AppRole | undefined;
  /** Called by app/_layout.tsx whenever a fresh profile is loaded (login,
   *  auth-state change) — not for the user's own role switch. */
  sync: (uid: string, roles: AppRole[], activeRole: AppRole | undefined) => void;
  /** Switches the active role: persists the choice and navigates to that
   *  role's home route. */
  setActiveRole: (role: AppRole) => void;
}

const ActiveRoleContext = createContext<ActiveRoleContextValue | null>(null);

export function ActiveRoleProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [activeRole, setActiveRoleState] = useState<AppRole | undefined>(undefined);

  const sync = useCallback((newUid: string, newRoles: AppRole[], newActiveRole: AppRole | undefined) => {
    setUid(newUid);
    setRoles(newRoles);
    setActiveRoleState(newActiveRole);
  }, []);

  const setActiveRole = useCallback((role: AppRole) => {
    if (!uid) return;
    setStoredActiveRole(uid, role);
    setActiveRoleState(role);
    router.replace(getHomeRoute(role) as any);
  }, [uid, router]);

  return (
    <ActiveRoleContext.Provider value={{ roles, activeRole, sync, setActiveRole }}>
      {children}
    </ActiveRoleContext.Provider>
  );
}

export function useActiveRole(): ActiveRoleContextValue {
  const ctx = useContext(ActiveRoleContext);
  if (!ctx) throw new Error('useActiveRole must be used within an ActiveRoleProvider');
  return ctx;
}
