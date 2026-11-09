// app/admin-tools/error-source/[id]/route.ts
//
// GET → the real source lines behind a web crash in System Health.
//
// Production web stacks point at minified chunks
// (/_next/static/chunks/abc.js:1:48213). next.config's
// productionBrowserSourceMaps generates the maps, and the Dockerfile moves
// them out of the public static folder into /app/.sourcemaps — so this
// handler is the only thing that can read them.
//
// Authorization is delegated to the API rather than re-implemented here
// (this service has no Firebase Admin credentials): the caller's own
// Authorization/App Check headers are forwarded to
// GET /api/admin/system/error-reports/:id, which is system_admin-only. If
// that call fails, nothing is symbolicated. The stack comes from that
// response too — never from the caller — so this can't be used to probe
// arbitrary map files.
//
// Not under /api/** on purpose: Firebase Hosting rewrites /api/** to the
// API service, so a route there would never reach this web service.

import fs from 'node:fs/promises';
import path from 'node:path';
import { SourceMapConsumer, type RawSourceMap } from 'source-map-js';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://hit-organization.web.app';
const MAPS_ROOT = path.join(process.cwd(), '.sourcemaps');
const MAX_FRAMES = 8;
const SNIPPET_RADIUS = 6;

interface ResolvedFrame {
  /** What the browser reported (minified). */
  generated: string;
  /** Repo-relative original file, e.g. web/components/Foo.tsx — null if unmapped. */
  file: string | null;
  line: number | null;
  column: number | null;
  functionName: string | null;
  /** Our own code vs node_modules/framework. */
  isAppCode: boolean;
  snippet: Array<{ n: number; text: string }>;
}

// Chrome:   at Foo (https://host/_next/static/chunks/abc.js:1:2345)
// Firefox/Safari: Foo@https://host/_next/static/chunks/abc.js:1:2345
const FRAME_RE = /(?:at\s+(?:(.*?)\s+\()?|^\s*(?:(.*?)@)?)(https?:\/\/[^\s()]+?\/_next\/static\/([^\s():]+?\.js)):(\d+):(\d+)/;

function parseFrames(stack: string) {
  const out: Array<{ raw: string; url: string; chunk: string; line: number; column: number; fn: string | null }> = [];
  for (const raw of stack.split('\n')) {
    const m = FRAME_RE.exec(raw);
    if (!m) continue;
    const chunk = decodeURIComponent(m[4] ?? '');
    // Only plain relative chunk paths — no traversal, no odd characters.
    if (!/^[A-Za-z0-9_\-./~[\]()@%]+$/.test(chunk) || chunk.split('/').includes('..')) continue;
    out.push({ raw: raw.trim(), url: m[3] ?? '', chunk, line: Number(m[5]), column: Number(m[6]), fn: m[1] || m[2] || null });
    if (out.length >= MAX_FRAMES) break;
  }
  return out;
}

const consumerCache = new Map<string, SourceMapConsumer | null>();

async function loadConsumer(chunk: string, url: string): Promise<SourceMapConsumer | null> {
  if (consumerCache.has(chunk)) return consumerCache.get(chunk) ?? null;
  let raw: string | null = null;
  const abs = path.resolve(MAPS_ROOT, `${chunk}.map`);
  if (abs.startsWith(MAPS_ROOT + path.sep)) {
    raw = await fs.readFile(abs, 'utf8').catch(() => null);
  }
  // `next dev` serves maps itself and has no .sourcemaps folder — lets the
  // feature be checked locally. Never used in production.
  if (!raw && process.env.NODE_ENV === 'development') {
    raw = await fetch(`${url}.map`).then((r) => (r.ok ? r.text() : null)).catch(() => null);
  }
  let consumer: SourceMapConsumer | null = null;
  if (raw) {
    try {
      consumer = new SourceMapConsumer(JSON.parse(raw) as RawSourceMap);
    } catch {
      consumer = null;
    }
  }
  consumerCache.set(chunk, consumer);
  return consumer;
}

// turbopack:///[project]/components/Foo.tsx → web/components/Foo.tsx
function normalizeSource(source: string): string {
  let s = source.replace(/^turbopack:\/\/\/?/, '').replace(/^webpack:\/\/\/?(_N_E\/)?/, '').replace(/^file:\/\/\/?/, '');
  s = s.replace(/^\[project\]\//, '').replace(/^\.\//, '');
  const webIdx = s.search(/(^|\/)web\//);
  if (webIdx >= 0) s = s.slice(s.indexOf('web/', webIdx) + 4);
  s = s.split('?')[0] ?? s;
  return s.startsWith('node_modules/') ? s : `web/${s}`;
}

function snippetFrom(content: string | null, line: number) {
  if (!content) return [];
  const lines = content.split(/\r?\n/);
  const from = Math.max(1, line - SNIPPET_RADIUS);
  const to = Math.min(lines.length, line + SNIPPET_RADIUS);
  const out: Array<{ n: number; text: string }> = [];
  for (let n = from; n <= to; n++) out.push({ n, text: lines[n - 1] ?? '' });
  return out;
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return Response.json({ error: 'bad_id' }, { status: 400 });
  }

  const headers = new Headers({ Accept: 'application/json' });
  for (const h of ['authorization', 'x-firebase-appcheck', 'x-lang']) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has('authorization')) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const detailRes = await fetch(`${API_BASE}/api/admin/system/error-reports/${encodeURIComponent(id)}`, {
    headers,
    cache: 'no-store',
  }).catch(() => null);
  if (!detailRes) return Response.json({ error: 'api_unreachable' }, { status: 502 });
  if (!detailRes.ok) return Response.json({ error: 'forbidden_or_missing' }, { status: detailRes.status });

  const detail = (await detailRes.json()) as { platform?: string; stack?: string | null };
  if (detail.platform !== 'web' || !detail.stack) {
    return Response.json({ available: false, reason: detail.platform !== 'web' ? 'not_web' : 'no_stack', frames: [] });
  }

  const parsed = parseFrames(detail.stack);
  if (parsed.length === 0) {
    return Response.json({ available: false, reason: 'no_bundle_frames', frames: [] });
  }

  const frames: ResolvedFrame[] = [];
  let missingMaps = 0;
  for (const f of parsed) {
    const consumer = await loadConsumer(f.chunk, f.url);
    if (!consumer) {
      missingMaps++;
      frames.push({ generated: f.raw, file: null, line: null, column: null, functionName: f.fn, isAppCode: false, snippet: [] });
      continue;
    }
    const pos = consumer.originalPositionFor({ line: f.line, column: Math.max(0, f.column - 1) });
    if (!pos.source || !pos.line) {
      frames.push({ generated: f.raw, file: null, line: null, column: null, functionName: f.fn, isAppCode: false, snippet: [] });
      continue;
    }
    const file = normalizeSource(pos.source);
    const isAppCode = !file.startsWith('node_modules/') && !file.includes('/node_modules/');
    frames.push({
      generated: f.raw,
      file,
      line: pos.line,
      column: pos.column !== null ? pos.column + 1 : null,
      functionName: pos.name || f.fn,
      isAppCode,
      snippet: isAppCode ? snippetFrom(consumer.sourceContentFor(pos.source, true), pos.line) : [],
    });
  }

  return Response.json({
    available: frames.some((f) => f.file),
    // Every map missing = the crash came from a bundle an earlier deploy
    // built; its maps left with that container.
    reason: missingMaps === parsed.length ? 'build_replaced' : null,
    frames,
  });
}
