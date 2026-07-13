// src/controllers/studentRosterController.ts
//
// System Admin / Coordinator: upload the pre-registration student roster
// (see services/studentRoster.ts) that self-registration checks against
// before a new student account can be created.

import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { importApprovedStudentsFromBuffer } from '../services/studentRoster.js';

// ─── POST /api/admin/student-roster/import ────────────────────────────────────
export const importStudentRosterAdmin = async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'system_admin') {
    return res.status(403).json({ message: 'Access denied: system_admin only.' });
  }

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ message: 'No file uploaded.' });

  try {
    const summary = await importApprovedStudentsFromBuffer(file.buffer, { uploadedBy: req.user.uid });
    return res.status(200).json({ success: true, summary });
  } catch (error: any) {
    console.error('importStudentRosterAdmin error:', error);
    return res.status(500).json({ message: error.message || 'Failed to import student roster.' });
  }
};

// ─── POST /api/coordinator/student-roster/import ──────────────────────────────
// Rows outside the coordinator's own faculty are skipped (not failed) and
// reported individually — same convention as the users/staff imports.
export const importStudentRosterCoordinator = async (req: AuthenticatedRequest, res: Response) => {
  const isCoordinator = req.user?.role === 'coordinator' || req.user?.roles?.includes('coordinator');
  if (!isCoordinator) {
    return res.status(403).json({ message: 'Access denied: coordinator only.' });
  }

  const facultyId = req.user?.facultyId;
  if (!facultyId) return res.status(400).json({ message: 'Coordinator has no facultyId assigned.' });

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ message: 'No file uploaded.' });

  try {
    const summary = await importApprovedStudentsFromBuffer(file.buffer, {
      restrictFacultyId: facultyId,
      uploadedBy: req.user!.uid,
    });
    return res.status(200).json({ success: true, summary });
  } catch (error: any) {
    console.error('importStudentRosterCoordinator error:', error);
    return res.status(500).json({ message: error.message || 'Failed to import student roster.' });
  }
};
