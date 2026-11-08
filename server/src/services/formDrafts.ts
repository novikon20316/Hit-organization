// src/services/formDrafts.ts
//
// E3 — autosaved, unsent examiner form drafts (decided 2026-11-08): visible
// only to the examiner who wrote them — internal examiners by account,
// external examiners by their access token after the email code — never to
// the coordinator, supervisor or anyone else. Restored when the form
// reopens, deleted on submit (by the client), and expire after 60 days
// (pruneFormDrafts, daily). Stored in formDrafts (server-only, no Firestore
// rule); the owner key is hashed into the doc id, never stored raw, since an
// external examiner's key is their access token.

import { createHash } from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../config/firebase.js';

const COLLECTION = 'formDrafts';
const TTL_MS = 60 * 24 * 60 * 60 * 1000;
export const MAX_DRAFT_BYTES = 50_000;
const FORM_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

export function isValidFormKey(formKey: unknown): formKey is string {
  return typeof formKey === 'string' && FORM_KEY_RE.test(formKey);
}

function draftRef(milestoneId: string, ownerKey: string, formKey: string) {
  const owner = createHash('sha256').update(ownerKey).digest('hex').slice(0, 32);
  return db.collection(COLLECTION).doc(`${milestoneId}__${owner}__${formKey}`);
}

export async function getDraft(milestoneId: string, ownerKey: string, formKey: string): Promise<{ data: unknown; updatedAt: string } | null> {
  const ref = draftRef(milestoneId, ownerKey, formKey);
  const d = (await ref.get()).data();
  if (!d) return null;
  if ((d.expiresAt as Timestamp).toMillis() < Date.now()) {
    await ref.delete();
    return null;
  }
  return { data: JSON.parse(d.json), updatedAt: (d.updatedAt as Timestamp).toDate().toISOString() };
}

/** Returns false if the draft is too large or not a plain JSON object. */
export async function saveDraft(milestoneId: string, ownerKey: string, formKey: string, data: unknown): Promise<boolean> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const json = JSON.stringify(data);
  if (Buffer.byteLength(json) > MAX_DRAFT_BYTES) return false;
  const now = Date.now();
  await draftRef(milestoneId, ownerKey, formKey).set({
    milestoneId,
    formKey,
    json,
    updatedAt: Timestamp.fromMillis(now),
    expiresAt: Timestamp.fromMillis(now + TTL_MS),
  });
  return true;
}

export async function deleteDraft(milestoneId: string, ownerKey: string, formKey: string): Promise<void> {
  await draftRef(milestoneId, ownerKey, formKey).delete();
}

/** Daily (index.ts, tracked in systemHealth.ts). Single-field range query. */
export async function pruneFormDrafts(): Promise<void> {
  const expired = await db.collection(COLLECTION).where('expiresAt', '<', Timestamp.now()).limit(400).get();
  if (expired.empty) return;
  const batch = db.batch();
  expired.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
