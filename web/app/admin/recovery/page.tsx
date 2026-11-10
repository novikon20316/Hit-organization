'use client';

// app/admin/recovery/page.tsx — system_admin "Backup & Recovery".
//  1. Status of the automatic encrypted recovery files (daily data, weekly
//     with all uploaded files) and "back up now".
//  2. The decryption key: fingerprint, age, holders, "Test my key".
//  3. Restore wizard: the .hitrec file is decrypted IN THIS BROWSER with the
//     holder's key kit (private key + passphrase never sent anywhere), checked
//     with a dry run, then applied in small batches.
// Server side: server/src/controllers/recoveryController.ts. Procedure:
// RECOVERY_RUNBOOK_HE.md and the system-admin manual.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import type { AppRole } from '@/lib/roles';
import {
  JournalOverlay, RecoveryDecryptor, fromB64, openKeyFile, readRecoveryHeader, parseJson, parseKeyFile, parseNdjson, toB64,
  type AuthUserLine, type FileIndexLine, type FsDocLine, type KeyFile, type KeyKit, type RecoveryManifest,
} from '@/lib/recovery/format';
import { batchDocs, readRecoveryFile, recoveryApi, type RecoveryStatus, type RestoreMode, type RunSummary } from '@/lib/recovery/client';

const ADMIN_ROLES: AppRole[] = ['system_admin'];
const FULL_CONFIRM = 'שחזור מלא';

type T = (he: string, en: string) => string;

function fmtDate(ms: number | null | undefined, lang: 'he' | 'en'): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

function fmtDuration(ms: number, t: T): string {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return t(`כ-${min} דקות`, `about ${min} min`);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return t(`כ-${h} שעות ו-${m} דקות`, `about ${h} h ${m} min`);
}

/** Rough restore time from the manifest — measured numbers from drills
 *  should replace these constants over time. */
function estimateRestoreMs(m: RecoveryManifest): number {
  const docs = Object.values(m.firestore).reduce((a, b) => a + b, 0);
  return 30_000 + m.authUsers * 30 + docs * 15 + m.filesIncluded * 1500 + (m.filesIncludedBytes / 1048576) * 1500;
}

const card = 'rounded-[var(--radius)] border border-line bg-surface p-4';
const btn = 'rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-50';
const btnGhost = 'rounded-lg border border-line px-3 py-1.5 text-sm text-ink hover:bg-paper disabled:opacity-50';
const input = 'rounded-lg border border-line bg-paper px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none';

export default function RecoveryPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(ADMIN_ROLES);
  const { lang } = useLanguage();
  const t: T = useCallback((he, en) => (lang === 'he' ? he : en), [lang]);
  const [status, setStatus] = useState<RecoveryStatus | null>(null);
  const [error, setError] = useState('');

  const [reloadTick, setReloadTick] = useState(0);
  const load = useCallback(() => setReloadTick((n) => n + 1), []);
  useEffect(() => {
    if (!isAllowed) return;
    let cancelled = false;
    recoveryApi.status().then(
      (st) => { if (!cancelled) { setStatus(st); setError(''); } },
      (e: Error) => { if (!cancelled) setError(e.message); },
    );
    return () => { cancelled = true; };
  }, [isAllowed, reloadTick]);

  if (guardLoading || !isAllowed) {
    return <div className="flex min-h-screen items-center justify-center bg-paper"><p className="text-sm text-muted">…</p></div>;
  }

  return (
    <DashboardShell
      title={t('גיבוי ושחזור', 'Backup & Recovery')}
      subtitle={t(
        'קובץ שחזור מוצפן נוצר אוטומטית כל לילה ונשלח לשני מקומות בטוחים. מכאן בודקים שהוא תקין, בודקים את מפתח הפענוח, ומשחזרים את המערכת במקרה הצורך.',
        'An encrypted recovery file is created every night and sent to two safe places. Check it here, test your decryption key, and restore the system when needed.',
      )}
    >
      {error && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      {!status ? <p className="text-sm text-muted">…</p> : (
        <div className="grid gap-6">
          <StatusCard status={status} t={t} lang={lang} onChanged={load} />
          <KeyCard status={status} t={t} lang={lang} onChanged={load} />
          <RestoreWizard status={status} t={t} lang={lang} onChanged={load} />
        </div>
      )}
    </DashboardShell>
  );
}

// ── 1. Status ────────────────────────────────────────────────────────────────

