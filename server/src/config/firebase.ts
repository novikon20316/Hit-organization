import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// 🚀 RECREATE __dirname FOR ES MODULE SCOPE
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prefer an env var holding the raw service account JSON — this is what
// Render (and most cloud hosts other than GCP) actually want: Render's
// "Secret Files" mount at /etc/secrets/<name>, not the app's working
// directory, so a hardcoded relative file path is fragile/host-specific.
// On Cloud Run neither of these is set, so initializeApp() falls back to
// Application Default Credentials — the service's own attached GCP identity,
// no key material needed at all. Local dev keeps working via the file
// fallback (serviceAccountKey.json at the repo root, git-ignored).
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const localKeyPath = path.resolve(__dirname, '../../serviceAccountKey.json');
const credentialSource = serviceAccountJson
  ? JSON.parse(serviceAccountJson)
  : fs.existsSync(localKeyPath)
    ? localKeyPath
    : null;

// 💡 FIXED: Invoke getApps() to check the length array safely
if (getApps().length === 0) {
  initializeApp(credentialSource ? { credential: cert(credentialSource) } : undefined);
}

// Clean initialization using direct SDK sub-modules
export const db: Firestore = getFirestore();
export const auth: Auth = getAuth();
export const messaging: Messaging = getMessaging();