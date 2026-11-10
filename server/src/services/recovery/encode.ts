// src/services/recovery/encode.ts
//
// Firestore values → plain JSON and back, without losing types. JSON alone
// would turn Timestamps into strings and break every orderBy/where on them
// (formDrafts, reminders, pruneAuditLog, the project-record timeline) after a
// restore, so each special type is tagged:
//   Timestamp          → { __t: 'ts', s, ns }
//   Bytes (Buffer)     → { __t: 'bytes', b64 }
//   GeoPoint           → { __t: 'geo', lat, lng }
//   DocumentReference  → { __t: 'ref', path }
//   plain object that itself has a "__t" key → { __t: 'obj', v: {...} }
// ISO date *strings* stay strings — some fields really are stored that way.

import { DocumentReference, Firestore, GeoPoint, Timestamp } from 'firebase-admin/firestore';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export function encodeValue(v: unknown): Json {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') {
    if (Number.isFinite(v)) return v;
    return { __t: 'num', v: String(v) };
  }
  if (v instanceof Timestamp) return { __t: 'ts', s: v.seconds, ns: v.nanoseconds };
  if (v instanceof Date) return { __t: 'ts', s: Math.floor(v.getTime() / 1000), ns: (v.getTime() % 1000) * 1e6 };
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { __t: 'bytes', b64: Buffer.from(v).toString('base64') };
  if (v instanceof GeoPoint) return { __t: 'geo', lat: v.latitude, lng: v.longitude };
  if (v instanceof DocumentReference) return { __t: 'ref', path: v.path };
  if (Array.isArray(v)) return v.map(encodeValue);
  if (typeof v === 'object') {
    const out: { [k: string]: Json } = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = encodeValue(val);
    return '__t' in out ? { __t: 'obj', v: out } : out;
  }
  return String(v);
}

export function encodeDoc(data: Record<string, unknown>): Record<string, unknown> {
  return encodeValue(data) as Record<string, unknown>;
}

export interface DecodeOptions {
  db: Firestore;
  /** Rewrites Cloudinary URLs when restoring into a different Cloudinary
   *  account (cloud name changed). Version segments are left alone —
   *  Cloudinary serves the current asset for any version number. */
  rewriteCloud?: { from: string; to: string } | null;
}

function rewrite(s: string, opts: DecodeOptions): string {
  const rc = opts.rewriteCloud;
  if (!rc || rc.from === rc.to) return s;
  return s.split(`res.cloudinary.com/${rc.from}/`).join(`res.cloudinary.com/${rc.to}/`);
}

export function decodeValue(v: unknown, opts: DecodeOptions): unknown {
  if (v === null || typeof v === 'boolean' || typeof v === 'number') return v;
  if (typeof v === 'string') return rewrite(v, opts);
  if (Array.isArray(v)) return v.map((x) => decodeValue(x, opts));
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    switch (o.__t) {
      case 'ts': return new Timestamp(Number(o.s), Number(o.ns));
      case 'bytes': return Buffer.from(String(o.b64), 'base64');
      case 'geo': return new GeoPoint(Number(o.lat), Number(o.lng));
      case 'ref': return opts.db.doc(String(o.path));
      case 'num': return Number(o.v);
      case 'obj': {
        const inner = o.v as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(inner)) out[k] = decodeValue(val, opts);
        return out;
      }
      default: {
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(o)) out[k] = decodeValue(val, opts);
        return out;
      }
    }
  }
  return v;
}

export function decodeDoc(data: Record<string, unknown>, opts: DecodeOptions): Record<string, unknown> {
  return decodeValue(data, opts) as Record<string, unknown>;
}

/** Stable comparison of two encoded docs (key order independent) — used by
 *  the dry run to tell "same" from "different". */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}
