// src/services/usersChangeSignal.ts
//
// Lets the staff user lists (system_admin Users tab, Students List / Students
// Report, standard supervisors, external examiners — web + mobile) refresh
// live when a user is added, edited or removed, without a page reload.
//
// Those lists come from scoped REST endpoints, and `users` itself is far too
// big (and too sensitive) for every open screen to listen to directly. So the
// server watches `users` once and bumps config/usersChangeSignal, which
// clients listen to (see web/mobile hooks/useUsersLiveRefresh.ts). Mechanism
// shared with other signals — see changeSignal.ts. ~70 server files write to
// `users` directly, plus seed/import scripts, which is why it's a watcher.

import { db } from '../config/firebase.js';
import { omitFields, startChangeSignalWatcher } from './changeSignal.js';

// Written on every login/logout — bumping on those would make every open
// staff list re-fetch each time anyone signs in. A "last login" column going
// briefly stale until the next real change/reload is fine.
const VOLATILE_FIELDS = new Set(['lastLoginAt', 'lastLoginPlatform', 'lastLogoutAt', 'updatedAt']);

export function startUsersChangeWatcher(): void {
  startChangeSignalWatcher('usersChangeSignal', [
    { name: 'users', query: db.collection('users'), relevant: omitFields(VOLATILE_FIELDS) },
  ]);
}
