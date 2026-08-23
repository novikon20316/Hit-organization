'use client';

// app/supervisor/dashboard/MilestoneFilePanel.tsx
// Side panel opened by clicking a milestone name in ProjectWorkflowSection —
// shows the student's submission note plus an inline preview (iframe; the
// browser renders PDFs/images natively, other types just show blank until
// downloaded) and a download link for each submitted file.

import { useLanguage } from '@/contexts/LanguageContext';

interface MilestoneFilePanelProps {
  title: string;
  subtitle: string;
  submissionNote: string;
  fileUrls: string[];
  onClose: () => void;
}

// A plain <a download> is ignored by the browser for a cross-origin href
// (Cloudinary is a different origin), so without this the "Download" link
// below just opened the file in a new tab instead of actually saving it —
// misleading for the PDFs/images the iframe already renders inline. Same
// helper as ProjectWorkflowSection.tsx's downloadFile.
async function downloadFile(url: string, fileName: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function fileNameFromUrl(url: string, index: number, lang: 'he' | 'en'): string {
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    const last = path.split('/').filter(Boolean).pop();
    if (last) return last;
  } catch {
    // fall through to generic label below
  }
  return lang === 'he' ? `קובץ ${index + 1}` : `File ${index + 1}`;
}

export function MilestoneFilePanel({ title, subtitle, submissionNote, fileUrls, onClose }: MilestoneFilePanelProps) {
  const { lang } = useLanguage();

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-surface p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
            <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-muted hover:text-ink">
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
              <iframe src={url} title={`file-${i}`} className="h-96 w-full bg-white" />
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
