import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

import {
  initializeAuth,
  getAuth,
  Auth ,
  getReactNativePersistence,
} from "firebase/auth";

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