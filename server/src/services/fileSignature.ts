// src/services/fileSignature.ts
//
// Multer's own fileFilter only ever sees the client-DECLARED Content-Type
// header for a multipart field, before any of the file's actual bytes have
// been read — trivially spoofable by a raw HTTP client (declare image/png,
// upload an HTML/SVG payload). This checks the uploaded buffer's real
// leading bytes against a known signature for the mimetype multer already
// accepted. Must run AFTER multer has populated req.file(s).buffer, not
// inside fileFilter itself (the buffer doesn't exist yet at that point) —
// see verifyFileSignatures below, mounted as its own middleware right after
// uploadMiddleware/handleUploadError in each route that accepts a file.

import type { Request, Response, NextFunction } from 'express';

interface Signature {
  bytes: number[];
  offset?: number;
}

// Covers exactly the fixed, small set of mimetypes this app's three upload
// endpoints accept (see MILESTONE_FILE_TYPES in workflowTemplates.ts,
// applicationController.ts's PDF-only filter, and chatController.ts's
// ALLOWED_CHAT_IMAGE_MIME_TYPES). A mimetype with no entry here is allowed
// through unchecked rather than blocked — fail open for anything this list
// hasn't been taught yet, rather than breaking a legitimate upload.
const SIGNATURES: Record<string, Signature[]> = {
  'application/pdf': [{ bytes: [0x25, 0x50, 0x44, 0x46] }], // %PDF
  'image/png': [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  'image/jpeg': [{ bytes: [0xff, 0xd8, 0xff] }],
  'image/gif': [{ bytes: [0x47, 0x49, 0x46, 0x38] }], // GIF8[7a|9a]
  'image/webp': [{ bytes: [0x52, 0x49, 0x46, 0x46] }, { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }], // RIFF....WEBP
  // .docx/.pptx/.zip are all ZIP containers — same signature for all three.
  'application/zip': [{ bytes: [0x50, 0x4b, 0x03, 0x04] }, { bytes: [0x50, 0x4b, 0x05, 0x06] }],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [{ bytes: [0x50, 0x4b, 0x03, 0x04] }],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [{ bytes: [0x50, 0x4b, 0x03, 0x04] }],
  // Legacy .doc/.ppt — both OLE2/CFBF containers, same signature.
  'application/msword': [{ bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }],
  'application/vnd.ms-powerpoint': [{ bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }],
};

function matchesOneSignature(buffer: Buffer, sig: Signature): boolean {
  const offset = sig.offset ?? 0;
  if (buffer.length < offset + sig.bytes.length) return false;
  return sig.bytes.every((b, i) => buffer[offset + i] === b);
}

export function matchesFileSignature(buffer: Buffer, mimetype: string): boolean {
  const sigs = SIGNATURES[mimetype];
  if (!sigs) return true;
  return sigs.some((sig) => matchesOneSignature(buffer, sig));
}

/** Express middleware — rejects with 400 if any uploaded file's real bytes
 *  don't match the signature for the mimetype multer accepted it under.
 *  Handles both `.array(...)` (req.files) and `.single(...)` (req.file). */
export function verifyFileSignatures(req: Request, res: Response, next: NextFunction) {
  const files: Express.Multer.File[] =
    (req.files as Express.Multer.File[] | undefined) ??
    (req.file ? [req.file] : []);

  for (const file of files) {
    if (!matchesFileSignature(file.buffer, file.mimetype)) {
      return res.status(400).json({
        message: `File content doesn't match its declared type: ${file.originalname}`,
        messageHe: `תוכן הקובץ אינו תואם לסוג המוצהר: ${file.originalname}`,
        messageEn: `File content doesn't match its declared type: ${file.originalname}`,
      });
    }
  }
  next();
}