function RunRow({ label, run, t, lang }: { label: string; run: RunSummary | null; t: T; lang: 'he' | 'en' }) {
  if (!run) return <tr><td className="py-1 pe-3 font-medium">{label}</td><td colSpan={4} className="py-1 text-muted">{t('עדיין לא רץ', 'Not run yet')}</td></tr>;
  return (
    <tr className="align-top">
      <td className="py-1 pe-3 font-medium">{label}</td>
      <td className="py-1 pe-3">{run.ok ? '✅' : '❌'} {fmtDate(run.at, lang)}</td>
      <td className="py-1 pe-3">{run.ok ? fmtBytes(run.bytes) : '—'}</td>
      <td className="py-1 pe-3 text-xs">
        {run.counts ? t(
          `${run.counts.authUsers} משתמשים · ${run.counts.firestoreDocs} רשומות · ${run.counts.filesIncluded}/${run.counts.filesIndexed} קבצים`,
          `${run.counts.authUsers} logins · ${run.counts.firestoreDocs} docs · ${run.counts.filesIncluded}/${run.counts.filesIndexed} files`,
        ) : null}
      </td>
      <td className="py-1 text-xs">
        {Object.keys(run.locations).map((k) => <div key={k}>✔ {k === 'bucket' ? t('דלי נעול', 'Locked bucket') : k === 'drive' ? 'Google Drive' : k}</div>)}
        {Object.entries(run.errors).map(([k, v]) => <div key={k} className="text-danger">✖ {k}: {v}</div>)}
        {run.warnings.slice(0, 3).map((w) => <div key={w} className="text-muted">⚠ {w}</div>)}
      </td>
    </tr>
  );
}

