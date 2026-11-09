// src/services/codeLocator.ts
//
// "Which line of OUR code is behind this error?" — used by the System Health
// detail window (services/errorReports.ts getErrorReportDetail).
//
// Three building blocks:
//   1. parseStackFrames(): pull file:line:col frames out of a V8 stack and
//      keep only the ones in this server's own src/ (not node_modules). The
//      runtime runs with `node --enable-source-maps` (see Dockerfile), so
//      frames already point at src/**/*.ts lines, not compiled dist/*.js.
//   2. resolveRouteHandler(): which controller function answers a given
//      METHOD + /api/path — walks Express's router using each layer's pure
//      `matchers` functions (never Layer.prototype.match, which mutates the
//      shared layer and could race a live request).
//   3. findDefinition() + readSnippet(): where that function is defined, and
//      the surrounding source lines. src/ ships in the runtime image for this.
//
// Everything here is read-only and best-effort: any failure returns null and
// the detail window just shows less.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Express } from 'express';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// dist/services/codeLocator.js → ../../src ; src/services/codeLocator.ts (tsx dev) → ../../src
const SRC_ROOT = path.resolve(HERE, '..', '..', 'src');

let registeredApp: Express | null = null;
/** Called once from index.ts after all routes are mounted. */
export function registerAppForCodeLocator(app: Express): void {
  registeredApp = app;
}

export interface SnippetLine {
  n: number;
  text: string;
}

export interface CodeLocation {
  /** Repo-relative, e.g. server/src/controllers/chatController.ts */
  file: string;
  line: number;
  column: number | null;
  functionName: string | null;
  snippet: SnippetLine[];
}

