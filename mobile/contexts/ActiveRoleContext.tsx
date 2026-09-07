// contexts/ActiveRoleContext.tsx
// A multi-role user (e.g. system_admin who's also a supervisor) sees their
// highest-ranked role's dashboard by default (see firebase/roles.ts's
// highestRankedRole), but can manually switch into any other role they hold
// via setActiveRole below — persisted per-uid in SecureStore so it survives
// app restarts, and dropped automatically if that role is later revoked.
// Base role/facultyId/etc. state here is populated by app/_layout.tsx's
// existing profile-fetch effect (no extra network call).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { AppRole } from '@/components/i18n';
import { highestRankedRole, isValidRole } from '@/firebase/roles';

function activeRoleStorageKey(uid: string): string {
  return `active_role_${uid.replace(/[^\w.-]/g, '_')}`;
}

interface ActiveRoleContextValue {
  /** All distinct roles the signed-in user holds. */
  roles: AppRole[];
  /** Which role's dashboard/tabs this user currently sees — their highest-
   *  ranked role unless they've manually switched via setActiveRole, in
   *  which case whichever role they last picked (persisted, reset if that
   *  role is later revoked). */
  activeRole: AppRole | undefined;
  /** This user's actual highest-ranked role, regardless of any manual
   *  switch — the role setActiveRole(mainRole) returns them to. */
  mainRole: AppRole | undefined;
  /** Manually switch which of the user's own roles' tabs/dashboard is
   *  shown. Must be one of `roles`; persists across app restarts until
   *  changed again or the role is revoked. */
  setActiveRole: (role: AppRole) => void;
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
  /** guideKeys of first-visit field-explanation walkthroughs (see
   *  components/guidance/FieldGuideOverlay.tsx) this user has already
   *  finished or dismissed — per-tab/per-form granularity, unlike the
   *  single app-wide hasSeenOnboardingTour above. */
  seenFieldGuides: string[];
  /** Optimistically appends one guideKey to seenFieldGuides locally the
   *  moment that walkthrough is finished/dismissed, mirroring
   *  markOnboardingTourSeen above. */
  markFieldGuideSeen: (guideKey: string) => void;
  /** Called by app/_layout.tsx whenever a fresh profile is loaded (login,
   *  auth-state change). */
  sync: (
    uid: string,
    roles: AppRole[],
    facultyId: string,
    language?: 'he' | 'en',
    hasSeenOnboardingTour?: boolean,
    seenFieldGuides?: string[],
  ) => void;
}

const ActiveRoleContext = createContext<ActiveRoleContextValue | null>(null);

export function ActiveRoleProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState('');
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [facultyId, setFacultyId] = useState('');
  const [language, setLanguage] = useState<'he' | 'en'>('he');
  const [hasSeenOnboardingTour, setHasSeenOnboardingTour] = useState(false);
  const [seenFieldGuides, setSeenFieldGuides] = useState<string[]>([]);
  const [activeRoleOverride, setActiveRoleOverride] = useState<AppRole | null>(null);

  const sync = useCallback((
    newUid: string,
    newRoles: AppRole[],
    newFacultyId: string,
    newLanguage?: 'he' | 'en',
    newHasSeenOnboardingTour?: boolean,
    newSeenFieldGuides?: string[],
  ) => {
    setUid(newUid);
    setRoles(newRoles);
    setFacultyId(newFacultyId ?? '');
    if (newLanguage) setLanguage(newLanguage);
    setHasSeenOnboardingTour(!!newHasSeenOnboardingTour);
    setSeenFieldGuides(newSeenFieldGuides ?? []);
  }, []);

  const markOnboardingTourSeen = useCallback(() => setHasSeenOnboardingTour(true), []);
  const markFieldGuideSeen = useCallback((guideKey: string) => {
    setSeenFieldGuides((prev) => (prev.includes(guideKey) ? prev : [...prev, guideKey]));
  }, []);

  const mainRole = useMemo(() => highestRankedRole(roles), [roles]);

  // Load whatever role this uid was last manually switched into, once we
  // know who's signed in.
  useEffect(() => {
    if (!uid) { setActiveRoleOverride(null); return; }
    let cancelled = false;
    SecureStore.getItemAsync(activeRoleStorageKey(uid))
      .then((stored) => { if (!cancelled) setActiveRoleOverride(isValidRole(stored) ? stored : null); })
      .catch(() => { if (!cancelled) setActiveRoleOverride(null); });
    return () => { cancelled = true; };
  }, [uid]);

  // Drop the override the moment it names a role this account no longer
  // holds (e.g. an admin revoked it while the user was switched into it) —
  // falls back to mainRole rather than showing a dead role's tabs.
  useEffect(() => {
    if (!activeRoleOverride || roles.length === 0) return;
    if (!roles.includes(activeRoleOverride)) {
      setActiveRoleOverride(null);
      if (uid) SecureStore.deleteItemAsync(activeRoleStorageKey(uid)).catch(() => {});
    }
  }, [activeRoleOverride, roles, uid]);

  const setActiveRole = useCallback((role: AppRole) => {
    setActiveRoleOverride(role);
    if (uid) SecureStore.setItemAsync(activeRoleStorageKey(uid), role).catch(() => {});
  }, [uid]);

  const activeRole = activeRoleOverride ?? mainRole;

  return (
    <ActiveRoleContext.Provider
      value={{
        roles, activeRole, mainRole, setActiveRole, facultyId, language,
        hasSeenOnboardingTour, markOnboardingTourSeen,
        seenFieldGuides, markFieldGuideSeen,
        sync,
      }}
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
