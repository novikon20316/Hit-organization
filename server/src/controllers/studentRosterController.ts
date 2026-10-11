// src/controllers/studentRosterController.ts
//
// System Admin / Coordinator: upload the pre-registration student roster
// (see services/studentRoster.ts) that self-registration checks against
// before a new student account can be created.

import { Response } from 'express';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import {
  importApprovedStudentsFromBuffer,
  listApprovedStudents,
  updateApprovedStudentEntry,
  deleteApprovedStudentEntry,
  createApprovedStudentEntry,
  type RosterDegreeType,
} from '../services/studentRoster.js';
import { L } from '../utils/localize.js';

// ─── POST /api/admin/student-roster/import ────────────────────────────────────
export const importStudentRosterAdmin = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || !hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  }

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ message: L(req, 'No file uploaded.', 'לא הועלה קובץ.') });

  try {
    const summary = await importApprovedStudentsFromBuffer(file.buffer, { uploadedBy: req.user.uid });
    return res.status(200).json({ success: true, summary });
  } catch (error: any) {
    console.error('importStudentRosterAdmin error:', error);
    return res.status(500).json({ message: L(req, 'Failed to import student roster.', 'ייבוא רשימת הסטודנטים נכשל.') });
  }
};

// ─── GET /api/admin/student-roster ─────────────────────────────────────────────
// Lists the pre-registration allowlist (see services/studentRoster.ts) so
// system_admin can actually see what's been uploaded, instead of it only
// ever being written to (import) and read internally at signup time.
export const listStudentRosterAdmin = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || !hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  }
  try {
    const { facultyId, degreeType, used, q } = req.query as Record<string, string | undefined>;
    const filter: { facultyId?: string; degreeType?: RosterDegreeType; used?: boolean } = {};
    if (facultyId) filter.facultyId = facultyId;
    if (degreeType === 'bachelors' || degreeType === 'masters') filter.degreeType = degreeType;
    if (used === 'true' || used === 'false') filter.used = used === 'true';
    const entries = await listApprovedStudents(filter);
    const query = (q || '').trim().toLowerCase();
    const filtered = query
      ? entries.filter((e) => e.studentId.includes(query) || (e.fullName ?? '').toLowerCase().includes(query))
      : entries;
    return res.status(200).json({ success: true, entries: filtered });
  } catch (error: any) {
    console.error('listStudentRosterAdmin error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load the student roster.', 'טעינת רשימת הסטודנטים נכשלה.') });
  }
};

// ─── POST /api/admin/student-roster ────────────────────────────────────────────
// Manual single-entry add — the "+" button counterpart to the bulk Excel
// import above, for adding one approved student without building a file.
export const createStudentRosterAdmin = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || !hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  }
  const { studentId, facultyId, degreeType, fullName, major } = req.body ?? {};
  try {
    const entry = await createApprovedStudentEntry({ studentId, facultyId, degreeType, fullName, major }, req.user.uid);
    return res.status(201).json({ success: true, entry });
  } catch (error: any) {
    console.error('createStudentRosterAdmin error:', error);
    return res.status(400).json({ success: false, message: error.message || L(req, 'Failed to add the roster entry.', 'הוספת הרשומה לרשימה נכשלה.') });
  }
};

// ─── PATCH /api/admin/student-roster/:docId ────────────────────────────────────
export const updateStudentRosterAdmin = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || !hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  }
  const { docId } = req.params;
  if (!docId || typeof docId !== 'string') {
    return res.status(400).json({ message: L(req, 'Missing docId.', 'חסר מזהה רשומה.') });
  }
  try {
    await updateApprovedStudentEntry(docId, req.body ?? {});
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('updateStudentRosterAdmin error:', error);
    return res.status(400).json({ success: false, message: error.message || L(req, 'Failed to update the roster entry.', 'עדכון הרשומה ברשימה נכשל.') });
  }
};

// ─── DELETE /api/admin/student-roster/:docId ───────────────────────────────────
export const deleteStudentRosterAdmin = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || !hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  }
  const { docId } = req.params;
  if (!docId || typeof docId !== 'string') {
    return res.status(400).json({ message: L(req, 'Missing docId.', 'חסר מזהה רשומה.') });
  }
  try {
    await deleteApprovedStudentEntry(docId);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('deleteStudentRosterAdmin error:', error);
    return res.status(500).json({ message: L(req, 'Failed to delete the roster entry.', 'מחיקת הרשומה מהרשימה נכשלה.') });
  }
};

// ─── POST /api/coordinator/student-roster/import ──────────────────────────────
// Rows outside the coordinator's own faculty are skipped (not failed) and
// reported individually — same convention as the users/staff imports.
export const importStudentRosterCoordinator = async (req: AuthenticatedRequest, res: Response) => {
  const isCoordinator = req.user?.role === 'coordinator' || req.user?.roles?.includes('coordinator');
  if (!isCoordinator) {
    return res.status(403).json({ message: L(req, 'Access denied: coordinator only.', 'הגישה נדחתה: רכז פקולטה בלבד.') });
  }

  const facultyId = req.user?.facultyId;
  if (!facultyId) return res.status(400).json({ message: L(req, 'Coordinator has no facultyId assigned.', 'לרכז הפקולטה לא הוקצתה פקולטה.') });

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ message: L(req, 'No file uploaded.', 'לא הועלה קובץ.') });

  try {
    const summary = await importApprovedStudentsFromBuffer(file.buffer, {
      restrictFacultyId: facultyId,
      uploadedBy: req.user!.uid,
    });
    return res.status(200).json({ success: true, summary });
  } catch (error: any) {
    console.error('importStudentRosterCoordinator error:', error);
    return res.status(500).json({ message: L(req, 'Failed to import student roster.', 'ייבוא רשימת הסטודנטים נכשל.') });
  }
};
