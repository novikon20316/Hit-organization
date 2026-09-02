'use client';

// contexts/AuthContext.tsx
// Web counterpart to what mobile's app/_layout.tsx does inline: listen for
// Firebase auth state, then live-subscribe to the matching Firestore user
// doc so role/profile changes (e.g. an admin flips isActive) reflect
// immediately without a manual refresh.

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { getUserRoles, resolveActiveRole, type AppRole, type UserDoc } from '@/lib/roles';
import { resolveTrackPolicy } from '@/lib/studentTrack';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { SessionExpiredModal } from '@/components/SessionExpiredModal';

// Same staleness bug as server/src/controllers/userController.ts's
// withRecomputedEligibility: trackPolicy was previously written once at
// signup (or by the one-off backfillStudentTracks.ts migration) and never
// recomputed, so a student account created before that migration ran has no
// trackPolicy field at all — silently skipping useRequireRole's mandatory
// choose-track redirect below as if their program had no thesis-eligibility
// gate. This context reads the Firestore doc directly (not through the API,
// so the server-side fix alone doesn't cover it) — recompute live from the
// current degreeType/major on every snapshot instead of trusting the stored
// field.
function withRecomputedTrackPolicy(data: UserDoc): UserDoc {
  if (data.role !== 'student') return data;
  return { ...data, trackPolicy: resolveTrackPolicy(data.degreeType ?? null, data.major ?? null) };
}

// After this long with no mouse/keyboard/touch activity, we assume the
// Firebase ID token is stale enough that API calls will start failing in
// confusing ways (the "site just stops responding" symptom this guards
// against) — so we proactively force a re-login instead.
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

interface AuthContextValue {
  firebaseUser: User | null;
  userData: UserDoc | null;
  /** True until we've resolved BOTH the Firebase auth state and (if signed
   *  in) the first Firestore snapshot. Render a loading state until this
   *  flips false to avoid a flash of the wrong screen. */
  loading: boolean;
  logout: () => Promise<void>;
  /** Lets a page register a callback to run right before the actual
   *  sign-out (Firebase signOut) — e.g. calling a backend logout endpoint
   *  or unsubscribing live Firestore listeners first. Sign-out itself now
   *  lives in the sidebar (SidebarShell), outside any individual page, so
   *  this is how a page-specific cleanup step still runs: register on
   *  mount, pass `null` on unmount. Failures here don't block sign-out. */
  registerBeforeSignOut: (fn: (() => void | Promise<void>) | null) => void;
  /** All distinct roles the signed-in user holds (primary `role` + `roles[]`,
   *  deduped) — see lib/roles.ts's getUserRoles. */
  roles: AppRole[];
  /** Which role's dashboard this user sees — always their highest-ranked
   *  role (see lib/roles.ts's resolveActiveRole/highestRankedRole); no
   *  manual switching. */
  activeRole: AppRole | undefined;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Plain presence flag read by proxy.ts (Next's Proxy runs before this
// component ever mounts, so it can't ask AuthContext directly) — never the
// actual Firebase ID token. See proxy.ts for why that split matters.
//
// MUST be named `__session`: Firebase Hosting strips every other cookie
// when rewriting to Cloud Run, so `session_active` never reached proxy.ts
// and login bounced back to /login with no error. See
// https://firebase.google.com/docs/hosting/manage-cache#using_cookies
const SESSION_COOKIE = '__session';
const LEGACY_SESSION_COOKIE = 'session_active';
const SESSION_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60; // matches the "stay signed in" intent of browserLocalPersistence below

// Exported so a fresh sign-in can set this cookie itself immediately,
// instead of only ever relying on the onAuthStateChanged listener below —
// that listener runs on its own schedule (gated behind an async
// browserLocalPersistence/IndexedDB write), and a caller's own
// router.replace() to a protected route can fire before it, losing the race
// against proxy.ts's cookie check and bouncing straight back to /login.
export function setSessionCookie() {
  if (typeof document === 'undefined') return;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${SESSION_COOKIE}=1; path=/; max-age=${SESSION_COOKIE_MAX_AGE_S}; SameSite=Lax${secure}`;
}

function clearSessionCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  document.cookie = `${LEGACY_SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserDoc | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [profileResolved, setProfileResolved] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const activeRole = useMemo(() => resolveActiveRole(userData), [userData]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthResolved(true);
      if (!user) {
        setUserData(null);
        setProfileResolved(true);
        clearSessionCookie();
      } else {
        // New/changed user — the Firestore subscription below hasn't run
        // yet, so mark the profile as not-yet-loaded. Doing this inside the
        // auth-state callback (not the second effect's body) is what keeps
        // this a "setState from a subscription callback", not a
        // synchronous setState-in-effect.
        setProfileResolved(false);
        setSessionCookie();
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsubscribe = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snap) => {
        setUserData(snap.exists() ? withRecomputedTrackPolicy(snap.data() as UserDoc) : null);
        setProfileResolved(true);
      },
      (err) => {
        console.error('Failed to subscribe to user profile:', err);
        setProfileResolved(true);
      }
    );
    return unsubscribe;
  }, [firebaseUser]);

  const beforeSignOutRef = useRef<(() => void | Promise<void>) | null>(null);
  const registerBeforeSignOut = (fn: (() => void | Promise<void>) | null) => {
    beforeSignOutRef.current = fn;
  };

  const logout = async () => {
    try {
      await beforeSignOutRef.current?.();
    } catch (err) {
      console.error('registerBeforeSignOut callback failed — continuing with sign-out anyway:', err);
    }
    // Cleared eagerly, before the async signOut() below resolves — closes
    // the window where clicking "sign out" and immediately pressing back
    // would still find the cookie present and slip past proxy.ts.
    clearSessionCookie();
    await signOut(auth);
  };

  // Only watch for idle time once a user is actually signed in — no point
  // arming this on /login itself.
  useIdleTimer(() => setSessionExpired(true), IDLE_TIMEOUT_MS, !!firebaseUser);

  const handleSessionExpiredConfirm = () => {
    // Deliberately not `await logout()` here: signOut() can hang on a
    // network call for a long time if the connection is in exactly the
    // stale state that got us into this idle-timeout flow in the first
    // place — the whole point of this alert is to recover from that, so
    // the redirect can't wait on it. Clear local auth state synchronously
    // instead (so the login page doesn't see a truthy firebaseUser and
    // bounce straight back to the dashboard), navigate, then let the real
    // signOut() finish in the background.
    setSessionExpired(false);
    clearSessionCookie();
    setFirebaseUser(null);
    setUserData(null);
    router.replace('/login');
    signOut(auth).catch(() => {});
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userData,
        loading: !authResolved || !profileResolved,
        logout,
        registerBeforeSignOut,
        roles: getUserRoles(userData),
        activeRole,
      }}
    >
      {children}
      <SessionExpiredModal open={sessionExpired} onConfirm={handleSessionExpiredConfirm} />
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
