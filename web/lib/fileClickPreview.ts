// lib/fileClickPreview.ts
// Shared file-chip helpers for milestone submitted files: preview a file
// inline and download it, as two distinct, explicit actions (see
// components/MilestoneFilePanel.tsx and its callers) rather than a
// click-vs-double-click gesture — a coordinator's actual need is to look at
// the file, and a slow/misfired double-click could otherwise download it by
// accident when all she wanted was to preview it.

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
