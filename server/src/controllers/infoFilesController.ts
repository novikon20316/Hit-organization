// backend/controllers/infoFilesController.ts
import admin from 'firebase-admin';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import multer from 'multer';
import { RequestHandler } from 'express';
import { v2 as cloudinary } from 'cloudinary';

const db = admin.firestore();

// ── Multer setup (memory storage — same pattern as milestoneController) ───────
const upload = multer({ storage: multer.memoryStorage() });
export const uploadInfoFileMiddleware: RequestHandler = upload.single('file') as unknown as RequestHandler;

// ─── POST /api/admin/info-files ───────────────────────────────────────────────
// Admin/coordinator uploads a file + title; stored on Cloudinary, metadata in Firestore.
export const uploadInfoFile = async (req: AuthenticatedRequest, res: Response) => {
  const uploaderId = req.user?.uid;
  if (!uploaderId) return res.status(401).json({ message: 'Unauthorized.' });

  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    const { titleHe, titleEn } = req.body ?? {};

    if (!file) return res.status(400).json({ message: 'No file provided.' });
    if (!titleHe?.trim() && !titleEn?.trim()) {
      return res.status(400).json({ message: 'A title (Hebrew or English) is required.' });
    }

    const base64  = file.buffer.toString('base64');
    const dataUri = `data:${file.mimetype};base64,${base64}`;

    const result = await cloudinary.uploader.upload(dataUri, {
      resource_type: 'raw',
      folder: 'info-files',
    });

    const docRef = db.collection('infoFiles').doc();
    await docRef.set({
      titleHe:     titleHe ?? '',
      titleEn:     titleEn ?? '',
      fileUrl:     result.secure_url,
      fileName:    file.originalname,
      mimeType:    file.mimetype,
      uploadedBy:  uploaderId,
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({ success: true, id: docRef.id, fileUrl: result.secure_url });
  } catch (error: any) {
    console.error('uploadInfoFile error:', error);
    return res.status(500).json({ message: error.message || 'Failed to upload file.' });
  }
};

// ─── GET /api/info-files ───────────────────────────────────────────────────────
// Any authenticated user (e.g. students) can list info files.
export const getInfoFiles = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const snap = await db.collection('infoFiles').orderBy('createdAt', 'desc').get();
    const files = snap.docs.map((d) => {
      const data = d.data();
      return {
        id:        d.id,
        titleHe:   data.titleHe   ?? '',
        titleEn:   data.titleEn   ?? '',
        fileUrl:   data.fileUrl   ?? '',
        fileName:  data.fileName  ?? '',
        mimeType:  data.mimeType  ?? '',
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
      };
    });
    return res.status(200).json({ files });
  } catch (error: any) {
    console.error('getInfoFiles error:', error);
    return res.status(500).json({ message: 'Failed to load info files.' });
  }
};

// ─── DELETE /api/admin/info-files/:id ─────────────────────────────────────────
export const deleteInfoFile = async (req: AuthenticatedRequest, res: Response) => {
  const uploaderId = req.user?.uid;
  const { id } = req.params;
  if (!uploaderId) return res.status(401).json({ message: 'Unauthorized.' });
  if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Invalid file id.' });
  try {
    await db.collection('infoFiles').doc(id).delete();
    return res.status(200).json({ success: true, message: 'File deleted.' });
  } catch (error: any) {
    console.error('deleteInfoFile error:', error);
    return res.status(500).json({ message: 'Failed to delete file.' });
  }
};