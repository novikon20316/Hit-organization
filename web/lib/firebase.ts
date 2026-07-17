// lib/firebase.ts
// Web counterpart to mobile/src/firebase/firebase.ts — same Firebase project,
// same Auth + Firestore. No secureStorage/chunking hack needed here: the
// Firebase JS SDK already ships its own browser persistence (IndexedDB, with
// a localStorage fallback), so getAuth() just works.
//
// Config values come from NEXT_PUBLIC_* env vars, falling back to the values
// already baked into the mobile app.json — Firebase web config is not a
// secret (it's shipped inside every client bundle by design; access control
// happens via Firestore security rules + this server's verifyToken middleware,
// not by hiding these values). Still, prefer setting real env vars in
// production so config lives in one place. See .env.local.example.

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyD7v2PB_ics4bDV346BxeIZjFvkbSHvjiM',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'hit-organization.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'hit-organization',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'hit-organization.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '432175584982',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '1:432175584982:web:b2c0a54e4309e4d3175b77',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? 'G-TMNFYG6N67',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

// Explicit, rather than relying on the default — makes the "stay signed in
// across tabs/refreshes" behavior a documented choice, not an SDK default
// that changes on us later. Browser-only; skipped during SSR/build.
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.error('Failed to set Firebase auth persistence:', err);
  });
}
