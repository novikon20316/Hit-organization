'use client';

// app/student/home/SubmissionHistory.tsx
// S2 — every earlier version of a milestone submission, with what was
// decided on it and what changed from the version before. Shows only what
// the student already saw on each round (decided 2026-11-08): the return
// reason, and the supervisor's review as the milestone itself showed it
// (server/src/services/milestoneRevisions.ts snapshots it per version).

import { useLanguage } from '@/contexts/LanguageContext';
import { downloadFile } from '@/lib/fileClickPreview';
import type { MilestoneRevision } from './types';

// File URLs carry no separate filename field — derive a human-readable one
// from the URL itself, same approach as components/MilestoneTimeline.tsx.
export function fileNameFromUrl(url: string, index: number, lang: 'he' | 'en'): string {
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    const last = path.split('/').filter(Boolean).pop();
    if (last) return last;
  } catch {
    // fall through to generic label below
  }
  return lang === 'he' ? `קובץ ${index + 1}` : `File ${index + 1}`;
}

interface Version {
  fileUrls: string[];
  submissionNote: string;
}

function changesBetween(prev: Version, next: Version, lang: 'he' | 'en'): string[] {
  const he = lang === 'he';
  const byName = (v: Version) => new Map(v.fileUrls.map((u, i) => [fileNameFromUrl(u, i, lang), u]));
  const before = byName(prev);
  const after = byName(next);
  const added = [...after.keys()].filter((n) => !before.has(n));
  const removed = [...before.keys()].filter((n) => !after.has(n));
  const out: string[] = [];
  if (added.length) out.push(`${he ? 'נוסף' : 'Added'}: ${added.join(', ')}`);
  if (removed.length) out.push(`${he ? 'הוסר' : 'Removed'}: ${removed.join(', ')}`);
  // Same file name, new upload — usually the fixed file sent again.
  const replaced = [...after.keys()].filter((n) => before.has(n) && before.get(n) !== after.get(n));
  if (replaced.length) out.push(`${he ? 'הועלה מחדש' : 'Re-uploaded'}: ${replaced.join(', ')}`);
  if ((prev.submissionNote ?? '').trim() !== (next.submissionNote ?? '').trim()) out.push(he ? 'הערת ההגשה השתנתה' : 'Submission note changed');
  return out;
}

const fmt = (iso: string | null, lang: 'he' | 'en') =>
  iso ? new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export function SubmissionHistory({ history, current }: { history: MilestoneRevision[]; current: Version & { submittedAt: string | null } }) {
  const { lang } = useLanguage();
  const he = lang === 'he';
  const sorted = [...history].sort((a, b) => a.version - b.version);
  const latest = sorted[sorted.length - 1];
  const currentChanges = latest && current.submittedAt ? changesBetween(latest, current, lang) : [];

  const fileButtons = (urls: string[]) => urls.length > 0 && (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {urls.map((url, i) => (
        <button
          key={url}
          type="button"
          onClick={() => downloadFile(url, fileNameFromUrl(url, i, lang))}
          className="rounded-student border border-student-outline-variant bg-student-surface-container-lowest px-2 py-0.5 text-[11px] font-medium text-student-primary hover:underline"
        >
          📥 {fileNameFromUrl(url, i, lang)}
        </button>
      ))}
    </div>
  );

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-medium text-student-on-surface-variant hover:text-student-on-surface">
        {he ? `🕘 היסטוריית הגשות (${history.length})` : `🕘 Submission History (${history.length})`}
      </summary>
      <div className="mt-1.5 grid gap-1.5">
        {currentChanges.length > 0 && (
          <div className="rounded-student border border-student-primary/30 bg-student-primary/5 p-2 text-xs text-student-on-surface">
            <span className="font-semibold">{he ? `ההגשה הנוכחית לעומת גרסה ${latest.version}:` : `Current submission vs version ${latest.version}:`}</span>
            <ul className="mt-0.5 list-disc ps-4">{currentChanges.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        )}
        {[...sorted].reverse().map((rev) => {
          const prev = sorted.find((v) => v.version === rev.version - 1);
          const changes = prev ? changesBetween(prev, rev, lang) : [];
          const fb = rev.supervisorFeedback;
          return (
            <div key={rev.version} className="rounded-student border border-student-outline-variant bg-student-surface-container-low p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-student-on-surface">
                  {he ? `גרסה ${rev.version}` : `Version ${rev.version}`}
                  {rev.submittedAt && <span className="ms-1.5 font-normal text-student-on-surface-variant">· {fmt(rev.submittedAt, lang)}</span>}
                </span>
                {rev.decision === 'rejected' && (
                  <span className="rounded-full bg-danger-bg px-2 py-0.5 text-[10px] font-medium text-danger">{he ? '↩️ הוחזרה לתיקון' : '↩️ Returned'}</span>
                )}
                {rev.decision === 'approved' && (
                  <span className="rounded-full bg-success-bg px-2 py-0.5 text-[10px] font-medium text-success">{he ? '✅ אושרה' : '✅ Approved'}</span>
                )}
              </div>
              {fileButtons(rev.fileUrls)}
              {rev.submissionNote && <p className="mt-1 whitespace-pre-wrap text-xs text-student-on-surface-variant">{rev.submissionNote}</p>}
              {rev.decisionReason && <p className="mt-1 whitespace-pre-wrap text-xs text-danger">{rev.decisionReason}</p>}
              {fb && (fb.comment || fb.fileUrls.length > 0) && (
                <div className="mt-1.5 rounded-student bg-student-surface-container-lowest p-1.5">
                  <p className="text-[11px] font-semibold text-student-on-surface">{he ? 'הערות המנחה:' : "Supervisor's comments:"}</p>
                  {fb.comment && <p className="whitespace-pre-wrap text-xs text-student-on-surface-variant">{fb.comment}</p>}
                  {fileButtons(fb.fileUrls)}
                </div>
              )}
              {changes.length > 0 && (
                <p className="mt-1 text-[11px] text-student-on-surface-variant">
                  {he ? `לעומת גרסה ${prev!.version}: ` : `vs version ${prev!.version}: `}{changes.join(' · ')}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}
