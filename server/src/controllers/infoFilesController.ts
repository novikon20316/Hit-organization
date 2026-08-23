// backend/controllers/infoFilesController.ts
import admin from 'firebase-admin';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import multer from 'multer';
import { RequestHandler } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { VALID_MAJORS } from '../config/majors.js';
import { resolveMilestoneOrder } from '../services/workflowTemplates.js';

const db = admin.firestore();

// Mounted under /api/admin/info-files — gate to these roles rather than
// trusting verifyToken alone. 'supervisor' can only ever use project-scoped
// mode (see uploadInfoFile) — they have no faculty-wide authority.
const INFO_FILE_ROLES = ['system_admin', 'coordinator', 'supervisor'];

// Mirrors the same-named const duplicated in supervisorController.ts/
// projectCoordinatorController.ts — not exported from either, so redefined
// here rather than importing across an unrelated controller.
const DONE_MILESTONE_STATUSES = new Set(['coordinator_approved', 'completed']);

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

// Project ids are arbitrary Firestore doc ids, not a fixed valid-set — only
// shape-checked here; ownership is verified separately (verifySupervisorOwnsProjects).
function parseProjectIds(raw: unknown): string[] {
  if (raw === undefined || raw === null || raw === '') return [];
  let parsed: unknown;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new Error('projectIds must be a JSON array.');
  }
  if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== 'string' || !v.trim())) {
    throw new Error('projectIds must be an array of non-empty strings.');
  }
  return parsed as string[];
}

// A supervisor may only attach/edit/delete a file scoped to a project they
// actually run (primary or secondary) — coordinator/system_admin stay
// unrestricted, matching this controller's existing (already-unscoped)
// behavior for faculty-wide mode.
async function verifySupervisorOwnsProjects(supervisorId: string, projectIds: string[]): Promise<boolean> {
  if (projectIds.length === 0) return false;
  const snaps = await Promise.all(projectIds.map((id) => db.collection('projects').doc(id).get()));
  return snaps.every((snap) => {
    if (!snap.exists) return false;
    const data = snap.data()!;
    return data.supervisorId === supervisorId || data.secondarySupervisorId === supervisorId;
  });
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
  const role = req.user?.role;
  if (!uploaderId || !role) return res.status(401).json({ message: 'Unauthorized.' });
  if (!INFO_FILE_ROLES.includes(role)) {
    return res.status(403).json({ message: 'Access denied.' });
  }

  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    const { titleHe, titleEn } = req.body ?? {};

    if (!file) return res.status(400).json({ message: 'No file provided.' });
    if (!titleHe?.trim() && !titleEn?.trim()) {
      return res.status(400).json({ message: 'A title (Hebrew or English) is required.' });
    }

    let projectIds: string[];
    try {
      projectIds = parseProjectIds(req.body?.projectIds);
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }
    // A milestone type key matching one of the target project(s)' own
    // milestone docs — not validated against a fixed set here since custom
    // template milestone types are arbitrary strings (see workflowTemplates.ts).
    // Omitted/empty means "visible as soon as the student is enrolled."
    const milestoneType: string | null =
      typeof req.body?.milestoneType === 'string' && req.body.milestoneType.trim() ? req.body.milestoneType.trim() : null;
    // multipart fields always arrive as strings — 'false' must not become
    // truthy. Omitted defaults to visible.
    const isVisible = req.body?.isVisible === undefined ? true : req.body.isVisible === 'true' || req.body.isVisible === true;

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

    if (projectIds.length > 0) {
      // Project-scoped mode is mutually exclusive with faculty-wide scoping —
      // force the other axes empty regardless of what the client sent.
      facultyIds = [];
      majors = [];
      degreeTypes = [];
      if (role === 'supervisor' && !(await verifySupervisorOwnsProjects(uploaderId, projectIds))) {
        return res.status(403).json({ message: 'You may only attach files to your own projects.' });
      }
    } else if (role === 'supervisor') {
      // Supervisors have no faculty-wide authority — they must always target
      // specific project(s).
      return res.status(400).json({ message: 'Select at least one of your projects to attach this file to.' });
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
      projectIds,
      milestoneType,
      isVisible,
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({ success: true, id: docRef.id, fileUrl: result.secure_url });
  } catch (error: any) {
    console.error('uploadInfoFile error:', error);
    return res.status(500).json({ message: error.message || 'Failed to upload file.' });
  }
};

