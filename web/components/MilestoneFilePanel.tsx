'use client';

// components/MilestoneFilePanel.tsx
// Side panel opened by clicking a milestone/file chip — shows the student's
// submission note plus an inline preview (iframe; the browser renders
// PDFs/images natively, other types just show blank until downloaded) and a
// download link for each submitted file. Originally lived under
// app/supervisor/dashboard/ (its first caller); moved here once the
// administrative_coordinator dashboard needed the same panel — it never had
// any supervisor-specific dependency. FilePreviewFrame is exported too —
// GradeMilestoneModal.tsx and ProjectWorkflowSection.tsx's research_proposal
// sign-off both embed it directly inline (next to the grading/signing
// action itself) rather than opening this side panel, so grading/signing
// never requires leaving the document to go find the action.

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { downloadFile, fileNameFromUrl } from '@/lib/fileClickPreview';
import { useModalA11y } from '@/hooks/useModalA11y';

interface MilestoneFilePanelProps {
  title: string;
  subtitle: string;
  submissionNote: string;
  fileUrls: string[];
  onClose: () => void;
}

// Cloudinary's 'raw' resource type historically left the delivery URL
// without a file extension (fixed going forward in milestoneController.ts's
// upload call, but already-submitted files predate that fix) — with no
// extension, Cloudinary can't return a useful Content-Type, so pointing an
// <iframe> straight at the URL makes the browser treat it as an opaque
// download instead of rendering it. Guessing from the URL's own extension
// (when it has one) lets already-uploaded files still preview correctly.
function guessMimeFromUrl(url: string): string | null {
  const path = url.split('?')[0].toLowerCase();
  if (path.endsWith('.pdf')) return 'application/pdf';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.gif')) return 'image/gif';
  return null;
}

// Fetches the file into a Blob (same approach as downloadFile — Cloudinary
// is cross-origin, and a plain <iframe src> hitting a URL with no/unhelpful
// Content-Type triggers the browser's download handling instead of an
// inline render) and renders it from a local object URL instead, re-tagging
// the blob's type from the URL when the server's own type isn't a
// renderable one. A local object URL never carries a Content-Disposition,
// so at worst an unrenderable type just shows blank — it can no longer
// force a download the way navigating to the real URL did.
export function FilePreviewFrame({ url, index }: { url: string; index: number }) {
  const { lang } = useLanguage();
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; objectUrl?: string }>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    fetch(url)
      .then((res) => res.blob())
      .then((blob) => {
        if (cancelled) return;
        const type = /^(application\/pdf|image\/)/.test(blob.type) ? blob.type : (guessMimeFromUrl(url) ?? blob.type);
        const typedBlob = type === blob.type ? blob : new Blob([blob], { type });
        objectUrl = URL.createObjectURL(typedBlob);
        setState({ status: 'ready', objectUrl });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (state.status === 'loading') {
    return (
      <div className="flex h-96 w-full items-center justify-center bg-white text-xs text-muted">
        {lang === 'he' ? 'טוען תצוגה מקדימה…' : 'Loading preview…'}
      </div>
    );
  }
  if (state.status === 'error' || !state.objectUrl) {
    return (
      <div className="flex h-40 w-full items-center justify-center bg-white text-xs text-muted">
        {lang === 'he' ? 'לא ניתן לטעון תצוגה מקדימה — נסו להוריד את הקובץ' : 'Could not load a preview — try downloading the file'}
      </div>
    );
  }
  return <iframe src={state.objectUrl} title={`file-${index}`} className="h-96 w-full bg-white" />;
}

export function MilestoneFilePanel({ title, subtitle, submissionNote, fileUrls, onClose }: MilestoneFilePanelProps) {
  const { lang } = useLanguage();
  const panelRef = useRef<HTMLDivElement>(null);
  useModalA11y(panelRef, true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="milestone-file-panel-title"
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-surface p-5 shadow-lg outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id="milestone-file-panel-title" className="truncate text-base font-semibold text-ink">{title}</h2>
            <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="shrink-0 text-muted hover:text-ink">
            ✕
          </button>
        </div>

        {submissionNote && <p className="mt-3 rounded-lg bg-paper p-3 text-sm text-ink">💬 {submissionNote}</p>}

        <div className="mt-4 grid gap-4">
          {fileUrls.map((url, i) => (
            <div key={i} className="overflow-hidden rounded-lg border border-line">
              <div className="flex items-center justify-between border-b border-line bg-paper px-3 py-2">
                <span className="text-xs font-medium text-ink">
                  📄 {lang === 'he' ? `קובץ ${i + 1}` : `File ${i + 1}`}
                </span>
                <button
                  type="button"
                  onClick={() => downloadFile(url, fileNameFromUrl(url, i, lang))}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  📥 {lang === 'he' ? 'הורדה' : 'Download'}
                </button>
              </div>
              <FilePreviewFrame key={url} url={url} index={i} />
            </div>
          ))}
          {fileUrls.length === 0 && (
            <p className="text-sm text-muted">{lang === 'he' ? 'לא הוגשו קבצים' : 'No files submitted'}</p>
          )}
        </div>
      </div>
    </div>
  );
}
