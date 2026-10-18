// src/middleware/batchedRateLimitStore.ts
//
// A shared-but-cheap counter store for the HIGH-VOLUME limiters (the blanket
// apiLimiter runs on every request). FirestoreRateLimitStore does one
// Firestore transaction per hit, which is right for low-volume security
// limiters but would add a database round trip to every API call.
//
// This store counts in memory and syncs each key's count with Firestore at
// most once every `flushMs` (default 10s) per instance, in the background —
// a request never waits on the database. Windows are fixed and aligned to
// the clock (floor(now / windowMs)), so every instance agrees on which window
// a hit belongs to. The result: the limit holds across all Cloud Run
// instances, give or take one flush interval of lag per instance.
//
// Fails open: a failed sync keeps counting locally and retries on the next
// flush. Uses the same server-only `rateLimits` collection.

import crypto from 'crypto';
import type { Store, Options, IncrementResponse } from 'express-rate-limit';
import { db } from '../config/firebase.js';

const COLLECTION = 'rateLimits';
const MAX_TRACKED_KEYS = 20_000;

interface KeyState {
  windowStart: number;
  /** This instance's hits not yet written to Firestore. */
  unflushed: number;
  /** Hits currently being written (still counted until the write lands). */
  inFlight: number;
  /** The shared total as of this instance's last sync (includes its own
   *  already-flushed hits). */
  globalKnown: number;
  lastFlush: number;
  flushing: boolean;
}

export class BatchedFirestoreRateLimitStore implements Store {
  localKeys = false;
  prefix: string;
  private windowMs = 60_000;
  private readonly flushMs: number;
  private readonly state = new Map<string, KeyState>();

  constructor(prefix: string, flushMs = 10_000) {
    this.prefix = prefix;
    this.flushMs = flushMs;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private windowStart(now: number): number {
    return Math.floor(now / this.windowMs) * this.windowMs;
  }

  private ref(key: string) {
    const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 40);
    return db.collection(COLLECTION).doc(`${this.prefix}_${hash}`);
  }

  private current(key: string, now: number): KeyState {
    const ws = this.windowStart(now);
    let s = this.state.get(key);
    if (!s || s.windowStart !== ws) {
      s = { windowStart: ws, unflushed: 0, inFlight: 0, globalKnown: 0, lastFlush: 0, flushing: false };
      this.state.set(key, s);
      if (this.state.size > MAX_TRACKED_KEYS) this.prune(ws);
    }
    return s;
  }

  private prune(currentWindow: number): void {
    for (const [k, s] of this.state) {
      if (s.windowStart !== currentWindow && s.unflushed === 0 && s.inFlight === 0) this.state.delete(k);
    }
  }

  private async flush(key: string, s: KeyState): Promise<void> {
    if (s.flushing) return;
    s.flushing = true;
    const delta = s.unflushed;
    s.unflushed = 0;
    s.inFlight = delta;
    s.lastFlush = Date.now();
    try {
      const ref = this.ref(key);
      const total = await db.runTransaction(async (tx) => {
        const data = (await tx.get(ref)).data();
        const count = data && data.windowStart === s.windowStart ? data.count + delta : delta;
        tx.set(ref, { windowStart: s.windowStart, count, limiter: this.prefix });
        return count;
      });
      // `total` already includes this flush's hits, so they stop counting as
      // in-flight at the same moment.
      s.globalKnown = Math.max(s.globalKnown, total);
      s.inFlight = 0;
    } catch (err) {
      s.inFlight = 0;
      s.unflushed += delta; // keep the hits; retried on the next flush
      console.error(`[rateLimit:${this.prefix}] sync failed (counting locally):`, (err as Error)?.message ?? err);
    } finally {
      s.flushing = false;
    }
  }

  increment(key: string): IncrementResponse {
    const now = Date.now();
    const s = this.current(key, now);
    s.unflushed++;
    if (now - s.lastFlush >= this.flushMs) void this.flush(key, s);
    return { totalHits: s.globalKnown + s.inFlight + s.unflushed, resetTime: new Date(s.windowStart + this.windowMs) };
  }

  decrement(key: string): void {
    const s = this.state.get(key);
    if (s && s.unflushed > 0) s.unflushed--;
  }

  async resetKey(key: string): Promise<void> {
    this.state.delete(key);
    await this.ref(key).delete();
  }
}
