import { initializeApp, cert, getApps } from 'firebase-admin/app'; 
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import path from 'path';
import { fileURLToPath } from 'url';

// 🚀 RECREATE __dirname FOR ES MODULE SCOPE
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the path to your service account key
const serviceAccountPath = path.resolve(__dirname, '../../serviceAccountKey.json');

// 💡 FIXED: Invoke getApps() to check the length array safely
if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccountPath),
  });
}

// Clean initialization using direct SDK sub-modules
export const db: Firestore = getFirestore();
export const auth: Auth = getAuth();
export const messaging: Messaging = getMessaging();