'use client';

// contexts/AuthContext.tsx
// Web counterpart to what mobile's app/_layout.tsx does inline: listen for
// Firebase auth state, then live-subscribe to the matching Firestore user
// doc so role/profile changes (e.g. an admin flips isActive) reflect
// immediately without a manual refresh.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { UserDoc } from '@/lib/roles';

interface AuthContextValue {
  firebaseUser: User | null;
  userData: UserDoc | null;
  /** True until we've resolved BOTH the Firebase auth state and (if signed
   *  in) the first Firestore snapshot. Render a loading state until this
   *  flips false to avoid a flash of the wrong screen. */
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Plain presence flag read by proxy.ts (Next's Proxy runs before this
// component ever mounts, so it can't ask AuthContext directly) — never the
// actual Firebase ID token. See proxy.ts for why that split matters.
const SESSION_COOKIE = 'session_active';
const SESSION_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60; // matches the "stay signed in" intent of browserLocalPersistence below

function setSessionCookie() {
  if (typeof document === 'undefined') return;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${SESSION_COOKIE}=1; path=/; max-age=${SESSION_COOKIE_MAX_AGE_S}; SameSite=Lax${secure}`;
}

function clearSessionCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserDoc | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [profileResolved, setProfileResolved] = useState(false);

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
        setUserData(snap.exists() ? (snap.data() as UserDoc) : null);
        setProfileResolved(true);
      },
      (err) => {
        console.error('Failed to subscribe to user profile:', err);
        setProfileResolved(true);
      }
    );
    return unsubscribe;
  }, [firebaseUser]);

  const logout = async () => {
    // Cleared eagerly, before the async signOut() below resolves — closes
    // the window where clicking "sign out" and immediately pressing back
    // would still find the cookie present and slip past proxy.ts.
    clearSessionCookie();
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userData,
        loading: !authResolved || !profileResolved,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
