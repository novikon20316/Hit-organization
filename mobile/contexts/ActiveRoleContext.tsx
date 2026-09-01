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
  /** This user's own facultyId (may be 'all' for the cross-faculty roles —
   *  see web/lib/roles.ts's CROSS_FACULTY_ROLES). Used by
   *  CreateOwnProjectButton so a multi-role staff member (e.g. a coordinator
   *  who's also a supervisor) can post their own project from whichever
   *  dashboard they land on, without a second fetch. */
  facultyId: string;
  /** This user's saved language preference — carried through so
   *  OnboardingTourOverlay (mounted once at the app root) doesn't need its
   *  own profile fetch just to know which language to render in. */
  language: 'he' | 'en';
  /** False/undefined until the user has finished or dismissed their
   *  one-time first-login onboarding tour — see
   *  contexts/OnboardingTourContext.tsx / components/onboarding/
   *  OnboardingTourOverlay.tsx. */
  hasSeenOnboardingTour: boolean;
  /** Optimistically flips hasSeenOnboardingTour locally the moment the tour
   *  is finished/dismissed, so the overlay hides immediately instead of
   *  waiting on a fresh profile fetch. */
  markOnboardingTourSeen: () => void;
  /** Called by app/_layout.tsx whenever a fresh profile is loaded (login,
   *  auth-state change). */
  sync: (
    uid: string,
    roles: AppRole[],
    facultyId: string,
    language?: 'he' | 'en',
    hasSeenOnboardingTour?: boolean,
  ) => void;
}

const ActiveRoleContext = createContext<ActiveRoleContextValue | null>(null);

export function ActiveRoleProvider({ children }: { children: ReactNode }) {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [facultyId, setFacultyId] = useState('');
  const [language, setLanguage] = useState<'he' | 'en'>('he');
  const [hasSeenOnboardingTour, setHasSeenOnboardingTour] = useState(false);

  const sync = useCallback((
    _newUid: string,
    newRoles: AppRole[],
    newFacultyId: string,
    newLanguage?: 'he' | 'en',
    newHasSeenOnboardingTour?: boolean,
  ) => {
    setRoles(newRoles);
    setFacultyId(newFacultyId ?? '');
    if (newLanguage) setLanguage(newLanguage);
    setHasSeenOnboardingTour(!!newHasSeenOnboardingTour);
  }, []);

  const markOnboardingTourSeen = useCallback(() => setHasSeenOnboardingTour(true), []);

  const activeRole = useMemo(() => highestRankedRole(roles), [roles]);

  return (
    <ActiveRoleContext.Provider
      value={{ roles, activeRole, facultyId, language, hasSeenOnboardingTour, markOnboardingTourSeen, sync }}
    >
      {children}
    </ActiveRoleContext.Provider>
  );
}

export function useActiveRole(): ActiveRoleContextValue {
  const ctx = useContext(ActiveRoleContext);
  if (!ctx) throw new Error('useActiveRole must be used within an ActiveRoleProvider');
  return ctx;
}