// ─── PATCH /api/admin/info-files/:id ───────────────────────────────────────────
// Edits an EXISTING file in place — a replacement upload (the file went
// stale/wrong) and/or a visibility toggle (hide without deleting). Title and
// scope aren't editable here; retargeting means delete + re-upload.
export const updateInfoFile = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const role = req.user?.role;
  if (!uid || !role) return res.status(401).json({ message: 'Unauthorized.' });
  if (!INFO_FILE_ROLES.includes(role)) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  const { id } = req.params;
  if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Invalid file id.' });

  try {
    const ref = db.collection('infoFiles').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ message: 'File not found.' });
    const data = snap.data()!;

    if (role === 'supervisor' && !(await verifySupervisorOwnsProjects(uid, data.projectIds ?? []))) {
      return res.status(403).json({ message: 'You may only edit files attached to your own projects.' });
    }

    const update: Record<string, unknown> = {};

    const file = (req as any).file as Express.Multer.File | undefined;
    if (file) {
      const base64  = file.buffer.toString('base64');
      const dataUri = `data:${file.mimetype};base64,${base64}`;
      const result = await cloudinary.uploader.upload(dataUri, { resource_type: 'raw', folder: 'info-files' });
      update.fileUrl  = result.secure_url;
      update.fileName = file.originalname;
      update.mimeType = file.mimetype;
    }

    if (req.body?.isVisible !== undefined) {
      update.isVisible = req.body.isVisible === 'true' || req.body.isVisible === true;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: 'Nothing to update — provide a replacement file and/or isVisible.' });
    }

    await ref.update(update);
    return res.status(200).json({ success: true, message: 'File updated.' });
  } catch (error: any) {
    console.error('updateInfoFile error:', error);
    return res.status(500).json({ message: error.message || 'Failed to update file.' });
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
        id:            d.id,
        titleHe:       data.titleHe       ?? '',
        titleEn:       data.titleEn       ?? '',
        fileUrl:       data.fileUrl       ?? '',
        fileName:      data.fileName      ?? '',
        mimeType:      data.mimeType      ?? '',
        facultyIds:    data.facultyIds    ?? [],
        majors:        data.majors        ?? [],
        degreeTypes:   data.degreeTypes   ?? [],
        projectIds:    data.projectIds    ?? [],
        milestoneType: data.milestoneType ?? null,
        isVisible:     data.isVisible     ?? true,
        createdAt:     data.createdAt?.toDate?.()?.toISOString() ?? null,
      };
    });

    if (req.user?.role === 'student') {
      const studentSnap = await db.collection('users').doc(req.user.uid).get();
      const student = studentSnap.data() ?? {};
      // Legacy single-project field kept as a fallback — activeProjectIds is
      // the current canonical multi-project list (see TEMP multi-active-
      // projects work in projectEnrollment.ts).
      const activeProjectIds: string[] = student.activeProjectIds ?? (student.activeProjectId ? [student.activeProjectId] : []);

      const facultyMajorMatched = files.filter((f) =>
        f.projectIds.length === 0 &&
        (f.facultyIds.length === 0  || f.facultyIds.includes(req.user!.facultyId)) &&
        (f.majors.length === 0      || f.majors.includes(student.major)) &&
        (f.degreeTypes.length === 0 || f.degreeTypes.includes(student.degreeType))
      );

      const projectScopedCandidates = files.filter((f) =>
        f.projectIds.length > 0 &&
        f.isVisible !== false &&
        f.projectIds.some((pid: string) => activeProjectIds.includes(pid))
      );

      // Memoized per project — several files can be tagged to the same
      // project, and each check needs that project's full milestone list to
      // compare orders against (see the loop below).
      const milestonesByProject: Record<string, FirebaseFirestore.DocumentData[]> = {};
      const getProjectMilestones = async (projectId: string) => {
        if (!(projectId in milestonesByProject)) {
          const msSnap = await db.collection('milestones').where('projectId', '==', projectId).get();
          milestonesByProject[projectId] = msSnap.docs.map((doc) => doc.data());
        }
        return milestonesByProject[projectId]!;
      };

      const projectScopedMatched: typeof files = [];
      for (const f of projectScopedCandidates) {
        if (!f.milestoneType) {
          projectScopedMatched.push(f);
          continue;
        }
        const matchingProjectId = f.projectIds.find((pid: string) => activeProjectIds.includes(pid))!;
        const ms = await getProjectMilestones(matchingProjectId);
        const tagged = ms.find((m) => m.type === f.milestoneType);
        if (!tagged) continue; // this project doesn't even have that milestone type
        const current = ms
          .filter((m) => !DONE_MILESTONE_STATUSES.has(m.status))
          .sort((a, b) => resolveMilestoneOrder(a) - resolveMilestoneOrder(b))[0];
        // No not-done milestone left means everything is done — "reached
        // everything," not "reached nothing."
        const currentOrder = current ? resolveMilestoneOrder(current) : Number.MAX_SAFE_INTEGER;
        if (resolveMilestoneOrder(tagged) <= currentOrder) projectScopedMatched.push(f);
      }

      files = [...facultyMajorMatched, ...projectScopedMatched];
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
  const role = req.user?.role;
  const { id } = req.params;
  if (!uploaderId) return res.status(401).json({ message: 'Unauthorized.' });
  if (!role || !INFO_FILE_ROLES.includes(role)) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Invalid file id.' });
  try {
    const ref = db.collection('infoFiles').doc(id);
    if (role === 'supervisor') {
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ message: 'File not found.' });
      if (!(await verifySupervisorOwnsProjects(uploaderId, snap.data()!.projectIds ?? []))) {
        return res.status(403).json({ message: 'You may only delete files attached to your own projects.' });
      }
    }
    await ref.delete();
    return res.status(200).json({ success: true, message: 'File deleted.' });
  } catch (error: any) {
    console.error('deleteInfoFile error:', error);
    return res.status(500).json({ message: 'Failed to delete file.' });
  }
};