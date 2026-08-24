// lib/fileClickPreview.ts
// Shared click-to-preview / double-click-to-download helpers for milestone
// submitted-file chips. Ported out of app/supervisor/dashboard/
// ProjectWorkflowSection.tsx (which keeps its own copy, since it already
// shipped and worked — not worth the regression risk of switching a live
// feature over) so the same interaction can be reused elsewhere (e.g. the
// administrative_coordinator dashboard) without a third hand-rolled copy.

import { useCallback, useRef } from 'react';

// Fetches the file into a Blob and saves it via a throwaway object-URL
// anchor — a plain <a download> is ignored by the browser for a
// cross-origin href (Cloudinary is a different origin), so without this a
// "download" link just opens the file in a new tab instead of actually
// saving it. Falls back to that same open-in-new-tab behavior if the fetch
// itself fails (e.g. a CORS-restricted resource) — still better than a dead
// click.
export async function downloadFile(url: string, fileName: string) {
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

// Derives a human-readable file name from a Cloudinary/Storage URL for chip
// labels and downloaded file names.
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

/**
 * Click-vs-double-click disambiguation for a list of file chips: a single
 * click fires `onSingle` (open a preview), a double click fires `onDouble`
 * (download) instead of both. One component-level ref keyed by a per-file
 * id, rather than per-chip state/hooks, since chips are usually created
 * inside nested .map()s where hooks-per-item isn't an option.
 */
export function useFileClickHandler() {
  const state = useRef<Record<string, { count: number; timer: ReturnType<typeof setTimeout> | null }>>({});
  return useCallback((key: string, onSingle: () => void, onDouble: () => void) => {
    const entry = state.current[key] ?? (state.current[key] = { count: 0, timer: null });
    entry.count += 1;
    if (entry.count === 1) {
      entry.timer = setTimeout(() => {
        if (entry.count === 1) onSingle();
        entry.count = 0;
      }, 250);
    } else {
      if (entry.timer) clearTimeout(entry.timer);
      entry.count = 0;
      onDouble();
    }
  }, []);
}
