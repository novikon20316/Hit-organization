import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

import {
  initializeAuth,
  getAuth,
  Auth,
  getReactNativePersistence,
} from "firebase/auth";

import { initializeAppCheck, CustomProvider, type AppCheck } from "firebase/app-check";
import { getApp as getNativeApp } from "@react-native-firebase/app";
import {
  initializeAppCheck as initializeNativeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from "@react-native-firebase/app-check";
import Constants from "expo-constants";

import { secureStorage } from "./secureStorage";

const firebaseConfig = {
  apiKey: "AIzaSyD7v2PB_ics4bDV346BxeIZjFvkbSHvjiM",
  authDomain: "hit-organization.firebaseapp.com",
  projectId: "hit-organization",
  storageBucket: "hit-organization.appspot.com",
  messagingSenderId: "432175584982",
  appId: "1:432175584982:web:b2c0a54e4309e4d3175b77",
  measurementId: "G-TMNFYG6N67"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);

// App Check — the plain `firebase/app-check` package (used above via the JS
// modular SDK) has no Play Integrity/App Attest provider of its own on React
// Native (its ReCaptchaV3Provider/ReCaptchaEnterpriseProvider are web-only).
// Real native attestation comes from @react-native-firebase/app-check
// instead, bridged in here via CustomProvider so this file's own
// `db`/`auth` (used directly for reads like login.tsx's getDoc) actually
// carry the real native-attested token — see the App Check hardening plan
// for why this two-SDK bridge is the correct, intended approach rather than
// a workaround. `getNativeApp()` is @react-native-firebase/app's own
// (separate) app instance, auto-configured at launch from
// GoogleService-Info.plist/google-services.json — no explicit
// initializeApp() call needed for it.
//
// GUARDED on extra.appCheckReady, same reasoning as web/lib/firebase.ts's own
// guard on NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY (confirmed live 2026-09-30: an
// unguarded App Check init broke the entire web app in production the moment
// its provider couldn't get a real token). The Android Play Integrity / iOS
// App Attest external setup (SHA-256 fingerprint + Play Console linkage;
// Apple Developer account) was flagged as incomplete when this code was
// written, and once initialized, App Check auto-attaches to every Firestore/
// Auth call on this shared `app` instance — so a failing native getToken()
// here doesn't just skip App Check, it can break login and every other
// Firestore/Auth call outright. Server-side enforcement is also still
// UNENFORCED for both Firestore and Identity Toolkit, so there is zero
// functional benefit to forcing this on before it's verified working.
// Flip appCheckReady to true (and rebuild) once that external setup is
// actually done and confirmed on a real device.
const appCheckReady = (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.appCheckReady === true;

export let appCheck: AppCheck | undefined;
if (appCheckReady) {
  const rnfbAppCheckProvider = new ReactNativeFirebaseAppCheckProvider();
  rnfbAppCheckProvider.configure({
    android: { provider: __DEV__ ? "debug" : "playIntegrity" },
    apple: { provider: __DEV__ ? "debug" : "appAttestWithDeviceCheckFallback" },
  });
  initializeNativeAppCheck(getNativeApp(), {
    provider: rnfbAppCheckProvider,
    isTokenAutoRefreshEnabled: true,
  });

  appCheck = initializeAppCheck(app, {
    isTokenAutoRefreshEnabled: true,
    provider: new CustomProvider({
      // Delegates to the native provider's own getToken() (not the module-level
      // getToken(appCheckInstance) helper, which returns a narrower
      // { token }-only shape) — this one returns the full { token,
      // expireTimeMillis } the plain JS SDK's CustomProvider expects.
      getToken: () => rnfbAppCheckProvider.getToken(),
    }),
  });
}

// 🔥 IMPORTANT: prevent double init (this fixes auth/already-initialized)
let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(secureStorage),
  });
} catch (e) {
  // already initialized (hot reload / fast refresh)
  auth = getAuth(app);
}

export { auth };