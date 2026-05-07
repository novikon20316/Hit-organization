import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage"; // 👈 ADD THIS
// your config (copy from mobile OR web, not both)
const firebaseConfig = {
  apiKey: "AIzaSyD7v2PB_ics4bDV346BxeIZjFvkbSHvjiM",
  authDomain: "hit-organization.firebaseapp.com",
  projectId: "hit-organization",
  storageBucket: "hit-organization.firebasestorage.app",
  messagingSenderId: "432175584982",
  appId: "1:432175584982:web:b2c0a54e4309e4d3175b77",
  measurementId: "G-TMNFYG6N67"
};

// 🔥 prevents duplicate Firebase apps
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app); // 👈 ADD THIS