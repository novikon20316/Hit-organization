// src/services/milestoneChangeSignal.ts
//
// Live refresh for students' and supervisors' milestone screens without
// letting them read milestone docs directly (decided 2026-11-08). A milestone
// doc carries examiner-only forms and not-yet-released grades, and Firestore
// can't hide single fields, so those viewers read milestones only through the
// API (milestoneVisibility.ts does the hiding). What they listen to instead is
// milestoneSignals/{uid} — { changedAt }, no data — which this watcher bumps
// for every student, supervisor and secondary supervisor of a milestone that
// changed. Each user can read only their own signal doc (firestore.rules).
//
// Same watch-don't-instrument reasoning as changeSignal.ts: dozens of server
// files and scripts write milestones directly.

import crypto from 'crypto';
import { db } from '../config/firebase.js';
import { FieldValue, type DocumentData } from 'firebase-admin/firestore';

const BUMP_DEBOUNCE_MS = 1500;
const RESTART_DELAY_MS = 30_000;
const COLLECTION = 'milestoneSignals';

function participantsOf(data: DocumentData): string[] {
  const ids = [
    ...(Array.isArray(data.studentIds) ? data.studentIds : []),
    data.supervisorId,
    data.secondarySupervisorId,
  ];
  return ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

// Firestore doesn't keep nested map keys in a stable order across snapshots
// — sort them so an unchanged doc fingerprints the same.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object' && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj).sort().map((k) => [k, canonical(obj[k])]);
  }
  return value;
}

const fingerprint = (data: DocumentData) =>
  crypto.createHash('sha1').update(JSON.stringify(canonical(data))).digest('base64');

export function startMilestoneChangeWatcher(): void {
  const known = new Map<string, { print: string; uids: string[] }>();
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | null = null;
  let initialized = false;

  const flush = async () => {
    timer = null;
    const uids = [...pending];
    pending.clear();
    for (let i = 0; i < uids.length; i += 400) {
      const batch = db.batch();
      uids.slice(i, i + 400).forEach((uid) => batch.set(db.collection(COLLECTION).doc(uid), { changedAt: FieldValue.serverTimestamp() }));
      await batch.commit().catch((err) => console.error('milestoneSignals bump failed:', err));
    }
  };
  const bump = (uids: string[]) => {
    uids.forEach((uid) => pending.add(uid));
    if (!timer && pending.size) timer = setTimeout(() => { void flush(); }, BUMP_DEBOUNCE_MS);
  };

  const unsubscribe = db.collection('milestones').onSnapshot(
    (snap) => {
      for (const change of snap.docChanges()) {
        const prev = known.get(change.doc.id);
        if (change.type === 'removed') {
          known.delete(change.doc.id);
          if (initialized && prev) bump(prev.uids);
          continue;
        }
        const data = change.doc.data();
        const next = { print: fingerprint(data), uids: participantsOf(data) };
        known.set(change.doc.id, next);
        // Someone removed from the milestone hears about it too.
        if (initialized && next.print !== prev?.print) bump([...new Set([...(prev?.uids ?? []), ...next.uids])]);
      }
      initialized = true;
    },
    (err) => {
      console.error('milestone change watcher failed, restarting:', err);
      unsubscribe();
      setTimeout(startMilestoneChangeWatcher, RESTART_DELAY_MS);
    }
  );
}
