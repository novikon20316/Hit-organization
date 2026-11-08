'use client';

// app/supervisor/dashboard/CompareApplicantsModal.tsx
// Side-by-side view of the still-open applications to one project: when
// each applied, the AI recommendation and CV fit, every AI check lined up
// by row, the cover note, and the same transcript/CV links the cards show.
// Read-only and built only from what the supervisor's application cards
// already contain — decisions are still made on each card.

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModalA11y } from '@/hooks/useModalA11y';
import type { Application } from './types';
import { RECOMMENDATION_LABEL, RECOMMENDATION_STYLE, SCREENING_LABEL, SCREENING_STYLE } from './ApplicationCard';

/** Statuses where a decision is still to be made. */
export const OPEN_APPLICATION_STATUSES = new Set(['applied', 'meeting_requested', 'meeting_proposed', 'meeting_confirmed']);

function submittedLabel(v: Application['submittedAt'], lang: 'he' | 'en'): string {
  const ms = !v ? 0 : typeof v === 'object' ? v.seconds * 1000 : new Date(v).getTime();
  return ms ? new Date(ms).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short' }) : '—';
}

/** Projects with two or more open applications — only those are worth comparing. */
export function comparableProjects(applications: Application[]): Array<{ projectId: string; titleHe: string; titleEn: string; apps: Application[] }> {
  const byProject = new Map<string, Application[]>();
  for (const a of applications) {
    if (!OPEN_APPLICATION_STATUSES.has(a.status)) continue;
    (byProject.get(a.projectId) ?? byProject.set(a.projectId, []).get(a.projectId)!).push(a);
  }
  return [...byProject.entries()]
    .filter(([, apps]) => apps.length >= 2)
    .map(([projectId, apps]) => ({ projectId, titleHe: apps[0]!.projectTitleHe, titleEn: apps[0]!.projectTitleEn, apps }));
}

