'use client';

// components/ErrorReportDetailModal.tsx
//
// system_admin clicks an error in the System Health card → this window:
// what it means, an AI root-cause analysis with a "will this fix it for
// good" percentage, the exact source lines involved, who/where/when it hit,
// Cloud Logging links, and resolve-with-a-note (so if it comes back, the
// next look starts from what was already tried).
//
// Data: GET /api/admin/system/error-reports/:id (server/src/services/
// errorReports.ts getErrorReportDetail), web crash source lines from
// /admin-tools/error-source/:id (private source maps, app/admin-tools/…),
// AI from POST …/:id/ai-analysis (services/errorAiAnalysis.ts).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getToken as getAppCheckToken } from 'firebase/app-check';
import { auth, appCheck } from '@/lib/firebase';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import { diagnose, signals, type Lang } from '@/lib/errorDiagnosis';

// ─── Types (mirror getErrorReportDetail) ────────────────────────────────────

interface SnippetLine { n: number; text: string }
interface CodeLocation { file: string; line: number; column: number | null; functionName: string | null; snippet: SnippetLine[] }
interface Occurrence {
  at: number | null; userId?: string | null; page?: string | null; method?: string | null; httpStatus?: number | null;
  durationMs?: number | null; timeoutMs?: number | null; appVersion?: string | null; os?: string | null;
  userAgent?: string | null; serverRevision?: string | null;
}
interface IncidentSample {
  at: number | null; kind: 'error' | 'slow' | 'client_gave_up' | null; method: string | null; path: string | null;
  status: number | null; durationMs: number | null; message: string | null; stack: string | null; revision: string | null;
  frames: CodeLocation[];
}
interface AiAnalysis {
  summary: string; rootCause: string;
  suspectedLocation: { file: string | null; line: number | null; why: string };
  permanentFix: { steps: string[]; codeChange: string; permanenceChance: number; permanenceReasoning: string };
  temporaryWorkaround: { steps: string[]; permanenceChance: number; whyTemporary: string };
  howToVerify: string[]; diagnosisConfidence: number; missingInformation: string;
}
export interface ErrorReportDetail {
  id: string; kind: 'client_crash' | 'api_timeout' | 'network_failure'; platform: 'web' | 'mobile';
  message: string; stack: string | null; route: string | null; status: 'open' | 'resolved'; count: number;
  createdAt: number | null; firstOccurredAt: number | null; lastOccurredAt: number | null; notifiedAt: number | null;
  reopenCount: number; resolutionNote: string | null; lastResolvedAt: number | null; lastResolvedBy: string | null;
  lastResolutionNote: string | null; affectedUserIds: string[]; occurrences: Occurrence[];
  users: Record<string, { id: string; name: string | null; email: string | null; role: string | null }>;
  links: { requestLogs: string | null; serverErrors: string };
  code: {
    pathKey: string;
    handler: { method: string; routePattern: string; handlerName: string | null; definition: CodeLocation | null } | null;
    incidents: { count: number; lastAt: number | null; samples: IncidentSample[] } | null;
  } | null;
  currentServerRevision: string | null;
  aiAnalysis: { result: AiAnalysis; lang: string | null; at: number | null; countAtAnalysis: number | null } | null;
}
interface ClientFrame {
  generated: string; file: string | null; line: number | null; column: number | null;
  functionName: string | null; isAppCode: boolean; snippet: SnippetLine[];
}
interface ClientSource { available: boolean; reason: string | null; frames: ClientFrame[] }

const KIND_META: Record<ErrorReportDetail['kind'], { he: string; en: string; icon: string }> = {
  client_crash: { he: 'קריסת לקוח', en: 'Client crash', icon: '💥' },
  api_timeout: { he: 'תפוגת זמן', en: 'Timeout', icon: '⏱️' },
  network_failure: { he: 'כשל רשת/נתונים', en: 'Network/data failure', icon: '📡' },
};

const fmt = (ms: number | null | undefined, lang: Lang) =>
  ms ? new Date(ms).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

