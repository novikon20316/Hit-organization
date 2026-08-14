// contexts/ActiveRoleContext.tsx
// A multi-role user (e.g. system_admin who's also a supervisor) always sees
// their highest-ranked role's dashboard — no manual switching (see
// firebase/roles.ts's highestRankedRole). State here is populated by
// app/_layout.tsx's existing profile-fetch effect (no extra network call).
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AppRole } from '@/components/i18n';
import { highestRankedRole } from '@/firebase/roles';

interface ActiveRoleContextValue {
  /** All distinct roles the signed-in user holds. */
  roles: AppRole[];
  /** Which role's dashboard this user sees — always their highest-ranked role. */
  activeRole: AppRole | undefined;
  /** Called by app/_layout.tsx whenever a fresh profile is loaded (login,
   *  auth-state change). */
  sync: (uid: string, roles: AppRole[]) => void;
}

const ActiveRoleContext = createContext<ActiveRoleContextValue | null>(null);

export function ActiveRoleProvider({ children }: { children: ReactNode }) {
  const [roles, setRoles] = useState<AppRole[]>([]);

  const sync = useCallback((_newUid: string, newRoles: AppRole[]) => {
    setRoles(newRoles);
  }, []);

  const activeRole = useMemo(() => highestRankedRole(roles), [roles]);

  return (
    <ActiveRoleContext.Provider value={{ roles, activeRole, sync }}>
      {children}
    </ActiveRoleContext.Provider>
  );
}

export function useActiveRole(): ActiveRoleContextValue {
  const ctx = useContext(ActiveRoleContext);
  if (!ctx) throw new Error('useActiveRole must be used within an ActiveRoleProvider');
  return ctx;
}
