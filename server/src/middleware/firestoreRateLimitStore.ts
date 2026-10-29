// src/middleware/firestoreRateLimitStore.ts
//
// A shared counter store for express-rate-limit, backed by Firestore
// (collection `rateLimits`, server-only — no firestore.rules match, so clients
// can't read or write it). The default in-memory store counts separately in
// each Cloud Run instance (up to 20 run in parallel), which multiplied every
// limit by the number of live instances. This one gives every instance the
// same count.
//
// Used only for the low-volume, security-sensitive limiters (2FA codes,
// signup, login security, examiner access, final report,
// uploads, mass messaging) — each hit is one Firestore transaction, so the
// blanket per-request apiLimiter stays in memory. Limiters using it set
// passOnStoreError, so a Firestore outage lets requests through instead of
// locking every user out.

import crypto from 'crypto';
import type { Store, Options, IncrementResponse, ClientRateLimitInfo } from 'express-rate-limit';
import { db } from '../config/firebase.js';

const COLLECTION = 'rateLimits';

export class FirestoreRateLimitStore implements Store {
  /** Keys are shared across instances, not per-process. */
  localKeys = false;
  prefix: string;
  private windowMs = 60_000;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  // Hashed: the key is a uid or an IP (IPv6 contains ':'), and neither should
  // appear verbatim in a document id.
  private ref(key: string) {
    const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 40);
    return db.collection(COLLECTION).doc(`${this.prefix}_${hash}`);
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const data = (await this.ref(key).get()).data();
    if (!data || data.resetAt <= Date.now()) return undefined;
    return { totalHits: data.hits, resetTime: new Date(data.resetAt) };
  }

  async increment(key: string): Promise<IncrementResponse> {
    const ref = this.ref(key);
    return db.runTransaction(async (tx) => {
      const now = Date.now();
      const data = (await tx.get(ref)).data();
      const fresh = !data || data.resetAt <= now;
      const hits = fresh ? 1 : data.hits + 1;
      const resetAt = fresh ? now + this.windowMs : data.resetAt;
      tx.set(ref, { hits, resetAt, limiter: this.prefix });
      return { totalHits: hits, resetTime: new Date(resetAt) };
    });
  }

  async decrement(key: string): Promise<void> {
    const ref = this.ref(key);
    await db.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data();
      if (data && data.hits > 0 && data.resetAt > Date.now()) tx.update(ref, { hits: data.hits - 1 });
    });
  }

  async resetKey(key: string): Promise<void> {
    await this.ref(key).delete();
  }
}
