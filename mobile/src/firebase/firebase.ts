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
import { Platform } from "react-native";

import { secureStorage } from "./secureStorage";

// ROOT CAUSE of the universal login failure (confirmed live via errorReports,
// two rounds): the plain `firebase` JS SDK (used throughout this file/app for
// auth and db) is fundamentally a web client under the hood — it never
// attaches the HTTP Referer header a Browser-restricted key checks for, NOR
// the X-Android-Package/X-Android-Cert headers an Android-restricted key
// checks for, regardless of platform it's actually running on. Only
// @react-native-firebase's native modules (not used for auth/db here — only
// bridged in for App Check below) can satisfy those application-identity
// restrictions. Proved empirically on a real device:
//   1. Pointed at the Web app's (Browser-key) config → every Identity
//      Toolkit/Firestore call rejected with
//      auth/requests-from-referer-<empty>-are-blocked
//   2. Switched to the Android app's own (Android-key) config → still
//      rejected, now with
//      auth/requests-from-this-android-client-application-<empty>-are-blocked
// Both keys' application-identity restrictions only started actually being
// enforced after the Firebase/GCP console hardening pass on 2026-09-30 —
// this bug existed latently before that, invisible until then.
//
// Real fix: a key scoped ONLY by API target (Identity Toolkit, Firestore,
// Secure Token) with NO application-identity restriction — compatible with
// how the JS SDK actually works, without touching/weakening the separate
// Android/iOS/Browser keys those platforms' other restricted traffic still
// uses. authDomain/storageBucket/appId stay platform-accurate (sourced from
// google-services.json / GoogleService-Info.plist, already shipped in every
// build) since those aren't security-restricted, just identifiers.
const JS_SDK_API_KEY = "AIzaSyDb2-OEy_f8g2grqRDZofWn6zDgejZjP30";

const firebaseConfig = Platform.select({
  ios: {
    apiKey: JS_SDK_API_KEY,
    authDomain: "hit-organization.firebaseapp.com",
    projectId: "hit-organization",
    storageBucket: "hit-organization.firebasestorage.app",
    messagingSenderId: "432175584982",
    appId: "1:432175584982:ios:d1689253631a4aa4175b77",
  },
  default: {
    apiKey: JS_SDK_API_KEY,
    authDomain: "hit-organization.firebaseapp.com",
    projectId: "hit-organization",
    storageBucket: "hit-organization.firebasestorage.app",
    messagingSenderId: "432175584982",
    appId: "1:432175584982:android:20296b0172cee903175b77",
  },
})!;

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