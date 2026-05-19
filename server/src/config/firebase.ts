import * as admin from 'firebase-admin';
import * as path from 'path';
// Import the specific types needed for the annotations
import { Auth } from 'firebase-admin/auth';
import { Messaging } from 'firebase-admin/messaging';

// Resolve the path to your service account key
const serviceAccountPath = path.resolve(__dirname, '../../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
  });
}

export const db: admin.firestore.Firestore = admin.firestore();
export const auth: Auth = admin.auth(); // Added explicit type annotation
export const messaging: Messaging = admin.messaging(); // Added explicit type annotation

export default admin;