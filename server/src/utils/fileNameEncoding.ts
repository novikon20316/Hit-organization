// src/utils/fileNameEncoding.ts
//
// multer/busboy decode a multipart upload's filename header as latin1 (per
// the multipart spec's historical ASCII-only assumption), even though every
// browser actually sends it UTF-8-encoded — so a non-ASCII (e.g. Hebrew)
// original filename comes back on `file.originalname` as mojibake, not the
// real name. This re-decodes those mis-interpreted bytes back to the
// correct UTF-8 string. A pure-ASCII filename round-trips unchanged either
// way, so this is always safe to apply, not just for non-Latin names.
//
// Confirmed as the cause of a real report: a staff notification's "קבצים:"
// (Files:) line showed garbled characters instead of a Hebrew filename like
// "הצעת מחקר 17.8.docx" — see milestoneController.ts's submittedFileNames.
export function fixMulterFilenameEncoding(originalname: string): string {
  return Buffer.from(originalname, 'latin1').toString('utf8');
}