export function CompareApplicantsModal({ applications, onClose }: { applications: Application[]; onClose: () => void }) {
  const { lang } = useLanguage();
  const he = lang === 'he';
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);
  const projects = comparableProjects(applications);
  const [projectId, setProjectId] = useState(projects[0]?.projectId ?? '');
  const current = projects.find((p) => p.projectId === projectId) ?? projects[0];

  // Union of every check any applicant has, in first-seen order.
  const checkRows: Array<{ id: string; labelHe: string; labelEn: string }> = [];
  for (const a of current?.apps ?? []) {
    for (const c of a.aiReview?.checks ?? []) {
      if (!checkRows.some((r) => r.id === c.id)) checkRows.push({ id: c.id, labelHe: c.labelHe, labelEn: c.labelEn });
    }
  }

  const cell = 'border-b border-supervisor-outline-variant/60 px-3 py-2 align-top text-xs';
  const head = `${cell} sticky start-0 bg-supervisor-surface-container-lowest font-medium text-supervisor-on-surface-variant`;

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-black/40 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-applicants-title"
        className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-supervisor-lg bg-supervisor-surface-container-lowest shadow-lg outline-none"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-supervisor-outline-variant px-5 py-3">
          <h2 id="compare-applicants-title" className="text-base font-semibold text-supervisor-on-surface">⚖️ {he ? 'השוואת מועמדים' : 'Compare applicants'}</h2>
          <div className="flex items-center gap-2">
            {projects.length > 1 && (
              <select
                value={current?.projectId ?? ''}
                onChange={(e) => setProjectId(e.target.value)}
                aria-label={he ? 'פרויקט' : 'Project'}
                className="rounded-md border border-supervisor-outline-variant bg-supervisor-surface-container-low px-2 py-1 text-sm text-supervisor-on-surface"
              >
                {projects.map((p) => <option key={p.projectId} value={p.projectId}>{he ? p.titleHe : p.titleEn}</option>)}
              </select>
            )}
            <button type="button" onClick={onClose} aria-label={he ? 'סגור' : 'Close'} className="text-supervisor-on-surface-variant hover:text-supervisor-on-surface">✕</button>
          </div>
        </div>

        {!current ? (
          <p className="p-6 text-sm text-supervisor-on-surface-variant">{he ? 'אין פרויקט עם שתי מועמדויות פתוחות או יותר.' : 'No project has two or more open applications.'}</p>
        ) : (
          <div className="min-h-0 overflow-auto">
            <table className="w-full border-collapse text-start">
              <thead>
                <tr>
                  <th className={head} scope="col"><span className="sr-only">{he ? 'שדה' : 'Field'}</span></th>
                  {current.apps.map((a) => (
                    <th key={a.id} scope="col" className={`${cell} min-w-[11rem] text-sm font-semibold text-supervisor-on-surface`}>{a.studentName}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className={head}>{he ? 'הגיש/ה' : 'Applied'}</th>
                  {current.apps.map((a) => <td key={a.id} className={cell}>{submittedLabel(a.submittedAt, lang)}</td>)}
                </tr>
                <tr>
                  <th scope="row" className={head}>{he ? 'המלצת AI' : 'AI recommendation'}</th>
                  {current.apps.map((a) => (
                    <td key={a.id} className={cell}>
                      {a.aiReview ? (
                        <span className="rounded px-1.5 py-0.5 font-semibold" style={{ backgroundColor: RECOMMENDATION_STYLE[a.aiReview.recommendation]?.bg, color: RECOMMENDATION_STYLE[a.aiReview.recommendation]?.text }}>
                          {RECOMMENDATION_LABEL[a.aiReview.recommendation]?.[lang] ?? a.aiReview.recommendation}
                        </span>
                      ) : '—'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className={head}>{he ? 'התאמת קורות חיים' : 'CV fit'}</th>
                  {current.apps.map((a) => (
                    <td key={a.id} className={cell}>
                      {a.aiScreening ? (
                        <>
                          <span className="rounded px-1.5 py-0.5 font-semibold" style={{ backgroundColor: SCREENING_STYLE[a.aiScreening.verdict]?.bg, color: SCREENING_STYLE[a.aiScreening.verdict]?.text }}>
                            {SCREENING_LABEL[a.aiScreening.verdict]?.[lang] ?? a.aiScreening.verdict}
                          </span>
                          <span className="mt-1 block text-supervisor-on-surface-variant">{a.aiScreening.reasoning}</span>
                        </>
                      ) : '—'}
                    </td>
                  ))}
                </tr>
                {checkRows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row" className={head}>{he ? row.labelHe : row.labelEn}</th>
                    {current.apps.map((a) => {
                      const c = a.aiReview?.checks.find((x) => x.id === row.id);
                      return (
                        <td key={a.id} className={cell}>
                          {!c ? '—' : (
                            <>
                              <span className={`font-semibold ${c.passed === true ? 'text-success' : c.passed === false ? 'text-danger' : 'text-supervisor-on-surface-variant'}`}>
                                {c.passed === true ? (he ? '✓ עומד' : '✓ Pass') : c.passed === false ? (he ? '✕ לא עומד' : '✕ Fail') : (he ? '– לא ניתן להעריך' : '– Not assessed')}
                              </span>
                              <span className="mt-1 block text-supervisor-on-surface-variant">{c.reasoning}</span>
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <th scope="row" className={head}>{he ? 'מכתב פנייה' : 'Cover note'}</th>
                  {current.apps.map((a) => <td key={a.id} className={`${cell} whitespace-pre-wrap text-supervisor-on-surface`}>{a.coverNote || '—'}</td>)}
                </tr>
                <tr>
                  <th scope="row" className={head}>{he ? 'קבצים' : 'Files'}</th>
                  {current.apps.map((a) => (
                    <td key={a.id} className={cell}>
                      {a.transcriptUrl && <a href={a.transcriptUrl} target="_blank" rel="noopener noreferrer" className="block text-supervisor-primary hover:underline">📄 {he ? 'גיליון ציונים' : 'Transcript'}</a>}
                      {a.cvUrl && <a href={a.cvUrl} target="_blank" rel="noopener noreferrer" className="block text-supervisor-primary hover:underline">📄 {he ? 'קורות חיים' : 'CV'}</a>}
                      {!a.transcriptUrl && !a.cvUrl && '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
