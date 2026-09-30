import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

import {
  initializeAuth,
  getAuth,
  Auth,
  getReactNativePersistence,
} from "firebase/auth";

import { initializeAppCheck, CustomProvider } from "firebase/app-check";
import { getApp as getNativeApp } from "@react-native-firebase/app";
import {
  initializeAppCheck as initializeNativeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from "@react-native-firebase/app-check";

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
const rnfbAppCheckProvider = new ReactNativeFirebaseAppCheckProvider();
rnfbAppCheckProvider.configure({
  android: { provider: __DEV__ ? "debug" : "playIntegrity" },
  apple: { provider: __DEV__ ? "debug" : "appAttestWithDeviceCheckFallback" },
});
initializeNativeAppCheck(getNativeApp(), {
  provider: rnfbAppCheckProvider,
  isTokenAutoRefreshEnabled: true,
});

export const appCheck = initializeAppCheck(app, {
  isTokenAutoRefreshEnabled: true,
  provider: new CustomProvider({
    // Delegates to the native provider's own getToken() (not the module-level
    // getToken(appCheckInstance) helper, which returns a narrower
    // { token }-only shape) — this one returns the full { token,
    // expireTimeMillis } the plain JS SDK's CustomProvider expects.
    getToken: () => rnfbAppCheckProvider.getToken(),
  }),
});

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