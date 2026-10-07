// src/services/idValidation.ts
//
// Firestore's `.doc(path)` treats a `/` in the path segment as a path
// separator, not a literal character — `db.collection('users').doc(uid)`
// with an attacker-supplied `uid` like `"<targetUid>/private/totp"` silently
// resolves to that OTHER document's subcollection path, not a document named
// literally that whole string. A caller who only checks `typeof uid ===
// 'string'` before using it in a `.doc()` call is an existence oracle for
// arbitrary sub-document paths (e.g. probing whether a target has set up
// 2FA). Every route param / body field that becomes a Firestore doc id
// should be validated with this first.
//
// Firebase Auth uids and this app's own auto-generated Firestore ids are
// alphanumeric plus '-'/'_' only — never '/', '.', or whitespace. This is
// intentionally conservative (reject anything outside that set) rather than
// trying to enumerate every dangerous character.
const SAFE_DOC_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidDocId(id: unknown): id is string {
  return typeof id === 'string' && SAFE_DOC_ID_RE.test(id);
}
