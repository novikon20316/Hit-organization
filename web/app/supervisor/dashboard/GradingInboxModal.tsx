'use client';

// app/supervisor/dashboard/GradingInboxModal.tsx
// "See all" from the Quick Tasks panel: every submission waiting for this
// supervisor's grade, across all projects, oldest first, with the selected
// one's files previewed beside the list. Grading itself still goes through
// the dashboard's GradeMilestoneModal (onGrade) — this is a view onto the
// same pendingGrades list, not a new tab (the separate Grading tab was
// removed on purpose; grading also stays available inline per project).

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModalA11y } from '@/hooks/useModalA11y';
import { FilePreviewFrame } from '@/components/MilestoneFilePanel';
import { downloadFile, fileNameFromUrl } from '@/lib/fileClickPreview';
import { milestoneDisplayName } from '@/lib/milestoneLabel';
import { MILESTONE_LABEL, type SupervisorPendingMilestone } from './types';

function toMs(v: unknown): number {
  if (!v) return 0;
  if (typeof v === 'object' && v !== null && 'seconds' in v) return Number((v as { seconds: number }).seconds) * 1000;
  const t = new Date(v as string).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function waitingDays(submittedAt: unknown): number | null {
  const ms = toMs(submittedAt);
  return ms ? Math.max(0, Math.floor((Date.now() - ms) / 86_400_000)) : null;
}

interface GradingInboxModalProps {
  pendingGrades: SupervisorPendingMilestone[];
  onGrade: (milestone: SupervisorPendingMilestone) => void;
  onClose: () => void;
}

export function GradingInboxModal({ pendingGrades, onGrade, onClose }: GradingInboxModalProps) {
  const { lang } = useLanguage();
  const he = lang === 'he';
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);

  const items = pendingGrades.slice().sort((a, b) => toMs(a.submittedAt) - toMs(b.submittedAt));
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const selected = items.find((m) => m.id === selectedId) ?? items[0] ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-black/40 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="grading-inbox-title"
        className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-supervisor-lg bg-supervisor-surface-container-lowest shadow-lg outline-none"
      >
        <div className="flex items-center justify-between border-b border-supervisor-outline-variant px-5 py-3">
          <h2 id="grading-inbox-title" className="text-base font-semibold text-supervisor-on-surface">
            ✏️ {he ? `ממתינות לציון (${items.length})` : `Waiting for your grade (${items.length})`}
          </h2>
          <button type="button" onClick={onClose} aria-label={he ? 'סגור' : 'Close'} className="text-supervisor-on-surface-variant hover:text-supervisor-on-surface">✕</button>
        </div>

        {items.length === 0 ? (
          <p className="p-6 text-sm text-supervisor-on-surface-variant">✅ {he ? 'אין הגשות שממתינות לציון שלך.' : 'Nothing is waiting for your grade.'}</p>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[18rem_1fr]">
            <ul className="min-h-0 overflow-y-auto border-b border-supervisor-outline-variant md:border-b-0 md:border-e" aria-label={he ? 'רשימת הגשות' : 'Submissions'}>
              {items.map((m) => {
                const days = waitingDays(m.submittedAt);
                const active = selected?.id === m.id;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(m.id)}
                      aria-current={active ? 'true' : undefined}
                      className={`w-full border-b border-supervisor-outline-variant/60 px-4 py-3 text-start ${active ? 'bg-supervisor-surface-container-low' : 'hover:bg-supervisor-surface-container-low/60'}`}
                    >
                      <p className="truncate text-sm font-medium text-supervisor-on-surface">{milestoneDisplayName(m, lang, MILESTONE_LABEL)}</p>
                      <p className="truncate text-xs text-supervisor-on-surface-variant">{he ? m.projectTitleHe : m.projectTitleEn}</p>
                      <p className="truncate text-xs text-supervisor-on-surface-variant">👤 {m.studentNames.join(', ')}</p>
                      {days !== null && (
                        <p className={`mt-0.5 text-[11px] font-semibold ${days >= 7 ? 'text-danger' : 'text-supervisor-on-surface-variant'}`}>
                          {he ? `ממתין ${days} ימים` : `Waiting ${days} days`}
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {selected && (
              <div className="flex min-h-0 flex-col overflow-y-auto p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-supervisor-on-surface">{milestoneDisplayName(selected, lang, MILESTONE_LABEL)}</p>
                    <p className="text-xs text-supervisor-on-surface-variant">{he ? selected.projectTitleHe : selected.projectTitleEn} · {selected.studentNames.join(', ')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onGrade(selected)}
                    className="rounded-lg bg-supervisor-primary px-3.5 py-2 text-sm font-semibold text-supervisor-on-primary hover:opacity-90"
                  >
                    ✏️ {he ? 'תן ציון' : 'Grade'}
                  </button>
                </div>
                {selected.submissionNote && (
                  <p className="mt-3 whitespace-pre-wrap rounded-md bg-supervisor-surface-container-low p-3 text-sm text-supervisor-on-surface">{selected.submissionNote}</p>
                )}
                {selected.fileUrls.length === 0 ? (
                  <p className="mt-3 text-sm text-supervisor-on-surface-variant">{he ? 'לא צורפו קבצים להגשה זו.' : 'No files were attached to this submission.'}</p>
                ) : (
                  selected.fileUrls.map((url, i) => (
                    <div key={url} className="mt-3 overflow-hidden rounded-md border border-supervisor-outline-variant">
                      <div className="flex items-center justify-between gap-2 bg-supervisor-surface-container-low px-3 py-1.5">
                        <span className="truncate text-xs text-supervisor-on-surface">📎 {fileNameFromUrl(url, i, lang)}</span>
                        <button type="button" onClick={() => downloadFile(url, fileNameFromUrl(url, i, lang))} className="shrink-0 text-xs font-medium text-supervisor-primary hover:underline">
                          {he ? 'הורדה' : 'Download'}
                        </button>
                      </div>
                      <FilePreviewFrame key={url} url={url} index={i} />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
