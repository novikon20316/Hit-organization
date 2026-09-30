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
import { getAuth, browserLocalPersistence, setPersistence, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

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

// App Check — protects Firestore/Auth (once enforcement is enabled in
// Firebase Console) and the custom Express API (via the X-Firebase-AppCheck
// header apiClient.ts attaches) from traffic that isn't the real web app.
// Uses Fraud Defense (formerly reCAPTCHA Enterprise) — classic reCAPTCHA v3
// can no longer even be newly registered in Firebase Console as of 2026, so
// this is the only viable provider now, despite the "v3" naming still used
// in some docs. Free for the first 10,000 assessments/month, comfortably
// covering this app's real scale (measured ~28 MAU). Browser-only (needs a
// DOM/window), same guard as the setPersistence call below — must not run
// during next build's prerender pass. Debug token lets local dev keep
// working once Console enforcement is eventually turned on for real (see
// Firebase App Check docs on debug providers) — never set in production.
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}
// Guarded on the site key being actually set — the provider throws
// synchronously on an empty/undefined siteKey (confirmed live 2026-09-30:
// this broke the entire app, every page stuck loading, until this guard was
// added). Safe/inert by default; real protection only turns on once
// NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY is actually set.
const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;
export const appCheck = typeof window !== 'undefined' && recaptchaSiteKey
  ? initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
  : undefined;

// "Sign in with Google" — requires Google enabled as a sign-in provider in
// Firebase Console (Authentication > Sign-in method) before this does
// anything useful; the provider instance itself needs no config.
export const googleProvider = new GoogleAuthProvider();

// "Sign in with Apple" — requires Apple enabled as a sign-in provider in
// Firebase Console, plus a Services ID + registered return URL in Apple
// Developer (Certificates, Identifiers & Profiles > Sign in with Apple).
export const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');

// Explicit, rather than relying on the default — makes the "stay signed in
// across tabs/refreshes" behavior a documented choice, not an SDK default
// that changes on us later. Browser-only; skipped during SSR/build.
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
  });
}
