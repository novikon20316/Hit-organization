// src/controllers/userImportExportController.ts
//
// System Admin: import/export the full user roster.
// Coordinator: import/export scoped to their own facultyId only.

import { Response, RequestHandler } from 'express';
import multer from 'multer';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { importStaffFromBuffer, buildUsersExportBuffer } from '../services/userImportExport.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
export const uploadExcelFileMiddleware: RequestHandler = upload.single('file') as unknown as RequestHandler;

function excelResponse(res: Response, buffer: Buffer, filename: string) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(buffer);
}

// ─── GET /api/admin/users/export ──────────────────────────────────────────────
export const exportUsersAdmin = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || !hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: 'Access denied: system_admin only.' });
  }

  try {
    const snap  = await db.collection('users').get();
    const users = snap.docs.map((d) => d.data());
    const buffer = buildUsersExportBuffer(users);
    return excelResponse(res, buffer, 'users_export.xlsx');
  } catch (error: any) {
    console.error('exportUsersAdmin error:', error);
    return res.status(500).json({ message: 'Failed to export users.' });
  }
};

// ─── GET /api/coordinator/users/export ────────────────────────────────────────
// Scoped to the coordinator's own faculty — each faculty coordinator only ever
// sees/exports their own students and staff.
export const exportUsersCoordinator = async (req: AuthenticatedRequest, res: Response) => {
  const isCoordinator = req.user?.role === 'coordinator' || req.user?.roles?.includes('coordinator');
  if (!isCoordinator) {
    return res.status(403).json({ message: 'Access denied: coordinator only.' });
  }

  const facultyId = req.user?.facultyId;
  if (!facultyId) return res.status(400).json({ message: 'Coordinator has no facultyId assigned.' });

  try {
    const snap  = await db.collection('users').where('facultyId', '==', facultyId).get();
    const users = snap.docs.map((d) => d.data());
    const buffer = buildUsersExportBuffer(users);
    return excelResponse(res, buffer, `users_export_${facultyId}.xlsx`);
  } catch (error: any) {
    console.error('exportUsersCoordinator error:', error);
    return res.status(500).json({ message: 'Failed to export users.' });
  }
};

// ─── POST /api/admin/staff/import ──────────────────────────────────────────────
// Imports the college's HR "סגל" export — a different column layout than the
// generic users import above. See services/userImportExport.ts for the mapping.
export const importStaffAdmin = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || !hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: 'Access denied: system_admin only.' });
  }

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ message: 'No file uploaded.' });

  try {
    const summary = await importStaffFromBuffer(file.buffer, { lang: 'he' });
    return res.status(200).json({ success: true, summary });
  } catch (error: any) {
    console.error('importStaffAdmin error:', error);
    return res.status(500).json({ message: error.message || 'Failed to import staff.' });
  }
};

// ─── POST /api/coordinator/staff/import ────────────────────────────────────────
// Rows outside the coordinator's own faculty are skipped (not failed) and
// reported individually, same as the users import.
export const importStaffCoordinator = async (req: AuthenticatedRequest, res: Response) => {
  const isCoordinator = req.user?.role === 'coordinator' || req.user?.roles?.includes('coordinator');
  if (!isCoordinator) {
    return res.status(403).json({ message: 'Access denied: coordinator only.' });
  }

  const facultyId = req.user?.facultyId;
  if (!facultyId) return res.status(400).json({ message: 'Coordinator has no facultyId assigned.' });

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ message: 'No file uploaded.' });

  try {
    const summary = await importStaffFromBuffer(file.buffer, { restrictFacultyId: facultyId, lang: 'he' });
    return res.status(200).json({ success: true, summary });
  } catch (error: any) {
    console.error('importStaffCoordinator error:', error);
    return res.status(500).json({ message: error.message || 'Failed to import staff.' });
  }
};
