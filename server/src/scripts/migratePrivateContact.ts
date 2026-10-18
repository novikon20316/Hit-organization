// src/scripts/migratePrivateContact.ts
//
// One-off: moves phoneNumber and expoPushToken off every users/{uid} profile
// into users/{uid}/private/contact (see services/privateContact.ts for why).
// Run AFTER the server that reads/writes the private doc is deployed — until
// then the old server still reads the profile fields.
//
//   npx tsx src/scripts/migratePrivateContact.ts           # dry run (default)
//   npx tsx src/scripts/migratePrivateContact.ts --apply   # actually move
//
// Never overwrites a value already in the private doc (a newer write by the
// new server wins). Idempotent: re-running finds nothing left to move.

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';

const APPLY = process.argv.includes('--apply');

const snap = await db.collection('users').get();
let toMove = 0, phones = 0, tokens = 0, moved = 0;

for (const doc of snap.docs) {
  const u = doc.data();
  const hasPhoneField = Object.prototype.hasOwnProperty.call(u, 'phoneNumber');
  const hasTokenField = Object.prototype.hasOwnProperty.call(u, 'expoPushToken');
  if (!hasPhoneField && !hasTokenField) continue;
  toMove++;
  if (u.phoneNumber) phones++;
  if (u.expoPushToken) tokens++;
  if (!APPLY) continue;

  const privRef = doc.ref.collection('private').doc('contact');
  await db.runTransaction(async (tx) => {
    const priv = (await tx.get(privRef)).data() ?? {};
    const data: Record<string, unknown> = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (hasPhoneField && priv.phoneNumber == null) data.phoneNumber = u.phoneNumber ?? null;
    if (hasTokenField && priv.expoPushToken == null) data.expoPushToken = u.expoPushToken ?? null;
    tx.set(privRef, data, { merge: true });
    tx.update(doc.ref, {
      ...(hasPhoneField ? { phoneNumber: admin.firestore.FieldValue.delete() } : {}),
      ...(hasTokenField ? { expoPushToken: admin.firestore.FieldValue.delete() } : {}),
    });
  });
  moved++;
}

console.log(JSON.stringify({
  mode: APPLY ? 'APPLY' : 'dry-run',
  usersScanned: snap.size,
  profilesWithTheFields: toMove,
  withAPhone: phones,
  withAPushToken: tokens,
  moved,
}));
process.exit(0);
