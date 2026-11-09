// src/services/errorAiAnalysis.ts
//
// "AI solution" for one System Health error (POST
// /api/admin/system/error-reports/:id/ai-analysis, system_admin only).
//
// Gives the model everything the detail window shows — message, stack, the
// server source lines involved (codeLocator), resolved web frames (passed in
// by the web client, which symbolicates them), occurrence pattern, and what
// was tried last time it was marked resolved — and asks for a ROOT-CAUSE fix,
// a separate temporary workaround, and a 0–100 estimate for each of how
// likely it is to make the problem go away for good.
//
// No user names/emails go into the prompt — only counts and roles-free
// occurrence stats. The result is cached on the error doc (aiAnalysis) so
// reopening the window doesn't re-run (and re-bill) the analysis; the admin
// can force a fresh one.

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { askStructuredModel } from './anthropicClient.js';
import { getErrorReportDetail } from './errorReports.js';

const MAX_PROMPT_CODE_CHARS = 24_000;

export interface ClientFrameInput {
  file: string | null;
  line: number | null;
  functionName: string | null;
  snippet?: Array<{ n: number; text: string }>;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'rootCause',
    'suspectedLocation',
    'permanentFix',
    'temporaryWorkaround',
    'howToVerify',
    'diagnosisConfidence',
    'missingInformation',
  ],
  properties: {
    summary: { type: 'string', description: 'One or two sentences a non-developer admin understands.' },
    rootCause: { type: 'string', description: 'The underlying reason, not the symptom.' },
    suspectedLocation: {
      type: 'object',
      additionalProperties: false,
      required: ['file', 'line', 'why'],
      properties: {
        file: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        line: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
        why: { type: 'string' },
      },
    },
    permanentFix: {
      type: 'object',
      additionalProperties: false,
      required: ['steps', 'codeChange', 'permanenceChance', 'permanenceReasoning'],
      properties: {
        steps: { type: 'array', items: { type: 'string' } },
        codeChange: { type: 'string', description: 'Concrete code change (snippet or unified diff) or empty string if not a code fix.' },
        permanenceChance: { type: 'integer', description: '0-100: chance this fix makes the error stop for good.' },
        permanenceReasoning: { type: 'string' },
      },
    },
    temporaryWorkaround: {
      type: 'object',
      additionalProperties: false,
      required: ['steps', 'permanenceChance', 'whyTemporary'],
      properties: {
        steps: { type: 'array', items: { type: 'string' } },
        permanenceChance: { type: 'integer', description: '0-100: chance the workaround alone stops it for good (usually low).' },
        whyTemporary: { type: 'string' },
      },
    },
    howToVerify: { type: 'array', items: { type: 'string' } },
    diagnosisConfidence: { type: 'integer', description: '0-100: confidence the root cause above is the real one.' },
    missingInformation: { type: 'string', description: 'What data would raise confidence; empty string if none.' },
  },
} as const;

export interface AiAnalysisResult {
  summary: string;
  rootCause: string;
  suspectedLocation: { file: string | null; line: number | null; why: string };
  permanentFix: { steps: string[]; codeChange: string; permanenceChance: number; permanenceReasoning: string };
  temporaryWorkaround: { steps: string[]; permanenceChance: number; whyTemporary: string };
  howToVerify: string[];
  diagnosisConfidence: number;
  missingInformation: string;
}

const clampPct = (n: unknown) => Math.max(0, Math.min(100, Math.round(typeof n === 'number' && Number.isFinite(n) ? n : 0)));

function normalize(raw: AiAnalysisResult): AiAnalysisResult {
  return {
    ...raw,
    permanentFix: { ...raw.permanentFix, permanenceChance: clampPct(raw.permanentFix?.permanenceChance) },
    temporaryWorkaround: { ...raw.temporaryWorkaround, permanenceChance: clampPct(raw.temporaryWorkaround?.permanenceChance) },
    diagnosisConfidence: clampPct(raw.diagnosisConfidence),
  };
}

function fmtSnippet(lines: Array<{ n: number; text: string }> | undefined, mark: number | null): string {
  if (!lines?.length) return '';
  return lines.map((l) => `${l.n === mark ? '>' : ' '}${String(l.n).padStart(5)} | ${l.text}`).join('\n');
}

const SYSTEM = `You are a senior engineer doing root-cause analysis for a production web + mobile system (Next.js web app, React Native/Expo mobile app, Node/Express API on Google Cloud Run, Firebase Auth + Firestore).
The reader is the system administrator. They want the problem gone FOR GOOD, not patched.

Rules:
- Separate the permanent fix (removes the root cause) from a temporary workaround (makes symptoms stop for now: retry, restart, clear cache, raise a timeout).
- permanenceChance is your honest probability (0-100) that following those steps stops this error from ever recurring. A timeout increase, a retry, or "mark resolved and wait" is temporary and must score low. Do not inflate numbers; if the evidence is thin, say so and lower diagnosisConfidence.
- Base conclusions on the evidence given (stack, code lines, timings, user spread). When the cause could be on the user's side (one user, flaky network), say so.
- Prefer concrete, codebase-specific steps (file, function, what to change) over generic advice.
- If a previous resolution note shows a fix was already tried and the error came back, explain why it did not hold.
- Keep every string concise. Write all text fields in the requested language; code stays as code.`;

export async function runErrorAiAnalysis(
  id: string,
  opts: { lang: 'he' | 'en'; clientFrames?: ClientFrameInput[]; force?: boolean; requestedBy: string }
): Promise<
  | { ok: true; analysis: AiAnalysisResult; at: number; cached: boolean }
  | { ok: false; reason: 'not_found' | 'unavailable' | 'refused' | 'truncated' }
