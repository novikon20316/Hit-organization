// src/services/privateContact.ts
//
// A user's phone number and Expo push token live in users/{uid}/private/
// contact — NOT on the users/{uid} profile doc. The profile is readable by
// other signed-in users (firestore.rules: a staff profile by anyone, a
// student's by their teammates), and these two fields are sensitive: a phone
// number is personal data, and anyone holding an Expo push token can send a
// notification straight to that phone (a phishing vector). The `private`
// subcollection is server-only (firestore.rules denies all client access), so
// only this server, via the Admin SDK, reads or writes them.
//
// Reads fall back to the legacy profile fields for any account the one-off
// migration (scripts/migratePrivateContact.ts) hasn't moved yet; every write
// goes to the private doc and removes the legacy field.

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';

export interface PrivateContact {
  phoneNumber: string | null;
  expoPushToken: string | null;
}

function contactRef(uid: string) {
  return db.collection('users').doc(uid).collection('private').doc('contact');
}

function pick(privateData: FirebaseFirestore.DocumentData | undefined, legacy: FirebaseFirestore.DocumentData | undefined): PrivateContact {
  return {
    phoneNumber: privateData?.phoneNumber ?? legacy?.phoneNumber ?? null,
    expoPushToken: privateData?.expoPushToken ?? legacy?.expoPushToken ?? null,
  };
}

/** One user's contact. Pass the already-loaded profile doc (if the caller
 *  has it) to avoid a second read for the legacy fallback. */
export async function getPrivateContact(uid: string, profile?: FirebaseFirestore.DocumentData): Promise<PrivateContact> {
  const [privSnap, profileData] = await Promise.all([
    contactRef(uid).get(),
    profile ? Promise.resolve(profile) : db.collection('users').doc(uid).get().then((s) => s.data()),
  ]);
  return pick(privSnap.data(), profileData);
}

/** Many users at once (one batched read). Profiles are optional, keyed by uid,
 *  for the legacy fallback. */
export async function getPrivateContacts(
  uids: string[],
  profiles: Map<string, FirebaseFirestore.DocumentData | undefined> = new Map(),
): Promise<Map<string, PrivateContact>> {
  const unique = [...new Set(uids)].filter(Boolean);
  const out = new Map<string, PrivateContact>();
  if (unique.length === 0) return out;
  const privSnaps = await db.getAll(...unique.map(contactRef));
  const missingProfiles = unique.filter((uid) => !profiles.has(uid));
  const profileSnaps = missingProfiles.length
    ? await db.getAll(...missingProfiles.map((uid) => db.collection('users').doc(uid)))
    : [];
  profileSnaps.forEach((s) => profiles.set(s.id, s.data()));
  unique.forEach((uid, i) => out.set(uid, pick(privSnaps[i]?.data(), profiles.get(uid))));
  return out;
}

/** Sets one or both fields, and removes the legacy copy from the profile.
 *  Inside a transaction/batch, pass it so the write is part of it. */
export function writePrivateContact(
  uid: string,
  fields: Partial<PrivateContact>,
  writer?: FirebaseFirestore.Transaction | FirebaseFirestore.WriteBatch,
): Promise<unknown> | void {
  const data = { ...fields, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  const legacyCleanup: Record<string, FirebaseFirestore.FieldValue> = {};
  for (const key of Object.keys(fields)) legacyCleanup[key] = admin.firestore.FieldValue.delete();
  if (writer) {
    (writer as FirebaseFirestore.WriteBatch).set(contactRef(uid), data, { merge: true });
    return;
  }
  return Promise.all([
    contactRef(uid).set(data, { merge: true }),
    db.collection('users').doc(uid).update(legacyCleanup).catch(() => {}),
  ]);
}
