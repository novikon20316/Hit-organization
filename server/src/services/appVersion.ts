// src/services/appVersion.ts
//
// Minimum supported MOBILE app build, per platform — the mobile app's
// ForceUpdateGate (mobile/components/ForceUpdateGate.tsx) blocks itself with
// an "update the app" screen when its native build number is below it. Web
// never needs this: every page load already serves the latest web build.
//
// Build numbers, not the "1.0.0" version string: EAS auto-increments the
// native build number on every store build (eas.json appVersionSource
// "remote", autoIncrement), while the version string stays put.
//
// Stored at system/appVersion (no firestore.rules match for `system` writes
// outside system_admin; read through the public endpoint only).

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { APP_LINK_URL_IOS, APP_LINK_URL_ANDROID } from '../config/links.js';

export const MOBILE_PLATFORMS = ['ios', 'android'] as const;
export type MobilePlatform = typeof MOBILE_PLATFORMS[number];

export interface AppVersionPolicy {
  ios: { minBuild: number | null; storeUrl: string };
  android: { minBuild: number | null; storeUrl: string };
  updatedAt: string | null;
}

const docRef = () => db.collection('system').doc('appVersion');

/** Fails open: an unreadable doc means "no minimum", never "everyone must
 *  update" — a DB hiccup must not lock every phone out of the app. */
export async function readAppVersionPolicy(): Promise<AppVersionPolicy> {
  let data: FirebaseFirestore.DocumentData = {};
  try {
    data = (await docRef().get()).data() ?? {};
  } catch (err) {
    console.error('readAppVersionPolicy failed (failing open):', err);
  }
  const minBuild = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null);
  return {
    ios: { minBuild: minBuild(data.ios?.minBuild), storeUrl: data.ios?.storeUrl || APP_LINK_URL_IOS },
    android: { minBuild: minBuild(data.android?.minBuild), storeUrl: data.android?.storeUrl || APP_LINK_URL_ANDROID },
    updatedAt: data.updatedAt?.toDate?.().toISOString?.() ?? null,
  };
}

export async function writeAppVersionPolicy(
  updates: Partial<Record<MobilePlatform, { minBuild?: number | null; storeUrl?: string }>>,
  updatedBy: string,
): Promise<void> {
  const patch: Record<string, unknown> = {
    updatedBy,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  for (const p of MOBILE_PLATFORMS) {
    const u = updates[p];
    if (!u) continue;
    if (u.minBuild !== undefined) patch[`${p}.minBuild`] = u.minBuild;
    if (u.storeUrl !== undefined) patch[`${p}.storeUrl`] = u.storeUrl;
  }
  await docRef().set({}, { merge: true });
  await docRef().update(patch);
}
