// src/services/usersChangeSignal.ts
//
// Lets the staff user lists (system_admin Users tab, Students List / Students
// Report, standard supervisors, external examiners — web + mobile) refresh
// live when a user is added, edited or removed, without a page reload.
//
// Those lists come from scoped REST endpoints, and `users` itself is far too
// big (and too sensitive) for every open screen to listen to directly. So the
// server watches `users` once, via the Admin SDK, and bumps one tiny marker
// doc — config/usersChangeSignal — that clients listen to and treat as
// "re-fetch your list" (see web/mobile hooks/useUsersLiveRefresh.ts). Scoping
// stays entirely server-side; the marker carries no user data. config/* is
// already readable by any signed-in user and Admin-SDK-only to write, so no
// rules change is needed.
//
// Watching the collection (rather than bumping from each write helper) is
// deliberate: ~70 server files write to `users` directly, and seed/import
// scripts run from a dev machine never pass through this process at all —
// a collection listener catches every one of them.
//
// Started once from index.ts — same in-process, long-running assumption as
// the setInterval sweeps there.

import crypto from 'crypto';
import { db } from '../config/firebase.js';
import { DocumentReference, FieldValue } from 'firebase-admin/firestore';

const SIGNAL_DOC = db.collection('config').doc('usersChangeSignal');

// Written on every login/logout — bumping on those would make every open
// staff list re-fetch each time anyone signs in. A "last login" column going
// briefly stale until the next real change/reload is fine.
const VOLATILE_FIELDS = new Set(['lastLoginAt', 'lastLoginPlatform', 'lastLogoutAt', 'updatedAt']);

// Coalesces a burst (a bulk import, a seed script) into one bump.
const BUMP_DEBOUNCE_MS = 1500;
const RESTART_DELAY_MS = 30_000;

const fingerprints = new Map<string, string>();
let bumpTimer: NodeJS.Timeout | null = null;

// Firestore doesn't keep nested map keys in a stable order across snapshots,
// so a plain JSON.stringify reports unchanged docs as changed — sort keys at
// every level.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof DocumentReference) return value.path;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj).sort().map((k) => [k, canonical(obj[k])]);
  }
  return value;
}

function fingerprint(data: Record<string, unknown>): string {
  const relevant = Object.fromEntries(Object.entries(data).filter(([k]) => !VOLATILE_FIELDS.has(k)));
  return crypto.createHash('sha1').update(JSON.stringify(canonical(relevant))).digest('base64');
}

function scheduleBump() {
  if (bumpTimer) return;
  bumpTimer = setTimeout(() => {
    bumpTimer = null;
    SIGNAL_DOC.set({ changedAt: FieldValue.serverTimestamp() }).catch((err) =>
      console.error('usersChangeSignal bump failed:', err)
    );
  }, BUMP_DEBOUNCE_MS);
}

export function startUsersChangeWatcher(): void {
  let initialized = false;
  fingerprints.clear();

  const unsubscribe = db.collection('users').onSnapshot(
    (snap) => {
      let changed = false;
      for (const change of snap.docChanges()) {
        const id = change.doc.id;
        if (change.type === 'removed') {
          fingerprints.delete(id);
          changed = true;
          continue;
        }
        const next = fingerprint(change.doc.data());
        if (fingerprints.get(id) !== next) {
          fingerprints.set(id, next);
          changed = true;
        }
      }
      // The first snapshot is just the current state — nothing changed yet.
      if (!initialized) {
        initialized = true;
        return;
      }
      if (changed) scheduleBump();
    },
    (err) => {
      console.error('usersChangeSignal watcher failed, restarting:', err);
      unsubscribe();
      setTimeout(startUsersChangeWatcher, RESTART_DELAY_MS);
    }
  );
}
