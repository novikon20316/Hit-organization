// src/services/serverIncidents.ts
//
// The server-side half of a client-reported failure. When web/mobile report
// "HTTP 500 from /api/x" or "timed out on /api/x", the actual cause — the
// exception and the line it came from, or how long the handler really ran —
// only exists here, in this process. This records it, per endpoint, so the
// System Health detail window can show the failing line of server code next
// to the client's report (see errorReports.ts getErrorReportDetail).
//
// How:
//   - serverIncidentMiddleware runs every request inside an AsyncLocalStorage
//     context.
//   - console.error is wrapped: nearly every controller already does
//     `catch (err) { console.error('… error:', err); return res.status(500) }`,
//     so the first Error logged during a request is that request's cause.
//     No controller had to change.
//   - On response finish/close we keep the request ONLY if it failed (5xx),
//     ran slow, or the client gave up waiting — successful requests cost
//     nothing beyond the timer.
//
// Storage: serverIncidents/{hash(pathKey)} with the last few samples. Writes
// are fire-and-forget and never throw into the request.

import crypto from 'crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';
import { db } from '../config/firebase.js';

const SLOW_MS = 15_000;
const MAX_SAMPLES = 10;
const MAX_STACK = 6000;

interface RequestCtx {
  method: string;
  path: string;
  startedAt: number;
  captured: { message: string; stack: string | null } | null;
}

const als = new AsyncLocalStorage<RequestCtx>();

/** Same id-stripping on both sides (server path here, client-reported route
 *  in errorReports.ts) so /api/chats/AbC123…/messages from two different
 *  chats lands on one key. */
export function pathKeyFor(rawPath: string): string {
  const p = (rawPath.split('?')[0] ?? rawPath).replace(/\/+$/, '') || '/';
  return p
    .split('/')
    .map((seg) =>
      /\d/.test(seg) || (seg.length >= 16 && /^[A-Za-z0-9]+$/.test(seg) && /[A-Z]/.test(seg)) || seg.includes('@')
        ? ':id'
        : seg
    )
    .join('/');
}

export function incidentDocId(pathKey: string): string {
  return crypto.createHash('sha256').update(pathKey).digest('hex').slice(0, 24);
}

let consoleHooked = false;
function hookConsoleError(): void {
  if (consoleHooked) return;
  consoleHooked = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    try {
      const ctx = als.getStore();
      if (!ctx || ctx.captured) return;
      const err = args.find((a): a is Error => a instanceof Error);
      if (!err) return;
      const label = typeof args[0] === 'string' ? `${args[0]} ` : '';
      ctx.captured = {
        message: `${label}${err.message}`.slice(0, 1000),
        stack: err.stack ? err.stack.slice(0, MAX_STACK) : null,
      };
    } catch {
      // never let diagnostics break logging
    }
  };
}

/** Lets the global Express error handler hand over an error it caught —
 *  covers handlers that throw without logging first. */
export function captureRequestError(err: unknown): void {
  const ctx = als.getStore();
  if (!ctx || ctx.captured || !(err instanceof Error)) return;
  ctx.captured = { message: err.message.slice(0, 1000), stack: err.stack ? err.stack.slice(0, MAX_STACK) : null };
}

export function serverIncidentMiddleware(req: Request, res: Response, next: NextFunction): void {
  hookConsoleError();
  const ctx: RequestCtx = { method: req.method, path: req.originalUrl, startedAt: Date.now(), captured: null };
  let done = false;
  const finish = (aborted: boolean) => {
    if (done) return;
    done = true;
    const durationMs = Date.now() - ctx.startedAt;
    const status = res.statusCode;
    const failed = status >= 500;
    const slow = durationMs >= SLOW_MS;
    if (!failed && !slow && !aborted) return;
    if (aborted && durationMs < 5_000) return; // a quick navigate-away, not a hang
    const routeAny = (req as unknown as { route?: { path?: string; stack?: Array<{ name?: string }> } }).route;
    const handlers = routeAny?.stack ?? [];
    const handlerName = handlers[handlers.length - 1]?.name;
    recordIncident({
      method: ctx.method,
      path: ctx.path,
      routePattern: routeAny?.path ? `${req.baseUrl}${routeAny.path}` : null,
      handlerName: handlerName && handlerName !== '<anonymous>' ? handlerName : null,
      kind: failed ? 'error' : aborted ? 'client_gave_up' : 'slow',
      status: aborted ? null : status,
      durationMs,
      message: ctx.captured?.message ?? null,
      stack: ctx.captured?.stack ?? null,
    });
  };
  res.on('finish', () => finish(false));
  res.on('close', () => finish(!res.writableFinished));
  als.run(ctx, () => next());
}

interface IncidentSample {
  method: string;
  path: string;
  routePattern: string | null;
  handlerName: string | null;
  kind: 'error' | 'slow' | 'client_gave_up';
  status: number | null;
  durationMs: number;
  message: string | null;
  stack: string | null;
}

function recordIncident(sample: IncidentSample): void {
  // Run outside the request's ALS context so a failure here can't be
  // mistaken for the request's own error by the console hook.
  als.exit(() => {
    const pathKey = pathKeyFor(sample.path);
    const ref = db.collection('serverIncidents').doc(incidentDocId(pathKey));
    const entry = { ...sample, at: admin.firestore.Timestamp.now(), revision: process.env.K_REVISION ?? null };
    void db
      .runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const prev = snap.exists ? (snap.data() as FirebaseFirestore.DocumentData) : null;
        const samples = [entry, ...(Array.isArray(prev?.samples) ? prev.samples : [])].slice(0, MAX_SAMPLES);
        tx.set(ref, {
          pathKey,
          routePattern: sample.routePattern ?? prev?.routePattern ?? null,
          handlerName: sample.handlerName ?? prev?.handlerName ?? null,
          count: (typeof prev?.count === 'number' ? prev.count : 0) + 1,
          lastAt: admin.firestore.FieldValue.serverTimestamp(),
          samples,
        });
      })
      .catch(() => {
        // best-effort; deliberately not console.error (would just add noise)
      });
  });
}