> {
  const ref = db.collection('errorReports').doc(id);
  if (!opts.force) {
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, reason: 'not_found' };
    const cached = snap.get('aiAnalysis') as { result?: AiAnalysisResult; at?: admin.firestore.Timestamp; lang?: string } | undefined;
    if (cached?.result && cached.lang === opts.lang) {
      return { ok: true, analysis: cached.result, at: cached.at?.toMillis?.() ?? Date.now(), cached: true };
    }
  }

  const d = await getErrorReportDetail(id);
  if (!d) return { ok: false, reason: 'not_found' };

  // ── Evidence ────────────────────────────────────────────────────────────
  const parts: string[] = [];
  parts.push(`ERROR
kind: ${d.kind}   platform: ${d.platform}   route/endpoint: ${d.route ?? '-'}
message: ${d.message}
total occurrences: ${d.count}   distinct signed-in users affected: ${d.affectedUserIds.length}
first seen: ${d.createdAt ? new Date(d.createdAt).toISOString() : '-'}   last seen: ${d.lastOccurredAt ? new Date(d.lastOccurredAt).toISOString() : '-'}
times it came back after being marked resolved: ${d.reopenCount}`);
  if (d.lastResolutionNote || d.resolutionNote) {
    parts.push(`PREVIOUS RESOLUTION NOTE (what the admin did last time): ${d.lastResolutionNote ?? d.resolutionNote}`);
  }

  const occ = d.occurrences.slice(0, 12).map((o) => {
    const r = o as Record<string, unknown>;
    return [
      r.at ? new Date(r.at as number).toISOString() : '-',
      `page=${r.page ?? '-'}`,
      `method=${r.method ?? '-'}`,
      `status=${r.httpStatus ?? '-'}`,
      `duration=${r.durationMs ?? '-'}ms/timeout=${r.timeoutMs ?? '-'}ms`,
      `app=${r.appVersion ?? '-'}`,
      `os=${r.os ?? (typeof r.userAgent === 'string' ? (r.userAgent as string).slice(0, 80) : '-')}`,
      `serverRevision=${r.serverRevision ?? '-'}`,
      `user=${r.userId ? `#${d.affectedUserIds.indexOf(r.userId as string) + 1}` : 'anonymous'}`,
    ].join(' ');
  });
  if (occ.length) parts.push(`RECENT OCCURRENCES (newest first)\n${occ.join('\n')}\ncurrent server revision: ${d.currentServerRevision ?? '-'}`);

  if (d.stack) parts.push(`CLIENT STACK (as reported, may be minified)\n${d.stack.slice(0, 3000)}`);

  let code = '';
  if (opts.clientFrames?.length) {
    code += 'CLIENT CODE (source-mapped frames, top first; ">" marks the line)\n';
    for (const f of opts.clientFrames.slice(0, 5)) {
      code += `-- ${f.functionName ?? '?'} at ${f.file ?? '?'}:${f.line ?? '?'}\n${fmtSnippet(f.snippet, f.line)}\n`;
    }
  }
  const sc = d.code;
  if (sc?.handler) {
    code += `SERVER HANDLER for ${sc.handler.method} ${sc.handler.routePattern}: ${sc.handler.handlerName ?? '(anonymous)'}`;
    if (sc.handler.definition) {
      code += ` defined at ${sc.handler.definition.file}:${sc.handler.definition.line}\n${fmtSnippet(sc.handler.definition.snippet, null)}\n`;
    } else code += '\n';
  }
  if (sc?.incidents?.samples.length) {
    code += `SERVER-SIDE RECORDS for this endpoint (${sc.incidents.count} failed/slow requests seen by the server)\n`;
    for (const s of sc.incidents.samples.slice(0, 4)) {
      code += `-- ${s.at ? new Date(s.at as number).toISOString() : '-'} kind=${String(s.kind)} status=${String(s.status ?? "-")} duration=${String(s.durationMs)}ms message=${String(s.message ?? "-")}\n`;
      const frames = (s.frames ?? []) as Array<{ file: string; line: number; functionName: string | null; snippet: Array<{ n: number; text: string }> }>;
      for (const f of frames.slice(0, 2)) {
        code += `   at ${f.functionName ?? '?'} ${f.file}:${f.line}\n${fmtSnippet(f.snippet, f.line)}\n`;
      }
    }
  } else if (sc) {
    code += 'SERVER-SIDE RECORDS: none yet for this endpoint (server did not log a failure or slow request for it).\n';
  }
  if (code) parts.push(code.slice(0, MAX_PROMPT_CODE_CHARS));

  const langLine = opts.lang === 'he' ? 'Write every text field in Hebrew.' : 'Write every text field in English.';
  const prompt = `${parts.join('\n\n')}\n\n${langLine}\nReturn the analysis.`;

  const reply = await askStructuredModel({ system: SYSTEM, prompt, schema: SCHEMA as unknown as Record<string, unknown>, effort: 'medium' });
  if (!reply) return { ok: false, reason: 'unavailable' };
  if (reply.kind === 'refused') return { ok: false, reason: 'refused' };
  if (reply.kind === 'truncated') return { ok: false, reason: 'truncated' };

  const analysis = normalize(reply.data as AiAnalysisResult);
  await ref
    .update({
      aiAnalysis: {
        result: analysis,
        lang: opts.lang,
        at: admin.firestore.FieldValue.serverTimestamp(),
        requestedBy: opts.requestedBy,
        countAtAnalysis: d.count,
      },
    })
    .catch(() => {});
  return { ok: true, analysis, at: Date.now(), cached: false };
}