// ─── Small building blocks ──────────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-md border border-admin-outline-variant/60">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-admin-on-surface">{title}</summary>
      <div className="border-t border-admin-outline-variant/60 px-3 py-3 text-sm text-admin-on-surface">{children}</div>
    </details>
  );
}

function CodeBlock({
  loc,
  mark,
  title,
  snippet: lines,
}: {
  loc: { file: string | null; line: number | null; functionName?: string | null };
  mark?: number | null;
  title?: string;
  snippet: SnippetLine[];
}) {
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-admin-outline-variant/60" dir="ltr">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-admin-surface-container px-2 py-1 font-mono text-xs text-admin-on-surface">
        <span className="break-all">
          {title ? `${title} · ` : ''}
          <strong>{loc.file ?? '?'}</strong>
          {loc.line ? `:${loc.line}` : ''}
          {loc.functionName ? ` — ${loc.functionName}` : ''}
        </span>
        {loc.file && (
          <button
            type="button"
            className="rounded border border-admin-outline-variant px-1.5 py-0.5 text-[10px] hover:border-admin-primary"
            onClick={() => navigator.clipboard?.writeText(`${loc.file}${loc.line ? `:${loc.line}` : ''}`).catch(() => {})}
          >
            copy path
          </button>
        )}
      </div>
      {lines.length > 0 && (
        <pre className="max-h-72 overflow-auto bg-admin-surface-container-lowest p-0 text-xs leading-5">
          {lines.map((l) => (
            <div key={l.n} className={l.n === mark ? 'bg-admin-error-container text-admin-on-error-container' : 'text-admin-on-surface'}>
              <span className="inline-block w-12 select-none pe-2 text-end text-admin-on-surface-variant">{l.n}</span>
              <span className="whitespace-pre">{l.text}</span>
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}

function PercentBar({ value, label }: { value: number; label: string }) {
  const tone = value >= 70 ? 'bg-emerald-600' : value >= 40 ? 'bg-amber-500' : 'bg-admin-error';
  return (
    <div className="mt-1">
      <div className="flex items-center justify-between text-xs text-admin-on-surface-variant">
        <span>{label}</span>
        <span className="text-base font-bold text-admin-on-surface">{value}%</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-admin-surface-container" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-full ${tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ─── Modal ──────────────────────────────────────────────────────────────────

export function ErrorReportDetailModal({ id, lang, onClose }: { id: string; lang: Lang; onClose: () => void }) {
  const he = lang === 'he';
  const t = (heText: string, enText: string) => (he ? heText : enText);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);

  const [detail, setDetail] = useState<ErrorReportDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [clientSource, setClientSource] = useState<ClientSource | null>(null);
  const [ai, setAi] = useState<ErrorReportDetail['aiAnalysis']>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [note, setNote] = useState('');
  const [resolving, setResolving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Detail
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<ErrorReportDetail>(`/api/admin/system/error-reports/${encodeURIComponent(id)}`)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        if (d.aiAnalysis && d.aiAnalysis.lang === lang) setAi(d.aiAnalysis);
      })
      .catch((err) => !cancelled && setLoadError(err instanceof ApiError ? err.message : t('טעינת הפרטים נכשלה.', 'Failed to load details.')));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Web crash → real source lines via the private source-map route.
  useEffect(() => {
    if (!detail || detail.platform !== 'web' || !detail.stack) return;
    let cancelled = false;
    (async () => {
      try {
        const headers: Record<string, string> = { Accept: 'application/json', 'X-Lang': lang };
        const token = await auth.currentUser?.getIdToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        if (appCheck) {
          try { headers['X-Firebase-AppCheck'] = (await getAppCheckToken(appCheck)).token; } catch { /* monitor mode */ }
        }
        const res = await fetch(`/admin-tools/error-source/${encodeURIComponent(detail.id)}`, { headers, cache: 'no-store' });
        const body = (await res.json().catch(() => null)) as ClientSource | null;
        if (!cancelled) setClientSource(body ?? { available: false, reason: 'failed', frames: [] });
      } catch {
        if (!cancelled) setClientSource({ available: false, reason: 'failed', frames: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detail, lang]);

  const runAi = useCallback(
    async (force: boolean) => {
      if (!detail) return;
      setAiBusy(true);
      setAiError('');
      try {
        const clientFrames = (clientSource?.frames ?? [])
          .filter((f) => f.file && f.isAppCode)
          .slice(0, 5)
          .map((f) => ({ file: f.file, line: f.line, functionName: f.functionName, snippet: f.snippet }));
        const res = await apiClient.post<{ analysis: AiAnalysis; at: number }>(
          `/api/admin/system/error-reports/${encodeURIComponent(detail.id)}/ai-analysis`,
          { force, clientFrames },
          { timeoutMs: 180_000 }
        );
        setAi({ result: res.analysis, lang, at: res.at, countAtAnalysis: detail.count });
      } catch (err) {
        setAiError(err instanceof ApiError ? err.message : t('ניתוח ה-AI נכשל. נסה שוב.', 'AI analysis failed. Try again.'));
      } finally {
        setAiBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [detail, clientSource, lang]
  );

  const diag = useMemo(() => (detail ? diagnose(detail) : null), [detail]);
  const sigs = useMemo(
    () => (detail ? signals(detail, detail.occurrences, detail.currentServerRevision) : []),
    [detail]
  );

  // The single most useful "this line" — server exception frame, else first
  // app frame of a web crash, else the handler that serves the route.
  const primaryLocation = useMemo(() => {
    const serverFrame = detail?.code?.incidents?.samples.find((s) => s.frames?.length)?.frames[0];
    if (serverFrame) return { ...serverFrame, source: t('השורה בשרת שזרקה את השגיאה', 'Server line that threw') };
    const appFrame = clientSource?.frames.find((f) => f.isAppCode && f.file);
    if (appFrame) return { file: appFrame.file!, line: appFrame.line ?? 0, column: appFrame.column, functionName: appFrame.functionName, snippet: appFrame.snippet, source: t('השורה במסך שקרסה', 'Screen line that crashed') };
    const def = detail?.code?.handler?.definition;
    if (def) return { ...def, source: t('הפונקציה בשרת שמטפלת בנתיב (לא נרשמה עדיין שגיאה ספציפית)', 'Server function handling this route (no specific failing line recorded yet)') };
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, clientSource]);

  const resolve = async () => {
    if (!detail) return;
    setResolving(true);
    try {
      await apiClient.patch(`/api/admin/system/error-reports/${encodeURIComponent(detail.id)}/resolve`, { note: note.trim() || null });
      onClose();
    } catch {
      setResolving(false);
    }
  };

  const copyReport = () => {
    if (!detail) return;
    const lines = [
      `# ${KIND_META[detail.kind].en} (${detail.platform}) — ${detail.message}`,
      `Route: ${detail.route ?? '-'} · Count: ${detail.count} · Users: ${detail.affectedUserIds.length} · Reopened: ${detail.reopenCount}`,
      `First: ${detail.createdAt ? new Date(detail.createdAt).toISOString() : '-'} · Last: ${detail.lastOccurredAt ? new Date(detail.lastOccurredAt).toISOString() : '-'}`,
      primaryLocation ? `\n## Code location\n${primaryLocation.file}:${primaryLocation.line}${primaryLocation.functionName ? ` (${primaryLocation.functionName})` : ''}` : '',
      primaryLocation?.snippet?.length ? '```\n' + primaryLocation.snippet.map((l) => `${l.n === primaryLocation.line ? '>' : ' '}${l.n} ${l.text}`).join('\n') + '\n```' : '',
      ai ? `\n## AI analysis\nRoot cause: ${ai.result.rootCause}\nPermanent fix (${ai.result.permanentFix.permanenceChance}%):\n- ${ai.result.permanentFix.steps.join('\n- ')}\n${ai.result.permanentFix.codeChange ? '```\n' + ai.result.permanentFix.codeChange + '\n```' : ''}` : '',
      detail.stack ? `\n## Stack\n\`\`\`\n${detail.stack}\n\`\`\`` : '',
      `\n## Recent occurrences\n${detail.occurrences.map((o) => `- ${o.at ? new Date(o.at).toISOString() : '-'} page=${o.page ?? '-'} status=${o.httpStatus ?? '-'} dur=${o.durationMs ?? '-'}ms rev=${o.serverRevision ?? '-'}`).join('\n')}`,
    ];
    navigator.clipboard?.writeText(lines.filter(Boolean).join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  const meta = detail ? KIND_META[detail.kind] : null;
  const newSinceAi = ai && detail && ai.countAtAnalysis !== null ? detail.count - ai.countAtAnalysis : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-black/40 p-2 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t('פרטי תקלה', 'Error details')}
        dir={he ? 'rtl' : 'ltr'}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-admin-lg bg-admin-surface shadow-lg outline-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-admin-outline-variant p-4">
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-admin-on-surface">
              <span>{meta?.icon ?? '🩺'}</span>
              <span>{meta ? (he ? meta.he : meta.en) : t('פרטי תקלה', 'Error details')}</span>
              {detail && (
                <>
                  <span className="rounded-full bg-admin-surface-container px-2 py-0.5 text-xs uppercase text-admin-on-surface-variant">{detail.platform}</span>
                  <span className="rounded-full bg-admin-error-container px-2 py-0.5 text-xs font-bold text-admin-error">×{detail.count}</span>
                  {detail.reopenCount > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                      {t(`חזר ${detail.reopenCount}×`, `came back ${detail.reopenCount}×`)}
                    </span>
                  )}
                </>
              )}
            </h2>
            {detail && (
              <p className="mt-1 break-all font-mono text-xs text-admin-on-surface-variant" dir="ltr">
                {detail.route ?? '—'}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label={t('סגור', 'Close')} className="text-xl text-admin-on-surface-variant hover:text-admin-on-surface">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {loadError && <p className="rounded-md bg-admin-error-container px-3 py-2 text-sm text-admin-error" role="alert">{loadError}</p>}
          {!detail && !loadError && <p className="text-sm text-admin-on-surface-variant">{t('טוען…', 'Loading…')}</p>}

          {detail && diag && (
            <>
              {/* What is it */}
              <div className="rounded-md bg-admin-surface-container-low p-3">
                <p className="text-sm font-semibold text-admin-on-surface">{he ? diag.title.he : diag.title.en}</p>
                <p className="mt-1 text-sm text-admin-on-surface-variant">{he ? diag.meaning.he : diag.meaning.en}</p>
                <p className="mt-2 break-words rounded bg-admin-surface px-2 py-1 font-mono text-xs text-admin-on-surface" dir="ltr">{detail.message}</p>
              </div>

              {/* AI solution */}
              <Section title={`🤖 ${t('פתרון AI', 'AI solution')}`}>
                {!ai && !aiBusy && (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => runAi(false)}
                      className="rounded-md bg-admin-primary px-3 py-1.5 text-sm font-semibold text-admin-on-primary hover:opacity-90"
                    >
                      {t('נתח עם AI', 'Analyze with AI')}
                    </button>
                    <span className="text-xs text-admin-on-surface-variant">
                      {t('שולח את ההודעה, ה-stack, קטעי הקוד והסטטיסטיקה (ללא שמות/מיילים של משתמשים) ל-Claude. לוקח עד דקה.', 'Sends the message, stack, code excerpts and stats (no user names/emails) to Claude. Takes up to a minute.')}
                    </span>
                  </div>
                )}
                {aiBusy && <p className="animate-pulse text-sm text-admin-on-surface-variant">{t('ה-AI מנתח את התקלה והקוד…', 'AI is analyzing the error and code…')}</p>}
                {aiError && <p className="mt-2 rounded-md bg-admin-error-container px-3 py-2 text-sm text-admin-error" role="alert">{aiError}</p>}
                {ai && !aiBusy && (
                  <div className="space-y-3">
                    <p className="font-medium">{ai.result.summary}</p>
                    <div>
                      <p className="text-xs font-semibold uppercase text-admin-on-surface-variant">{t('שורש הבעיה', 'Root cause')}</p>
                      <p>{ai.result.rootCause}</p>
                      {ai.result.suspectedLocation.file && (
                        <p className="mt-1 text-xs text-admin-on-surface-variant">
                          📍 <span className="font-mono" dir="ltr">{ai.result.suspectedLocation.file}{ai.result.suspectedLocation.line ? `:${ai.result.suspectedLocation.line}` : ''}</span> — {ai.result.suspectedLocation.why}
                        </p>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-md border border-emerald-600/40 p-3">
                        <p className="text-sm font-semibold">✅ {t('פתרון קבוע', 'Permanent fix')}</p>
                        <PercentBar value={ai.result.permanentFix.permanenceChance} label={t('סיכוי שזה ייפתר לתמיד', 'Chance it is solved for good')} />
                        <ol className="mt-2 list-decimal space-y-1 ps-5">
                          {ai.result.permanentFix.steps.map((s, i) => <li key={i}>{s}</li>)}
                        </ol>
                        <p className="mt-2 text-xs text-admin-on-surface-variant">{ai.result.permanentFix.permanenceReasoning}</p>
                      </div>
                      <div className="rounded-md border border-amber-500/40 p-3">
                        <p className="text-sm font-semibold">🩹 {t('עקיפה זמנית', 'Temporary workaround')}</p>
                        <PercentBar value={ai.result.temporaryWorkaround.permanenceChance} label={t('סיכוי שזה ייפתר לתמיד', 'Chance it is solved for good')} />
                        <ol className="mt-2 list-decimal space-y-1 ps-5">
                          {ai.result.temporaryWorkaround.steps.map((s, i) => <li key={i}>{s}</li>)}
                        </ol>
                        <p className="mt-2 text-xs text-admin-on-surface-variant">{ai.result.temporaryWorkaround.whyTemporary}</p>
                      </div>
                    </div>

                    {ai.result.permanentFix.codeChange && (
                      <div>
                        <p className="text-xs font-semibold uppercase text-admin-on-surface-variant">{t('שינוי קוד מוצע', 'Suggested code change')}</p>
                        <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-admin-surface-container-lowest p-2 text-xs" dir="ltr">{ai.result.permanentFix.codeChange}</pre>
                      </div>
                    )}
                    {ai.result.howToVerify.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase text-admin-on-surface-variant">{t('איך לוודא שזה נפתר', 'How to verify it is fixed')}</p>
                        <ul className="list-disc space-y-1 ps-5">{ai.result.howToVerify.map((s, i) => <li key={i}>{s}</li>)}</ul>
                      </div>
                    )}
                    <PercentBar value={ai.result.diagnosisConfidence} label={t('ביטחון באבחנה', 'Confidence in the diagnosis')} />
                    {ai.result.missingInformation && (
                      <p className="text-xs text-admin-on-surface-variant">ℹ️ {t('מידע שהיה משפר את הדיוק: ', 'More data that would help: ')}{ai.result.missingInformation}</p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-admin-on-surface-variant">
                      <span>
                        {t('נותח', 'Analyzed')} {fmt(ai.at, lang)}
                        {newSinceAi > 0 && ` · ${t(`${newSinceAi} הופעות חדשות מאז`, `${newSinceAi} new occurrences since`)}`}
                        {' · '}
                        {t('הערכת AI — יש לבדוק לפני יישום', 'AI estimate — review before applying')}
                      </span>
                      <button type="button" onClick={() => runAi(true)} className="rounded-md border border-admin-outline-variant px-2 py-1 hover:border-admin-primary">
                        {t('נתח מחדש', 'Re-analyze')}
                      </button>
                    </div>
                  </div>
                )}
              </Section>

              {/* Code location */}
              <Section title={`📍 ${t('מיקום בקוד', 'Code location')}`}>
                {primaryLocation ? (
                  <>
                    <p className="text-xs text-admin-on-surface-variant">{primaryLocation.source}</p>
                    <CodeBlock loc={primaryLocation} mark={primaryLocation.line} snippet={primaryLocation.snippet} />
                  </>
                ) : (
                  <p className="text-admin-on-surface-variant">
                    {detail.platform === 'mobile' && detail.kind === 'client_crash'
                      ? t('קריסות באפליקציית המובייל עדיין לא ממופות לשורת קוד (דורש source maps של Hermes מ-EAS). ראה את ה-stack למטה.', 'Mobile app crashes are not mapped to a source line yet (needs Hermes source maps from EAS). See the stack below.')
                      : detail.platform === 'web' && detail.kind === 'client_crash' && !clientSource
                        ? t('ממפה את ה-stack לקוד המקור…', 'Mapping the stack to source…')
                        : clientSource?.reason === 'build_replaced'
                          ? t('הקריסה הגיעה מגרסת אתר קודמת — המפות שלה כבר לא קיימות. אם תחזור, השורה תוצג.', 'The crash came from a previous site build whose maps are gone. If it recurs, the line will show.')
                          : t('לא נמצא מיקום בקוד עבור התקלה הזו.', 'No code location found for this error.')}
                  </p>
                )}

                {/* Server side, for /api routes */}
                {detail.code?.handler && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase text-admin-on-surface-variant">{t('הנתיב בשרת', 'Server route')}</p>
                    <p className="font-mono text-xs" dir="ltr">
                      {detail.code.handler.method} {detail.code.handler.routePattern} → {detail.code.handler.handlerName ?? '(anonymous)'}
                      {detail.code.handler.definition && ` @ ${detail.code.handler.definition.file}:${detail.code.handler.definition.line}`}
                    </p>
                  </div>
                )}
                {detail.code && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase text-admin-on-surface-variant">{t('מה השרת עצמו רשם לנתיב הזה', 'What the server itself recorded for this route')}</p>
                    {!detail.code.incidents ? (
                      <p className="text-xs text-admin-on-surface-variant">
                        {t('השרת לא רשם כשל או בקשה איטית לנתיב הזה (הרישום פעיל מהפריסה הזו והלאה). אם הלקוח נכשל והשרת לא — הבעיה כנראה ברשת/CORS או לפני שהבקשה הגיעה.', 'The server has not recorded a failure or slow request on this route (recording starts with this deploy). If the client failed but the server did not, look at network/CORS or something before the request arrived.')}
                      </p>
                    ) : (
                      <ul className="mt-1 space-y-2">
                        {detail.code.incidents.samples.map((s, i) => (
                          <li key={i} className="rounded border border-admin-outline-variant/60 p-2 text-xs">
                            <div className="flex flex-wrap gap-x-3" dir="ltr">
                              <span>{fmt(s.at, lang)}</span>
                              <span className="font-semibold">
                                {s.kind === 'error' ? t('שגיאה', 'error') : s.kind === 'slow' ? t('איטי', 'slow') : t('הלקוח ויתר', 'client gave up')}
                              </span>
                              {s.status !== null && <span>HTTP {s.status}</span>}
                              <span>{s.durationMs !== null ? `${(s.durationMs / 1000).toFixed(1)}s` : ''}</span>
                              {s.revision && <span className="text-admin-on-surface-variant">{s.revision}</span>}
                            </div>
                            {s.message && <p className="mt-1 break-words font-mono" dir="ltr">{s.message}</p>}
                            {s.frames?.slice(0, 1).map((f, j) => <CodeBlock key={j} loc={f} mark={f.line} snippet={f.snippet} />)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Full mapped web stack */}
                {clientSource && clientSource.frames.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-admin-on-surface-variant">{t('כל השכבות ב-stack (ממופות)', 'All stack frames (mapped)')}</summary>
                    <ul className="mt-1 space-y-1 font-mono text-xs" dir="ltr">
                      {clientSource.frames.map((f, i) => (
                        <li key={i} className={f.isAppCode ? 'text-admin-on-surface' : 'text-admin-on-surface-variant'}>
                          {f.file ? `${f.functionName ?? '?'} — ${f.file}:${f.line}` : f.generated}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </Section>

              {/* Pattern signals */}
              {sigs.length > 0 && (
                <Section title={`🔎 ${t('מה הנתונים מראים', 'What the data shows')}`}>
                  <ul className="list-disc space-y-1 ps-5">{sigs.map((s, i) => <li key={i}>{he ? s.he : s.en}</li>)}</ul>
                </Section>
              )}

              {/* Rule-based guidance */}
              <Section title={`🛠️ ${t('סיבות אפשריות ופתרונות קבועים', 'Likely causes & permanent fixes')}`} defaultOpen={!ai}>
                <p className="text-xs font-semibold uppercase text-admin-on-surface-variant">{t('סיבות אפשריות', 'Likely causes')}</p>
                <ul className="mb-3 list-disc space-y-1 ps-5">{diag.causes.map((c, i) => <li key={i}>{he ? c.he : c.en}</li>)}</ul>
                <p className="text-xs font-semibold uppercase text-admin-on-surface-variant">{t('איך לפתור לתמיד', 'How to fix it for good')}</p>
                <ol className="list-decimal space-y-1 ps-5">{diag.fixes.map((c, i) => <li key={i}>{he ? c.he : c.en}</li>)}</ol>
              </Section>

              {/* Timeline + previous resolution */}
              <Section title={`🕒 ${t('ציר זמן', 'Timeline')}`} defaultOpen={false}>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-admin-on-surface-variant">{t('נראה לראשונה', 'First seen')}</dt><dd>{fmt(detail.createdAt, lang)}</dd>
                  <dt className="text-admin-on-surface-variant">{t('נראה לאחרונה', 'Last seen')}</dt><dd>{fmt(detail.lastOccurredAt, lang)}</dd>
                  <dt className="text-admin-on-surface-variant">{t('התראה נשלחה', 'Alert sent')}</dt><dd>{fmt(detail.notifiedAt, lang)}</dd>
                  <dt className="text-admin-on-surface-variant">{t('מספר הופעות', 'Occurrences')}</dt><dd>{detail.count}</dd>
                </dl>
                {(detail.lastResolutionNote || detail.lastResolvedAt) && (
                  <div className="mt-3 rounded-md bg-amber-50 p-2 text-sm text-amber-900">
                    <p className="font-semibold">{t('בפעם הקודמת סומן כטופל', 'Last time it was marked resolved')} — {fmt(detail.lastResolvedAt, lang)}
                      {detail.lastResolvedBy && detail.users[detail.lastResolvedBy]?.name ? ` (${detail.users[detail.lastResolvedBy]!.name})` : ''}</p>
                    <p>{detail.lastResolutionNote || t('ללא הערה', 'No note')}</p>
                  </div>
                )}
              </Section>

              {/* Affected users */}
              <Section title={`👥 ${t('משתמשים מושפעים', 'Affected users')} (${detail.affectedUserIds.length})`} defaultOpen={false}>
                {detail.affectedUserIds.length === 0 ? (
                  <p className="text-admin-on-surface-variant">{t('לא זוהו משתמשים מחוברים (דיווחים אנונימיים או מגרסה ישנה).', 'No signed-in users identified (anonymous reports or an older app version).')}</p>
                ) : (
                  <ul className="space-y-1">
                    {detail.affectedUserIds.map((uid) => {
                      const u = detail.users[uid];
                      return (
                        <li key={uid} className="flex flex-wrap gap-x-2">
                          <span className="font-medium">{u?.name ?? uid}</span>
                          {u?.role && <span className="text-xs text-admin-on-surface-variant">{u.role}</span>}
                          {u?.email && <span className="text-xs text-admin-on-surface-variant" dir="ltr">{u.email}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>

              {/* Occurrences */}
              <Section title={`📋 ${t('הופעות אחרונות', 'Recent occurrences')} (${detail.occurrences.length})`} defaultOpen={false}>
                {detail.occurrences.length === 0 ? (
                  <p className="text-admin-on-surface-variant">{t('אין פירוט להופעות (נרשם מהפריסה הזו והלאה).', 'No per-occurrence detail yet (recorded from this deploy on).')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs" dir="ltr">
                      <thead className="text-admin-on-surface-variant">
                        <tr className="text-start">
                          <th className="pe-3 text-start">{t('זמן', 'Time')}</th>
                          <th className="pe-3 text-start">{t('דף', 'Page')}</th>
                          <th className="pe-3 text-start">HTTP</th>
                          <th className="pe-3 text-start">{t('משך', 'Duration')}</th>
                          <th className="pe-3 text-start">{t('משתמש', 'User')}</th>
                          <th className="pe-3 text-start">{t('מכשיר/גרסה', 'Device/version')}</th>
                          <th className="text-start">{t('גרסת שרת', 'Server rev.')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.occurrences.map((o, i) => (
                          <tr key={i} className="border-t border-admin-outline-variant/40 align-top">
                            <td className="whitespace-nowrap pe-3">{fmt(o.at, lang)}</td>
                            <td className="pe-3 font-mono">{o.page ?? '—'}</td>
                            <td className="pe-3">{o.method ?? ''} {o.httpStatus ?? ''}</td>
                            <td className="whitespace-nowrap pe-3">{o.durationMs ? `${(o.durationMs / 1000).toFixed(1)}s` : '—'}</td>
                            <td className="pe-3">{o.userId ? detail.users[o.userId]?.name ?? o.userId.slice(0, 6) : '—'}</td>
                            <td className="max-w-[14rem] truncate pe-3" title={o.userAgent ?? ''}>{o.appVersion || o.os ? `${o.appVersion ?? ''} ${o.os ?? ''}` : (o.userAgent ?? '—')}</td>
                            <td className="whitespace-nowrap">{o.serverRevision ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              {/* Raw stack */}
              {detail.stack && (
                <Section title={`🧾 ${t('Stack trace גולמי', 'Raw stack trace')}`} defaultOpen={false}>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs" dir="ltr">{detail.stack}</pre>
                </Section>
              )}

              {/* Logs */}
              <div className="flex flex-wrap gap-2">
                {detail.links.requestLogs && (
                  <a href={detail.links.requestLogs} target="_blank" rel="noopener noreferrer" className="rounded-md border border-admin-outline-variant px-3 py-1.5 text-xs font-medium hover:border-admin-primary">
                    📜 {t('לוגים של הבקשה (Cloud Logging)', 'Request logs (Cloud Logging)')}
                  </a>
                )}
                <a href={detail.links.serverErrors} target="_blank" rel="noopener noreferrer" className="rounded-md border border-admin-outline-variant px-3 py-1.5 text-xs font-medium hover:border-admin-primary">
                  ⚠️ {t('שגיאות השרת בחלון הזמן', 'Server errors in this time window')}
                </a>
                <button type="button" onClick={copyReport} className="rounded-md border border-admin-outline-variant px-3 py-1.5 text-xs font-medium hover:border-admin-primary">
                  {copied ? t('הועתק ✓', 'Copied ✓') : `📋 ${t('העתק דוח מלא למפתח', 'Copy full report for a developer')}`}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer: resolve with a note */}
        {detail && detail.status === 'open' && (
          <div className="border-t border-admin-outline-variant p-4">
            <label className="block text-xs font-medium text-admin-on-surface-variant" htmlFor="resolution-note">
              {t('מה נעשה כדי לפתור? (יוצג שוב אם התקלה תחזור)', 'What was done to fix it? (shown again if it comes back)')}
            </label>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row">
              <input
                id="resolution-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                placeholder={t('לדוגמה: הוספתי limit לשאילתה ב-getChatDashboard', 'e.g. added a limit to the query in getChatDashboard')}
                className="flex-1 rounded-md border border-admin-outline-variant bg-admin-surface px-3 py-2 text-sm text-admin-on-surface focus:border-admin-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={resolve}
                disabled={resolving}
                className="rounded-md bg-admin-primary px-4 py-2 text-sm font-semibold text-admin-on-primary hover:opacity-90 disabled:opacity-50"
              >
                {resolving ? '…' : t('סמן כטופל', 'Mark resolved')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
