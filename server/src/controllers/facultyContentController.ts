// src/controllers/facultyContentController.ts
//
// Spec (requirements doc section 15): "for each faculty, the system will
// contain the project/thesis procedures, guidance for students, as well as
// running announcements from the faculty or college project-coordination
// office." infoFilesController.ts already covers file attachments; this adds
// the free-text counterpart (procedures/guidance write-ups and short
// announcements) that isn't a file at all — same visibility-scoping
// convention (facultyIds/majors/degreeTypes, each empty = unrestricted).

import admin from 'firebase-admin';
import { Response } from 'express';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { VALID_MAJORS } from '../config/majors.js';

const db = admin.firestore();

// Mounted under both /api/admin/faculty-content and
// /api/coordinator/faculty-content — same convention as infoFilesController.
const FACULTY_CONTENT_ROLES = ['system_admin', 'coordinator'];

const VALID_FACULTY_IDS = new Set([
  'sciences', 'electrical', 'industrial', 'learning_tech', 'medical_tech', 'design', 'data_science',
]);
const VALID_DEGREE_TYPES = new Set(['bachelors', 'masters']);
const VALID_CONTENT_TYPES = new Set(['procedure', 'announcement']);

// Same helper as infoFilesController.ts's parseScopeArray, duplicated rather
// than imported — that one lives alongside multer/Cloudinary upload code
// this controller has no reason to depend on.
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

// ─── POST /api/admin/faculty-content, /api/coordinator/faculty-content ───────
export const createFacultyContent = async (req: AuthenticatedRequest, res: Response) => {
  const posterId = req.user?.uid;
  if (!posterId) return res.status(401).json({ message: 'Unauthorized.' });
  if (!req.user || !hasAnyRole(req.user, FACULTY_CONTENT_ROLES)) {
    return res.status(403).json({ message: 'Access denied.' });
  }

  try {
    const { type, titleHe, titleEn, bodyHe, bodyEn } = req.body ?? {};

    if (!VALID_CONTENT_TYPES.has(type)) {
      return res.status(400).json({ message: `type must be one of: ${[...VALID_CONTENT_TYPES].join(', ')}` });
    }
    if (!titleHe?.trim() && !titleEn?.trim()) {
      return res.status(400).json({ message: 'A title (Hebrew or English) is required.' });
    }
    if (!bodyHe?.trim() && !bodyEn?.trim()) {
      return res.status(400).json({ message: 'Body text (Hebrew or English) is required.' });
    }

    let facultyIds: string[], majors: string[], degreeTypes: string[];
    try {
      facultyIds  = parseScopeArray(req.body?.facultyIds, VALID_FACULTY_IDS, 'facultyIds');
      majors      = parseScopeArray(req.body?.majors, VALID_MAJORS, 'majors');
      degreeTypes = parseScopeArray(req.body?.degreeTypes, VALID_DEGREE_TYPES, 'degreeTypes');
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }

    const docRef = db.collection('facultyContent').doc();
    await docRef.set({
      type,
      titleHe: titleHe ?? '',
      titleEn: titleEn ?? '',
      bodyHe: bodyHe ?? '',
      bodyEn: bodyEn ?? '',
      postedBy: posterId,
      facultyIds,
      majors,
      degreeTypes,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({ success: true, id: docRef.id });
  } catch (error: any) {
    console.error('createFacultyContent error:', error);
    return res.status(500).json({ message: error.message || 'Failed to post content.' });
  }
};

// ─── GET /api/faculty-content ─────────────────────────────────────────────────
// Same visibility rule as getInfoFiles: staff see everything, students only
// see items whose scope (each empty axis = unrestricted) matches their own
// facultyId/major/degreeType.
export const getFacultyContent = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const snap = await db.collection('facultyContent').orderBy('createdAt', 'desc').get();
    let items = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        type: data.type ?? 'announcement',
        titleHe: data.titleHe ?? '',
        titleEn: data.titleEn ?? '',
        bodyHe: data.bodyHe ?? '',
        bodyEn: data.bodyEn ?? '',
        facultyIds: data.facultyIds ?? [],
        majors: data.majors ?? [],
        degreeTypes: data.degreeTypes ?? [],
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
      };
    });

    if (req.user?.role === 'student') {
      const studentSnap = await db.collection('users').doc(req.user.uid).get();
      const student = studentSnap.data() ?? {};
      items = items.filter((f) =>
        (f.facultyIds.length === 0  || f.facultyIds.includes(req.user!.facultyId)) &&
        (f.majors.length === 0      || f.majors.includes(student.major)) &&
        (f.degreeTypes.length === 0 || f.degreeTypes.includes(student.degreeType))
      );
    }

    return res.status(200).json({ items });
  } catch (error: any) {
    console.error('getFacultyContent error:', error);
    return res.status(500).json({ message: 'Failed to load faculty content.' });
  }
};

// ─── DELETE /api/admin/faculty-content/:id, /api/coordinator/faculty-content/:id ─
export const deleteFacultyContent = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const { id } = req.params;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  if (!req.user || !hasAnyRole(req.user, FACULTY_CONTENT_ROLES)) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Invalid content id.' });
  try {
    await db.collection('facultyContent').doc(id).delete();
    return res.status(200).json({ success: true, message: 'Content deleted.' });
  } catch (error: any) {
    console.error('deleteFacultyContent error:', error);
    return res.status(500).json({ message: 'Failed to delete content.' });
  }
};