function isInsideSrc(abs: string): boolean {
  const rel = path.relative(SRC_ROOT, abs);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function toRepoPath(abs: string): string {
  return `server/src/${path.relative(SRC_ROOT, abs).split(path.sep).join('/')}`;
}

const fileCache = new Map<string, string[] | null>();
function readLines(abs: string): string[] | null {
  if (fileCache.has(abs)) return fileCache.get(abs) ?? null;
  let lines: string[] | null = null;
  try {
    lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  } catch {
    lines = null;
  }
  fileCache.set(abs, lines);
  return lines;
}

/** ±radius lines around a 1-based line number, only for files inside src/. */
export function readSnippet(abs: string, line: number, radius = 6): SnippetLine[] {
  if (!isInsideSrc(abs)) return [];
  const lines = readLines(abs);
  if (!lines) return [];
  const from = Math.max(1, line - radius);
  const to = Math.min(lines.length, line + radius);
  const out: SnippetLine[] = [];
  for (let n = from; n <= to; n++) out.push({ n, text: lines[n - 1] ?? '' });
  return out;
}

// Frames look like either
//   at getChatDashboard (/app/src/controllers/chatController.ts:120:15)
//   at /app/src/controllers/chatController.ts:120:15
//   at async Promise.all (index 0)            ← no location, skipped
const FRAME_RE = /^\s*at\s+(?:(.*?)\s+\()?((?:file:\/\/)?[^()]+?):(\d+):(\d+)\)?\s*$/;

/** App-code frames (inside server/src) from a server-side stack, top first. */
export function parseStackFrames(stack: string | null | undefined, limit = 5): CodeLocation[] {
  if (!stack) return [];
  const out: CodeLocation[] = [];
  for (const raw of stack.split('\n')) {
    const m = FRAME_RE.exec(raw);
    if (!m) continue;
    let file = m[2] ?? '';
    if (file.startsWith('file://')) {
      try { file = fileURLToPath(file); } catch { continue; }
    }
    const abs = path.resolve(file);
    if (!isInsideSrc(abs) || abs.includes('node_modules')) continue;
    const line = Number(m[3]);
    out.push({
      file: toRepoPath(abs),
      line,
      column: Number(m[4]) || null,
      functionName: m[1]?.replace(/^async\s+/, '') || null,
      snippet: readSnippet(abs, line),
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ─── Route → handler ────────────────────────────────────────────────────────

interface AnyLayer {
  slash?: boolean;
  matchers?: Array<(p: string) => false | { path: string }>;
  route?: { path: string; stack: Array<{ name?: string; handle?: { name?: string } }>; _handlesMethod?: (m: string) => boolean };
  handle?: { stack?: AnyLayer[] };
  name?: string;
}

function matchLayer(layer: AnyLayer, p: string): { path: string } | null {
  if (layer.slash) return { path: '' };
  for (const fn of layer.matchers ?? []) {
    try {
      const m = fn(p);
      if (m) return { path: m.path };
    } catch {
      // A matcher can throw on a malformed %-escape — treat as no match.
    }
  }
  return null;
}

function walk(stack: AnyLayer[], p: string, method: string, prefix: string, depth: number): { handlerName: string; routePattern: string } | null {
  if (depth > 6) return null;
  for (const layer of stack) {
    const m = matchLayer(layer, p);
    if (!m) continue;
    if (layer.route) {
      if (layer.route._handlesMethod && !layer.route._handlesMethod(method)) continue;
      const handlers = layer.route.stack ?? [];
      const last = handlers[handlers.length - 1];
      const name = last?.name || last?.handle?.name || '';
      return {
        handlerName: name && name !== '<anonymous>' ? name : '',
        routePattern: `${prefix}${layer.route.path}`,
      };
    }
    const sub = layer.handle?.stack;
    if (Array.isArray(sub)) {
      const rest = p.slice(m.path.length) || '/';
      const found = walk(sub, rest.startsWith('/') ? rest : `/${rest}`, method, prefix + m.path, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export interface RouteHandlerInfo {
  method: string;
  routePattern: string;
  handlerName: string | null;
  definition: CodeLocation | null;
}

/** Which controller answers METHOD path, and where it's defined. */
export function resolveRouteHandler(rawPath: string, method = 'GET'): RouteHandlerInfo | null {
  try {
    const appAny = registeredApp as unknown as { router?: { stack?: AnyLayer[] } } | null;
    const stack = appAny?.router?.stack;
    if (!stack) return null;
    const p = rawPath.split('?')[0] ?? rawPath;
    const m = method.toUpperCase();
    const found = walk(stack, p, m, '', 0);
    if (!found) return null;
    return {
      method: m,
      routePattern: found.routePattern,
      handlerName: found.handlerName || null,
      definition: found.handlerName ? findDefinition(found.handlerName) : null,
    };
  } catch {
    return null;
  }
}

// ─── Definition index ───────────────────────────────────────────────────────

let defIndex: Map<string, { abs: string; line: number }> | null = null;

function listTsFiles(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listTsFiles(full, out);
    else if (e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) out.push(full);
  }
}

const DEF_RE = /^\s*export\s+(?:const|let|async\s+function|function)\s+([A-Za-z0-9_$]+)/;

function buildIndex(): Map<string, { abs: string; line: number }> {
  const idx = new Map<string, { abs: string; line: number }>();
  const files: string[] = [];
  listTsFiles(SRC_ROOT, files);
  for (const abs of files) {
    const lines = readLines(abs);
    if (!lines) continue;
    lines.forEach((text, i) => {
      const m = DEF_RE.exec(text);
      if (m?.[1] && !idx.has(m[1])) idx.set(m[1], { abs, line: i + 1 });
    });
  }
  return idx;
}

/** Where an exported function/const is defined in server/src, with a snippet
 *  starting at its signature. */
export function findDefinition(name: string): CodeLocation | null {
  if (!defIndex) defIndex = buildIndex();
  const hit = defIndex.get(name);
  if (!hit) return null;
  const lines = readLines(hit.abs) ?? [];
  const snippet: SnippetLine[] = [];
  // Signature + the first stretch of the body — enough to see the queries
  // a slow handler runs, without dumping the whole function.
  for (let n = hit.line; n <= Math.min(lines.length, hit.line + 24); n++) {
    snippet.push({ n, text: lines[n - 1] ?? '' });
  }
  return { file: toRepoPath(hit.abs), line: hit.line, column: null, functionName: name, snippet };
}
