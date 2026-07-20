// backend/controllers/infoFilesController.ts
import admin from 'firebase-admin';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import multer from 'multer';
import { RequestHandler } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { VALID_MAJORS } from '../config/majors.js';

const db = admin.firestore();

// Mounted under both /api/admin/info-files and /api/coordinator/info-files —
// gate to exactly those two roles rather than trusting verifyToken alone.
const INFO_FILE_ROLES = ['system_admin', 'coordinator'];

const VALID_FACULTY_IDS = new Set([
  'sciences', 'electrical', 'industrial', 'learning_tech', 'medical_tech', 'design', 'data_science',
]);
const VALID_DEGREE_TYPES = new Set(['bachelors', 'masters']);

// Empty/omitted array on any of these three fields means "unrestricted" for
// that axis — matches the convention already established for project.major
// in supervisorController.ts/applicationController.ts, so a file uploaded
// before this feature existed (all three fields absent) stays visible to
// everyone, not silently hidden.
function parseScopeArray(raw: unknown, validValues: Set<string>, label: string): string[] {
  if (raw === undefined || raw === null || raw === '') return [];
  let parsed: unknown;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new Error(`${label} must be a JSON array.`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${label} must be an array.`);
  const invalid = parsed.filter((v) => typeof v !== 'string' || !validValues.has(v));
  if (invalid.length > 0) throw new Error(`Invalid ${label}: ${invalid.join(', ')}`);
  return parsed as string[];
}

// ── Multer setup (memory storage — same pattern as milestoneController) ───────
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_MIME_TYPES.has(file.mimetype));
  },
});
export const uploadInfoFileMiddleware: RequestHandler = upload.single('file') as unknown as RequestHandler;

// ─── POST /api/admin/info-files ───────────────────────────────────────────────
// Admin/coordinator uploads a file + title; stored on Cloudinary, metadata in Firestore.
export const uploadInfoFile = async (req: AuthenticatedRequest, res: Response) => {
  const uploaderId = req.user?.uid;
  if (!uploaderId) return res.status(401).json({ message: 'Unauthorized.' });
  if (!req.user?.role || !INFO_FILE_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied.' });
  }

  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    const { titleHe, titleEn } = req.body ?? {};

    if (!file) return res.status(400).json({ message: 'No file provided.' });
    if (!titleHe?.trim() && !titleEn?.trim()) {
      return res.status(400).json({ message: 'A title (Hebrew or English) is required.' });
    }

    // Each empty/omitted = unrestricted for that axis; a student must match
    // ALL three (facultyIds, majors, degreeTypes) that are non-empty to see
    // this file — enforced in getInfoFiles below.
    let facultyIds: string[], majors: string[], degreeTypes: string[];
    try {
      facultyIds  = parseScopeArray(req.body?.facultyIds, VALID_FACULTY_IDS, 'facultyIds');
      majors      = parseScopeArray(req.body?.majors, VALID_MAJORS, 'majors');
      degreeTypes = parseScopeArray(req.body?.degreeTypes, VALID_DEGREE_TYPES, 'degreeTypes');
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
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
      facultyIds,
      majors,
      degreeTypes,
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({ success: true, id: docRef.id, fileUrl: result.secure_url });
  } catch (error: any) {
    console.error('uploadInfoFile error:', error);
    return res.status(500).json({ message: error.message || 'Failed to upload file.' });
  }
};

// ─── GET /api/info-files ───────────────────────────────────────────────────────
// Any authenticated user can list info files — staff (system_admin/coordinator,
// who manage these) always see every file unfiltered; students only see files
// whose facultyIds/majors/degreeTypes (each empty = unrestricted for that axis)
// all match their own facultyId/major/degreeType.
export const getInfoFiles = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const snap = await db.collection('infoFiles').orderBy('createdAt', 'desc').get();
    let files = snap.docs.map((d) => {
      const data = d.data();
      return {
        id:          d.id,
        titleHe:     data.titleHe     ?? '',
        titleEn:     data.titleEn     ?? '',
        fileUrl:     data.fileUrl     ?? '',
        fileName:    data.fileName    ?? '',
        mimeType:    data.mimeType    ?? '',
        facultyIds:  data.facultyIds  ?? [],
        majors:      data.majors      ?? [],
        degreeTypes: data.degreeTypes ?? [],
        createdAt:   data.createdAt?.toDate?.()?.toISOString() ?? null,
      };
    });

    if (req.user?.role === 'student') {
      const studentSnap = await db.collection('users').doc(req.user.uid).get();
      const student = studentSnap.data() ?? {};
      files = files.filter((f) =>
        (f.facultyIds.length === 0  || f.facultyIds.includes(req.user!.facultyId)) &&
        (f.majors.length === 0      || f.majors.includes(student.major)) &&
        (f.degreeTypes.length === 0 || f.degreeTypes.includes(student.degreeType))
      );
    }

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
  if (!req.user?.role || !INFO_FILE_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Invalid file id.' });
  try {
    await db.collection('infoFiles').doc(id).delete();
    return res.status(200).json({ success: true, message: 'File deleted.' });
  } catch (error: any) {
    console.error('deleteInfoFile error:', error);
    return res.status(500).json({ message: 'Failed to delete file.' });
  }
};