function StatusCard({ status, t, lang, onChanged }: { status: RecoveryStatus; t: T; lang: 'he' | 'en'; onChanged: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const c = status.configured;

  const runNow = async (kind: 'manual' | 'weekly') => {
    setBusy(true); setMsg('');
    try {
      await recoveryApi.runNow(kind, code);
      setMsg(t('הגיבוי התחיל. הוא רץ ברקע (כמה דקות, ועם קבצים יותר). רעננו את הדף בהמשך.', 'Backup started. It runs in the background (minutes; longer with files). Refresh later.'));
      setCode('');
      setTimeout(onChanged, 5000);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <section className={card}>
      <h2 className="mb-2 text-base font-semibold text-ink">🗄️ {t('קבצי שחזור אוטומטיים', 'Automatic recovery files')}</h2>
      {status.stale && (
        <p className="mb-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
          {t('אין קובץ שחזור תקין מהיממה וחצי האחרונות. מנהלי המערכת קיבלו התראה בדוא"ל.', 'No successful recovery file in the last 36 hours. System admins were emailed.')}
        </p>
      )}
      <ul className="mb-3 grid gap-1 text-sm sm:grid-cols-2">
        <li>{c.publicKey ? '✅' : '❌'} {t('מפתח ציבורי מוגדר בשרת', 'Public key set on the server')}</li>
        <li>{c.bucket ? '✅' : '❌'} {t('דלי נעול בפרויקט נפרד', 'Locked bucket in a separate project')}</li>
        <li>{c.drive ? '✅' : '❌'} {t('תיקיית Google Drive של חשבון גיבוי', 'Google Drive folder of a backup account')}</li>
        <li>🕑 {t('כל לילה 02:30 · יום ראשון = מלא עם כל הקבצים', 'Nightly 02:30 · Sunday = full with all files')}</li>
      </ul>
      <p className={`mb-3 text-sm ${status.journal.queued > 0 || (status.journal.lastFailAt ?? 0) > (status.journal.lastOkAt ?? 0) ? 'text-danger' : 'text-ink'}`}>
        ⚡ {t('יומן אירועים בזמן אמת (כל הגשה, אישור, ציון ורשומת פרויקט נשלחים מוצפנים לכספת תוך שניות)', 'Real-time event journal (every submission, approval, grade and project record goes to the vault, encrypted, within seconds)')}:{' '}
        {!status.journal.enabled ? t('לא פעיל — חסר מפתח או דלי', 'off — key or bucket missing')
          : t(`אחרון ${fmtDate(status.journal.lastOkAt, lang)} · ${status.journal.okCount} אירועים · ${status.journal.queued} ממתינים בתור`, `last ${fmtDate(status.journal.lastOkAt, lang)} · ${status.journal.okCount} events · ${status.journal.queued} queued`)}
        {status.journal.lastError && (status.journal.lastFailAt ?? 0) > (status.journal.lastOkAt ?? 0) ? ` · ✖ ${status.journal.lastError}` : ''}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-start text-sm">
          <thead className="text-xs text-muted"><tr>
            <th className="pe-3 text-start font-normal">{t('סוג', 'Kind')}</th>
            <th className="pe-3 text-start font-normal">{t('אחרון', 'Last')}</th>
            <th className="pe-3 text-start font-normal">{t('גודל', 'Size')}</th>
            <th className="pe-3 text-start font-normal">{t('תוכן', 'Contents')}</th>
            <th className="text-start font-normal">{t('יעדים', 'Destinations')}</th>
          </tr></thead>
          <tbody>
            <RunRow label={t('יומי', 'Daily')} run={status.runs.daily} t={t} lang={lang} />
            <RunRow label={t('שבועי (מלא)', 'Weekly (full)')} run={status.runs.weekly} t={t} lang={lang} />
            <RunRow label={t('ידני', 'Manual')} run={status.runs.manual} t={t} lang={lang} />
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-muted">
          {t('קוד מאפליקציית האימות', 'Authenticator code')}
          <input className={`${input} w-28`} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label={t('קוד אימות', 'Authenticator code')} />
        </label>
        <button className={btn} disabled={busy || code.length !== 6 || !c.publicKey} onClick={() => void runNow('manual')}>{t('גבה עכשיו (נתונים)', 'Back up now (data)')}</button>
        <button className={btnGhost} disabled={busy || code.length !== 6 || !c.publicKey} onClick={() => void runNow('weekly')}>{t('גבה עכשיו כולל כל הקבצים', 'Back up now incl. all files')}</button>
      </div>
      {msg && <p className="mt-2 text-sm text-muted" role="status">{msg}</p>}
    </section>
  );
}

// ── 2. Key ───────────────────────────────────────────────────────────────────

function KeyKitPicker({ t, onOpened }: { t: T; onOpened: (kit: KeyKit, file: KeyFile) => void }) {
  const [file, setFile] = useState<KeyFile | null>(null);
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = async (f: File | undefined) => {
    setErr('');
    if (!f) { setFile(null); return; }
    try { setFile(parseKeyFile(await f.text())); } catch (e) { setErr((e as Error).message); setFile(null); }
  };
  const open = async () => {
    if (!file) return;
    setBusy(true); setErr('');
    try { onOpened(await openKeyFile(file, pass), file); setPass(''); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-xs text-muted">
        {t('קובץ מפתח (.hitkey)', 'Key file (.hitkey)')}
        <input type="file" accept=".hitkey,application/json" onChange={(e) => void pick(e.target.files?.[0])} className="text-sm text-ink" />
      </label>
      {file && <p className="text-xs text-muted">{t('טביעת אצבע', 'Fingerprint')}: <code dir="ltr">{file.fingerprint}</code></p>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-muted">
          {t('סיסמת המפתח', 'Key passphrase')}
          <input type="password" autoComplete="off" className={`${input} w-64`} value={pass} onChange={(e) => setPass(e.target.value)} />
        </label>
        <button className={btn} disabled={!file || !pass || busy} onClick={() => void open()}>{busy ? '…' : t('פתח מפתח', 'Unlock key')}</button>
      </div>
      <p className="text-xs text-muted">{t('המפתח והסיסמה נשארים במחשב הזה בלבד ואינם נשלחים לשרת.', 'The key and passphrase stay on this computer only; they are never sent to the server.')}</p>
      {err && <p className="text-xs text-danger" role="alert">{err}</p>}
    </div>
  );
}

function KeyCard({ status, t, lang, onChanged }: { status: RecoveryStatus; t: T; lang: 'he' | 'en'; onChanged: () => void }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState('');
  const k = status.key;
  const [now] = useState(() => Date.now());
  const ageDays = k.firstSeenAt ? Math.floor((now - k.firstSeenAt) / 86_400_000) : null;

  const test = async (kit: KeyKit, file: KeyFile) => {
    setResult('');
    try {
      const { challengeB64 } = await recoveryApi.keyTestStart();
      const d = new RecoveryDecryptor(kit);
      const parts = await d.feed(fromB64(challengeB64));
      d.end();
      const secret = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let off = 0;
      for (const p of parts) { secret.set(p, off); off += p.length; }
      const { ok } = await recoveryApi.keyTestFinish(toB64(secret), file.sealedAt ?? null);
      setResult(ok ? t('✅ המפתח שלך תקין ופותח את קבצי השחזור הנוכחיים.', '✅ Your key works and opens the current recovery files.') : t('❌ הבדיקה נכשלה.', '❌ The test failed.'));
      setTesting(false);
      onChanged();
    } catch (e) {
      setResult(`❌ ${(e as Error).message}`);
    }
  };

  return (
    <section className={card}>
      <h2 className="mb-2 text-base font-semibold text-ink">🔑 {t('מפתח הפענוח', 'Decryption key')}</h2>
      <p className="mb-2 text-sm text-ink">
        {t('המערכת מחזיקה רק את החצי הציבורי (נועל). החצי הפרטי (פותח) והסיסמה שלו נשמרים אצל שני מחזיקי מפתח ובמעטפה סגורה בכספת. המערכת לעולם לא שומרת ולא מציגה אותם.',
          'The system holds only the public half (locks). The private half (unlocks) and its passphrase are kept by two key holders and in a sealed envelope in the safe. The system never stores or shows them.')}
      </p>
      <dl className="mb-3 grid gap-1 text-sm sm:grid-cols-2">
        <div><dt className="inline text-muted">{t('טביעת אצבע: ', 'Fingerprint: ')}</dt><dd className="inline"><code dir="ltr">{k.fingerprint ?? '—'}</code></dd></div>
        <div><dt className="inline text-muted">{t('גיל המפתח: ', 'Key age: ')}</dt><dd className="inline">{ageDays == null ? '—' : t(`${ageDays} ימים`, `${ageDays} days`)}</dd></div>
      </dl>
      {k.rotationDue && <p className="mb-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{t(`עברו יותר מ-${k.rotateAfterDays} ימים — הגיע הזמן להחליף זוג מפתחות (ראו המדריך).`, `Over ${k.rotateAfterDays} days old — time to rotate the key pair (see the manual).`)}</p>}
      <h3 className="mt-2 text-sm font-semibold text-ink">{t('מחזיקי מפתח שבדקו את המפתח', 'Holders who tested the key')}</h3>
      {k.holders.length === 0 ? <p className="text-sm text-muted">{t('אף אחד עדיין. כל מחזיק/ה צריך/ה ללחוץ "בדיקת המפתח שלי".', 'Nobody yet. Each holder should run "Test my key".')}</p> : (
        <ul className="text-sm">
          {k.holders.map((h) => (
            <li key={h.uid}>
              {h.name} — {t('נבדק', 'tested')} {fmtDate(h.verifiedAt, lang)}
              {h.passphraseDue && <span className="ms-2 text-danger">{t(`· הסיסמה בת יותר מ-${k.passphraseRotateAfterDays} ימים, יש להחליף`, `· passphrase older than ${k.passphraseRotateAfterDays} days, change it`)}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        {!testing ? (
          <button className={btnGhost} disabled={!k.fingerprint} onClick={() => setTesting(true)}>{t('בדיקת המפתח שלי', 'Test my key')}</button>
        ) : (
          <KeyKitPicker t={t} onOpened={(kit, file) => void test(kit, file)} />
        )}
        {result && <p className="mt-2 text-sm" role="status">{result}</p>}
      </div>
    </section>
  );
}

// ── 3. Restore ───────────────────────────────────────────────────────────────

interface DryRunReport {
  manifest: RecoveryManifest;
  fingerprint: string;
  auth: { added: number; existing: number; emailChanged: number; withoutPassword: number };
  firestore: Record<string, { added: number; same: number; changed: number }>;
  files: { inFile: number; missingLive: number; indexedMissingNotInFile: number };
  liveCollectionsNotInFile: string[];
  journal: { events: number; docs: number; files: number; lastEventAt: string | null; snapshotAt: string } | null;
}

/** The backup's snapshot instant (from the plaintext header, so it's known
 *  before streaming), and every journal event after it. */
async function loadJournal(file: File, journalFiles: File[], kit: KeyKit): Promise<{ overlay: JournalOverlay; snapshotAt: string }> {
  const h = readRecoveryHeader(new Uint8Array(await file.slice(0, 70_000).arrayBuffer()))?.header;
  const snapshotAt = h?.snapshotReadTime ?? new Date(Math.floor(Date.parse(h?.createdAt ?? '0') / 60_000) * 60_000).toISOString();
  const overlay = new JournalOverlay(Date.parse(snapshotAt));
  for (const jf of journalFiles) {
    const jh = readRecoveryHeader(new Uint8Array(await jf.slice(0, 70_000).arrayBuffer()))?.header;
    if (jh?.kind !== 'journal') throw new Error(`${jf.name}: not a journal file`);
    await readRecoveryFile(jf, kit, async (meta, body) => overlay.add(meta, body));
  }
  return { overlay, snapshotAt };
}

function toLocalInput(ms: number): string {
  const d = new Date(ms - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

function RestoreWizard({ status, t, lang, onChanged }: { status: RecoveryStatus; t: T; lang: 'he' | 'en'; onChanged: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [journalFiles, setJournalFiles] = useState<File[]>([]);
  const [kit, setKit] = useState<KeyKit | null>(null);
  const [progress, setProgress] = useState('');
  const [report, setReport] = useState<DryRunReport | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [confirmText, setConfirmText] = useState('');
  const [grace, setGrace] = useState(true);
  const [graceFrom, setGraceFrom] = useState('');
  const [graceTo, setGraceTo] = useState('');
  const [revoke, setRevoke] = useState(true);
  const [safetyOk, setSafetyOk] = useState(false);
  const [code, setCode] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = (line: string) => {
    setLog((l) => [...l, line]);
    setTimeout(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight }), 0);
  };

  const dryRun = async () => {
    if (!file || !kit) return;
    setBusy(true); setErr(''); setReport(null); setProgress('');
    try {
      const [live, liveCols] = await Promise.all([recoveryApi.liveFiles(), recoveryApi.liveCollections()]);
      const liveKeys = new Set(live.keys);
      const rep: Omit<DryRunReport, 'manifest' | 'fingerprint'> & { manifest: RecoveryManifest | null } = {
        manifest: null,
        auth: { added: 0, existing: 0, emailChanged: 0, withoutPassword: 0 },
        firestore: {},
        files: { inFile: 0, missingLive: 0, indexedMissingNotInFile: 0 },
        liveCollectionsNotInFile: [],
        journal: null,
      };
      const { overlay, snapshotAt } = await loadJournal(file, journalFiles, kit);
      const fingerprint = readRecoveryHeader(new Uint8Array(await file.slice(0, 70_000).arrayBuffer()))?.header.fingerprint ?? '';
      await readRecoveryFile(file, kit, async (meta, body) => {
        if (meta.t === 'auth') {
          const r = (await recoveryApi.dryRun({ users: parseNdjson<AuthUserLine>(body) })).auth!;
          for (const k of Object.keys(rep.auth) as Array<keyof typeof rep.auth>) rep.auth[k] += r[k];
        } else if (meta.t === 'fs') {
          for (const batch of batchDocs(overlay.overlay(parseNdjson<FsDocLine>(body)))) {
            const r = (await recoveryApi.dryRun({ docs: batch })).firestore ?? {};
            for (const [c, v] of Object.entries(r)) {
              const x = (rep.firestore[c] ??= { added: 0, same: 0, changed: 0 });
              x.added += v.added; x.same += v.same; x.changed += v.changed;
            }
          }
        } else if (meta.t === 'fileindex') {
          for (const f of parseNdjson<FileIndexLine>(body)) {
            if (!f.inThisFile && !liveKeys.has(`${f.type}/${f.resourceType}/${f.publicId}`)) rep.files.indexedMissingNotInFile++;
          }
        } else if (meta.t === 'file') {
          rep.files.inFile++;
          if (!liveKeys.has(`${meta.type}/${meta.resourceType}/${meta.publicId}`)) rep.files.missingLive++;
        } else if (meta.t === 'manifest') {
          rep.manifest = parseJson<RecoveryManifest>(body);
        }
      }, (read, total) => setProgress(t(`נקרא ${Math.round((read / total) * 100)}%`, `Read ${Math.round((read / total) * 100)}%`)));
      if (!rep.manifest) throw new Error(t('לקובץ אין מניפסט — הוא לא שלם.', 'The file has no manifest — it is incomplete.'));
      for (const batch of batchDocs(overlay.leftovers())) {
        const r = (await recoveryApi.dryRun({ docs: batch })).firestore ?? {};
        for (const [c, v] of Object.entries(r)) {
          const x = (rep.firestore[c] ??= { added: 0, same: 0, changed: 0 });
          x.added += v.added; x.same += v.same; x.changed += v.changed;
        }
      }
      rep.journal = { events: overlay.events.size, docs: overlay.docCount, files: overlay.files.length, lastEventAt: overlay.lastEventAt, snapshotAt };
      rep.liveCollectionsNotInFile = liveCols.collections.filter((c) => !(c in rep.manifest!.firestore));
      setReport({ ...rep, manifest: rep.manifest, fingerprint });
      setGraceFrom(toLocalInput(Date.parse(overlay.lastEventAt ?? snapshotAt)));
      setGraceTo(toLocalInput(Date.now()));
      setProgress('');
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  const apply = async () => {
    if (!file || !kit || !report) return;
    setBusy(true); setErr(''); setLog([]); setDone(false);
    const summary = { auth: { imported: 0, skipped: 0, withoutPassword: 0, failed: 0 }, docs: { written: 0, skipped: 0 }, files: { uploaded: 0, existed: 0, failed: 0 }, disabled: 0 };
    try {
      const m = report.manifest;
      const { restoreId } = await recoveryApi.begin({
        mode, totpCode: code, confirmText,
        file: { name: file.name, kind: m.kind, createdAt: m.createdAt, fingerprint: report.fingerprint },
      });
      setCode('');
      addLog(t('השחזור נפתח. המערכת במצב תחזוקה למשתמשים.', 'Restore opened. The system is in maintenance for users.'));

      if (mode === 'full') {
        const { collections } = await recoveryApi.liveCollections();
        for (const c of collections) {
          const r = await recoveryApi.wipe(restoreId, c);
          addLog(t(`נמחק אוסף ${c}: ${r.deleted}`, `Wiped ${c}: ${r.deleted}`));
        }
      }

      const live = mode === 'merge' ? new Set((await recoveryApi.liveFiles()).keys) : new Set<string>();
      const { overlay } = await loadJournal(file, journalFiles, kit);
      const uids: string[] = [];
      let lastDocLog = 0;
      await readRecoveryFile(file, kit, async (meta, body) => {
        if (meta.t === 'auth') {
          const users = parseNdjson<AuthUserLine>(body);
          users.forEach((u) => uids.push(u.uid));
          const r = await recoveryApi.auth(restoreId, users, kit.firebaseHash);
          summary.auth.imported += r.imported; summary.auth.skipped += r.skipped; summary.auth.withoutPassword += r.withoutPassword; summary.auth.failed += r.failed.length;
          addLog(t(`משתמשים: ${summary.auth.imported} שוחזרו, ${summary.auth.skipped} קיימים`, `Logins: ${summary.auth.imported} restored, ${summary.auth.skipped} existed`));
          r.failed.slice(0, 5).forEach((f) => addLog(`⚠ ${f.uid}: ${f.error}`));
        } else if (meta.t === 'fs') {
          for (const batch of batchDocs(overlay.overlay(parseNdjson<FsDocLine>(body)))) {
            const r = await recoveryApi.firestore(restoreId, batch, m.cloudinaryCloud);
            summary.docs.written += r.written; summary.docs.skipped += r.skipped;
          }
          if (summary.docs.written + summary.docs.skipped - lastDocLog > 500) {
            lastDocLog = summary.docs.written + summary.docs.skipped;
            addLog(t(`רשומות: ${summary.docs.written} נכתבו`, `Documents: ${summary.docs.written} written`));
          }
        } else if (meta.t === 'file') {
          if (mode === 'merge' && live.has(`${meta.type}/${meta.resourceType}/${meta.publicId}`)) { summary.files.existed++; return; }
          try {
            const r = await recoveryApi.file(restoreId, meta, body);
            summary.files[r.result]++;
          } catch (e) {
            summary.files.failed++;
            addLog(`⚠ ${meta.publicId}: ${(e as Error).message}`);
          }
          const n = summary.files.uploaded + summary.files.existed + summary.files.failed;
          if (n % 25 === 0) addLog(t(`קבצים: ${n}/${report.files.inFile}`, `Files: ${n}/${report.files.inFile}`));
        }
      }, (read, total) => setProgress(t(`התקדמות ${Math.round((read / total) * 100)}%`, `Progress ${Math.round((read / total) * 100)}%`)));
      if (overlay.events.size) {
        for (const batch of batchDocs(overlay.leftovers())) {
          const r = await recoveryApi.firestore(restoreId, batch, m.cloudinaryCloud);
          summary.docs.written += r.written; summary.docs.skipped += r.skipped;
        }
        for (const f of overlay.files) {
          try { summary.files[(await recoveryApi.file(restoreId, f.meta, f.body)).result]++; } catch (e) { summary.files.failed++; addLog(`⚠ ${f.meta.publicId}: ${(e as Error).message}`); }
        }
        addLog(t(`יומן אירועים: ${overlay.events.size} אירועים שוחזרו, עד ${fmtDate(Date.parse(overlay.lastEventAt ?? ''), lang)}`, `Journal: ${overlay.events.size} events replayed, up to ${fmtDate(Date.parse(overlay.lastEventAt ?? ''), lang)}`));
      }
      addLog(t(`רשומות: ${summary.docs.written} נכתבו, ${summary.docs.skipped} קיימות`, `Documents: ${summary.docs.written} written, ${summary.docs.skipped} existed`));
      addLog(t(`קבצים: ${summary.files.uploaded} הועלו, ${summary.files.existed} קיימים, ${summary.files.failed} נכשלו`, `Files: ${summary.files.uploaded} uploaded, ${summary.files.existed} existed, ${summary.files.failed} failed`));

      if (mode === 'full' && uids.length) {
        summary.disabled = (await recoveryApi.disableMissing(restoreId, uids)).disabled;
        addLog(t(`${summary.disabled} חשבונות שלא היו בקובץ הושבתו (לא נמחקו)`, `${summary.disabled} logins not in the file were disabled (not deleted)`));
      }

      const fin = await recoveryApi.finish(restoreId, {
        outageGrace: grace && graceFrom && graceTo ? { from: new Date(graceFrom).toISOString(), to: new Date(graceTo).toISOString() } : null,
        revokeSessions: revoke,
        summary,
      });
      if (fin.grace) addLog(t(`חסד השבתה: ${fin.grace.projects} פרויקטים, ${fin.grace.milestones} מועדים הוזזו`, `Outage grace: ${fin.grace.projects} projects, ${fin.grace.milestones} due dates moved`));
      addLog(t('✅ השחזור הסתיים. מצב התחזוקה הוסר.', '✅ Restore finished. Maintenance lifted.'));
      if (revoke) addLog(t('כל המשתמשים (כולל את/ה) יתבקשו להתחבר מחדש עם אותה סיסמה.', 'Everyone (including you) will be asked to sign in again with the same password.'));
      setDone(true);
      setProgress('');
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
      addLog(`❌ ${(e as Error).message}`);
      addLog(t('השחזור נעצר. המערכת עדיין במצב תחזוקה — אפשר לנסות שוב או ללחוץ "ביטול שחזור".', 'Restore stopped. The system is still in maintenance — retry, or press "Cancel restore".'));
    } finally { setBusy(false); }
  };

  const cancel = async () => {
    try { await recoveryApi.cancel(); onChanged(); addLog(t('השחזור בוטל ומצב התחזוקה הוסר.', 'Restore cancelled; maintenance lifted.')); } catch (e) { setErr((e as Error).message); }
  };

  const totals = useMemo(() => {
    if (!report) return null;
    return Object.values(report.firestore).reduce((a, v) => ({ added: a.added + v.added, same: a.same + v.same, changed: a.changed + v.changed }), { added: 0, same: 0, changed: 0 });
  }, [report]);

  const canApply = !!report && !busy && code.length === 6 && safetyOk && (mode === 'merge' || confirmText.trim() === FULL_CONFIRM);

  return (
    <section className={card}>
      <h2 className="mb-2 text-base font-semibold text-ink">♻️ {t('שחזור המערכת מקובץ שחזור', 'Restore the system from a recovery file')}</h2>
      {status.openRestore && (
        <p className="mb-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
          {t(`שחזור פתוח (${status.openRestore.mode}) ע"י ${status.openRestore.startedBy} מ-${fmtDate(status.openRestore.startedAt, lang)}.`, `A restore (${status.openRestore.mode}) is open by ${status.openRestore.startedBy} since ${fmtDate(status.openRestore.startedAt, lang)}.`)}
          <button className="ms-2 underline" onClick={() => void cancel()}>{t('ביטול שחזור', 'Cancel restore')}</button>
        </p>
      )}

      <ol className="grid gap-4">
        <li>
          <p className="mb-1 text-sm font-semibold text-ink">{t('1. בחירת קובץ ומפתח', '1. Choose the file and key')}</p>
          <label className="grid gap-1 text-xs text-muted">
            {t('קובץ שחזור (.hitrec) — מה-Drive או מהדלי', 'Recovery file (.hitrec) — from Drive or the bucket')}
            <input type="file" accept=".hitrec" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setReport(null); }} className="text-sm text-ink" />
          </label>
          {file && <p className="mt-1 text-xs text-muted">{file.name} · {fmtBytes(file.size)}</p>}
          <label className="mt-2 grid gap-1 text-xs text-muted">
            {t('קבצי יומן אירועים (אופציונלי, אפשר לבחור הרבה) — מתיקיית journal בדלי, מהיום של הגיבוי ואילך. משחזרים כל אירוע שקרה אחרי הגיבוי, עד שניות לפני האירוע.',
              'Event journal files (optional, select many) — from the journal folder in the bucket, from the day of the backup onward. Replays every event after the backup, up to seconds before the incident.')}
            <input type="file" accept=".hitrec" multiple onChange={(e) => { setJournalFiles([...(e.target.files ?? [])]); setReport(null); }} className="text-sm text-ink" />
          </label>
          {journalFiles.length > 0 && <p className="mt-1 text-xs text-muted">{t(`${journalFiles.length} קבצי יומן`, `${journalFiles.length} journal files`)}</p>}
          <p className="mt-2 text-xs text-muted">
            {t('טיפ: לשחזור מלא, משחזרים קודם את הקובץ השבועי האחרון (כל הקבצים), ואחריו את היומי האחרון במצב "השלמה".',
              'Tip: for a complete recovery restore the latest weekly file first (all uploads), then the latest daily in "merge" mode.')}
          </p>
          <div className="mt-2">
            {kit ? <p className="text-sm text-success">✅ {t('המפתח פתוח', 'Key unlocked')}{kit.firebaseHash ? '' : t(' — ⚠ בלי פרמטרי הסיסמאות של Firebase: משתמשי סיסמה ישוחזרו בלי סיסמה', ' — ⚠ no Firebase password parameters: password users would be restored without a password')}</p>
              : <KeyKitPicker t={t} onOpened={(k) => setKit(k)} />}
          </div>
        </li>

        <li>
          <p className="mb-1 text-sm font-semibold text-ink">{t('2. בדיקה (לא משנה כלום)', '2. Check (changes nothing)')}</p>
          <button className={btn} disabled={!file || !kit || busy} onClick={() => void dryRun()}>{t('בדוק את הקובץ', 'Check the file')}</button>
          {progress && <span className="ms-3 text-sm text-muted" role="status">{progress}</span>}
          {report && totals && (
            <div className="mt-3 grid gap-2 text-sm">
              <p>✅ {t('הקובץ פוענח ונמצא תקין ושלם.', 'The file was decrypted and is intact and complete.')} {t('נוצר', 'Created')}: {fmtDate(Date.parse(report.manifest.createdAt), lang)} · {report.manifest.kind} · {t('פרויקט', 'project')} {report.manifest.projectId}</p>
              <p>👤 {t(`משתמשים: ${report.auth.added} חדשים, ${report.auth.existing} קיימים${report.auth.emailChanged ? `, ${report.auth.emailChanged} עם דוא"ל שונה` : ''}`, `Logins: ${report.auth.added} new, ${report.auth.existing} existing${report.auth.emailChanged ? `, ${report.auth.emailChanged} with a different email` : ''}`)}</p>
              <p>🗂️ {t(`רשומות: ${totals.added} חסרות כיום, ${totals.changed} שונות, ${totals.same} זהות`, `Documents: ${totals.added} missing now, ${totals.changed} different, ${totals.same} identical`)}</p>
              <p>📎 {t(`קבצים בקובץ: ${report.files.inFile} (${report.files.missingLive} חסרים כיום)`, `Files in this file: ${report.files.inFile} (${report.files.missingLive} missing now)`)}
                {report.files.indexedMissingNotInFile > 0 && <span className="text-danger"> · {t(`${report.files.indexedMissingNotInFile} קבצים חסרים שאינם בקובץ הזה — שחזרו גם את הקובץ השבועי`, `${report.files.indexedMissingNotInFile} missing files are not in this file — also restore the weekly file`)}</span>}
              </p>
              {report.liveCollectionsNotInFile.length > 0 && <p className="text-xs text-muted">{t('אוספים שקיימים כיום ואינם בקובץ (בשחזור מלא יימחקו): ', 'Collections live now but not in the file (deleted in a full restore): ')}{report.liveCollectionsNotInFile.join(', ')}</p>}
              {report.journal && (
                <p>⚡ {t(`יומן אירועים: ${report.journal.events} אירועים אחרי הגיבוי (תמונת מצב מ-${fmtDate(Date.parse(report.journal.snapshotAt), lang)}), ${report.journal.docs} רשומות, ${report.journal.files} קבצים${report.journal.lastEventAt ? `; משחזר עד ${fmtDate(Date.parse(report.journal.lastEventAt), lang)}` : ''}`,
                  `Journal: ${report.journal.events} events after the backup (snapshot at ${fmtDate(Date.parse(report.journal.snapshotAt), lang)}), ${report.journal.docs} documents, ${report.journal.files} files${report.journal.lastEventAt ? `; restores up to ${fmtDate(Date.parse(report.journal.lastEventAt), lang)}` : ''}`)}</p>
              )}
              <p>⏱️ {t('זמן שחזור משוער', 'Estimated restore time')}: {fmtDuration(estimateRestoreMs(report.manifest), t)}</p>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted">{t('פירוט לפי אוסף', 'Per collection')}</summary>
                <table className="mt-1"><tbody>
                  {Object.entries(report.firestore).map(([c, v]) => <tr key={c}><td className="pe-3">{c}</td><td className="pe-3">+{v.added}</td><td className="pe-3">≠{v.changed}</td><td>={v.same}</td></tr>)}
                </tbody></table>
              </details>
              {report.manifest.warnings.map((w) => <p key={w} className="text-xs text-danger">⚠ {w}</p>)}
            </div>
          )}
        </li>

        {report && (
          <li>
            <p className="mb-1 text-sm font-semibold text-ink">{t('3. שחזור', '3. Restore')}</p>
            <fieldset className="grid gap-2 text-sm">
              <label className="flex items-start gap-2">
                <input type="radio" name="mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />
                <span><b>{t('השלמה', 'Merge')}</b> — {t('מוסיף רק מה שחסר (משתמשים, רשומות, קבצים). לא דורס שום מידע קיים. מומלץ ברוב המקרים.', 'adds only what is missing (logins, documents, files). Never overwrites existing data. Recommended in most cases.')}</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" name="mode" checked={mode === 'full'} onChange={() => setMode('full')} />
                <span><b>{t('שחזור מלא', 'Full restore')}</b> — {t('מחזיר את המערכת בדיוק למצב שבקובץ: מוחק את המידע הנוכחי וכותב את שבקובץ. חשבונות שלא בקובץ מושבתים. לאחר פריצה או השחתה.', 'returns the system exactly to the file: deletes current data and writes the file. Logins not in the file are disabled. After a breach or corruption.')}</span>
              </label>
              {mode === 'full' && (
                <label className="grid gap-1 text-xs text-muted">
                  {t(`להמשך הקלידו: ${FULL_CONFIRM}`, `To continue type: ${FULL_CONFIRM}`)}
                  <input className={`${input} w-48`} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
                </label>
              )}
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={grace} onChange={(e) => setGrace(e.target.checked)} />
                <span>{t('חסד השבתה: להוסיף לכל פרויקט פעיל את זמן ההשבתה כהשהיית שעון, להזיז מועדי הגשה פתוחים קדימה בהתאם, ולהשתיק תזכורות "באיחור" ל-24 שעות — כך שכולם ממשיכים כאילו לא קרה כלום.',
                  'Outage grace: add the outage to every active project as a clock pause, move open due dates forward by it, and silence "overdue" reminders for 24 hours — so everyone continues as if nothing happened.')}</span>
              </label>
              {grace && (
                <div className="flex flex-wrap gap-3 ps-6 text-xs text-muted">
                  <label className="grid gap-1">{t('ההשבתה התחילה', 'Outage started')}<input type="datetime-local" className={input} value={graceFrom} onChange={(e) => setGraceFrom(e.target.value)} /></label>
                  <label className="grid gap-1">{t('ההשבתה הסתיימה', 'Outage ended')}<input type="datetime-local" className={input} value={graceTo} onChange={(e) => setGraceTo(e.target.value)} /></label>
                </div>
              )}
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={revoke} onChange={(e) => setRevoke(e.target.checked)} />
                <span>{t('בסוף: לנתק את כל המשתמשים כדי שיתחברו מחדש (אותה סיסמה). מומלץ אחרי פריצה.', 'At the end: sign everyone out so they sign in again (same password). Recommended after a breach.')}</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={safetyOk} onChange={(e) => setSafetyOk(e.target.checked)} />
                <span>{t(`יש גיבוי של המצב הנוכחי לפני השחזור (אחרון מוצלח: ${fmtDate(status.lastSuccessAt, lang)}). אם לא — לחצו "גבה עכשיו" למעלה וחכו שיסתיים.`,
                  `There is a backup of the current state before restoring (last success: ${fmtDate(status.lastSuccessAt, lang)}). If not — press "Back up now" above and wait for it.`)}</span>
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1 text-xs text-muted">
                  {t('קוד מאפליקציית האימות', 'Authenticator code')}
                  <input className={`${input} w-28`} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
                </label>
                <button className={mode === 'full' ? 'rounded-lg bg-danger px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50' : btn} disabled={!canApply} onClick={() => void apply()}>
                  {mode === 'full' ? t('בצע שחזור מלא', 'Run full restore') : t('בצע השלמה', 'Run merge')}
                </button>
              </div>
            </fieldset>
          </li>
        )}
      </ol>

      {err && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{err}</p>}
      {log.length > 0 && (
        <div ref={logRef} className="mt-3 max-h-64 overflow-y-auto rounded-md bg-paper p-2 font-mono text-xs text-ink" role="log" aria-live="polite">
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
      {done && <p className="mt-2 text-sm text-success">{t('אפשר לבדוק עכשיו שמשתמש לדוגמה רואה את הפרויקט ואבן הדרך שלו כרגיל.', 'Now check that a sample user sees their project and milestone as usual.')}</p>}
    </section>
  );
}
