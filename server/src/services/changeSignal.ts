// src/services/changeSignal.ts
//
// Shared machinery behind the "live refresh" marker docs (see
// usersChangeSignal.ts, defenseScheduleChangeSignal.ts): the server watches a
// collection (or query) once, via the Admin SDK, and on a relevant change
// bumps one tiny config/<signalDocId> doc — { changedAt } — that open client
// screens listen to and treat as "re-fetch your data" (see web/mobile
// hooks/useChangeSignalRefresh.ts). Scoping stays entirely server-side: the
// marker carries no data, and each screen re-fetches its own scoped REST
// endpoint. config/* is already readable by any signed-in user and
// Admin-SDK-only to write, so no rules change is needed.
//
// Watching the data (rather than bumping from each write helper) is
// deliberate: dozens of server files write these collections directly, and
// seed/test scripts run from a dev machine never pass through this process
// at all — a listener catches every one of them.
//
// Started once from index.ts — same in-process, long-running assumption as
// the setInterval sweeps there.

import crypto from 'crypto';
import { db } from '../config/firebase.js';
import { DocumentReference, FieldValue, type DocumentData, type Query } from 'firebase-admin/firestore';

// Coalesces a burst (a bulk import, a seed script, one multi-doc transaction)
// into one bump.
const BUMP_DEBOUNCE_MS = 1500;
const RESTART_DELAY_MS = 30_000;

export interface ChangeSignalSource {
  /** For logs only. */
  name: string;
  query: Query;
  /** The part of a doc whose change should bump the signal. */
  relevant: (data: DocumentData) => Record<string, unknown>;
}

/** `relevant` that keeps only the listed fields. */
export function pickFields(fields: readonly string[]): ChangeSignalSource['relevant'] {
  return (data) => Object.fromEntries(fields.filter((f) => data[f] !== undefined).map((f) => [f, data[f]]));
}

/** `relevant` that keeps everything except the listed fields. */
export function omitFields(fields: ReadonlySet<string>): ChangeSignalSource['relevant'] {
  return (data) => Object.fromEntries(Object.entries(data).filter(([k]) => !fields.has(k)));
}

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

function fingerprint(relevant: Record<string, unknown>): string {
  return crypto.createHash('sha1').update(JSON.stringify(canonical(relevant))).digest('base64');
}

// A doc with nothing relevant on it (a fresh project with no defense yet)
// appearing or disappearing isn't a change worth re-fetching for.
const EMPTY = fingerprint({});

function watchSource(signalDocId: string, source: ChangeSignalSource, onChange: () => void): void {
  const fingerprints = new Map<string, string>();
  let initialized = false;

  const unsubscribe = source.query.onSnapshot(
    (snap) => {
      let changed = false;
      for (const change of snap.docChanges()) {
        const id = change.doc.id;
        const prev = fingerprints.get(id) ?? EMPTY;
        if (change.type === 'removed') {
          fingerprints.delete(id);
          if (prev !== EMPTY) changed = true;
          continue;
        }
        const next = fingerprint(source.relevant(change.doc.data()));
        fingerprints.set(id, next);
        if (next !== prev) changed = true;
      }
      // The first snapshot is just the current state — nothing changed yet.
      if (!initialized) {
        initialized = true;
        return;
      }
      if (changed) onChange();
    },
    (err) => {
      console.error(`${signalDocId} watcher (${source.name}) failed, restarting:`, err);
      unsubscribe();
      setTimeout(() => watchSource(signalDocId, source, onChange), RESTART_DELAY_MS);
    }
  );
}

export function startChangeSignalWatcher(signalDocId: string, sources: ChangeSignalSource[]): void {
  const signalDoc = db.collection('config').doc(signalDocId);
  let bumpTimer: NodeJS.Timeout | null = null;
  const scheduleBump = () => {
    if (bumpTimer) return;
    bumpTimer = setTimeout(() => {
      bumpTimer = null;
      signalDoc.set({ changedAt: FieldValue.serverTimestamp() }).catch((err) =>
        console.error(`${signalDocId} bump failed:`, err)
      );
    }, BUMP_DEBOUNCE_MS);
  };
  for (const source of sources) watchSource(signalDocId, source, scheduleBump);
}

// For viewers with no Firebase session — the external examiner pages, which
// can't listen to config/* — a polled read of the same marker. Cached briefly
// per instance so many open pages cost one Firestore read per few seconds.
const READ_CACHE_MS = 5000;
const readCache = new Map<string, { at: number; changedAt: number }>();

export async function readChangeSignal(signalDocId: string): Promise<number> {
  const cached = readCache.get(signalDocId);
  if (cached && Date.now() - cached.at < READ_CACHE_MS) return cached.changedAt;
  const snap = await db.collection('config').doc(signalDocId).get();
  const changedAt: number = snap.data()?.changedAt?.toMillis?.() ?? 0;
  readCache.set(signalDocId, { at: Date.now(), changedAt });
  return changedAt;
}
