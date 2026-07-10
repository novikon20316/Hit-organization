// src/controllers/academicCalendarController.ts
// GET/PUT for the system_admin-editable academic calendar config — see
// services/academicCalendar.ts.

import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { getAcademicCalendar, updateAcademicCalendar } from '../services/academicCalendar.js';

function isSystemAdmin(req: AuthenticatedRequest): boolean {
  const role = req.user?.role;
  const roles = req.user?.roles ?? [];
  return role === 'system_admin' || roles.includes('system_admin');
}

// GET /api/admin/academic-calendar
export const getAcademicCalendarConfig = async (req: AuthenticatedRequest, res: Response) => {
  if (!isSystemAdmin(req)) {
    return res.status(403).json({ message: 'system_admin only.' });
  }
  try {
    const calendar = await getAcademicCalendar();
    return res.status(200).json(calendar);
  } catch (error: any) {
    console.error('getAcademicCalendarConfig error:', error);
    return res.status(500).json({ message: 'Failed to load academic calendar.' });
  }
};

// PUT /api/admin/academic-calendar
// Body: any subset of { fallSemesterStartMonth, fallSemesterStartDay, springSemesterStartMonth, springSemesterStartDay }
export const updateAcademicCalendarConfig = async (req: AuthenticatedRequest, res: Response) => {
  if (!isSystemAdmin(req)) {
    return res.status(403).json({ message: 'system_admin only.' });
  }
  try {
    const updated = await updateAcademicCalendar(req.body ?? {}, req.user!.uid);
    return res.status(200).json(updated);
  } catch (error: any) {
    console.error('updateAcademicCalendarConfig error:', error);
    return res.status(400).json({ message: error.message || 'Failed to update academic calendar.' });
  }
};
