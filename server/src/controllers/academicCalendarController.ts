// src/controllers/academicCalendarController.ts
// GET/PUT for the system_admin-editable academic calendar config — see
// services/academicCalendar.ts.

import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { getAcademicCalendar, updateAcademicCalendar } from '../services/academicCalendar.js';
import { L } from '../utils/localize.js';
import { clientMessage } from '../utils/clientError.js';

function isSystemAdmin(req: AuthenticatedRequest): boolean {
  const role = req.user?.role;
  const roles = req.user?.roles ?? [];
  return role === 'system_admin' || roles.includes('system_admin');
}

// GET /api/admin/academic-calendar
export const getAcademicCalendarConfig = async (req: AuthenticatedRequest, res: Response) => {
  if (!isSystemAdmin(req)) {
    return res.status(403).json({ message: L(req, 'system_admin only.', 'מנהל מערכת בלבד.') });
  }
  try {
    const calendar = await getAcademicCalendar();
    return res.status(200).json(calendar);
  } catch (error: any) {
    console.error('getAcademicCalendarConfig error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load academic calendar.', 'טעינת לוח השנה האקדמי נכשלה.') });
  }
};

// PUT /api/admin/academic-calendar
// Body: any subset of { fallSemesterStartMonth, fallSemesterStartDay, springSemesterStartMonth, springSemesterStartDay }
export const updateAcademicCalendarConfig = async (req: AuthenticatedRequest, res: Response) => {
  if (!isSystemAdmin(req)) {
    return res.status(403).json({ message: L(req, 'system_admin only.', 'מנהל מערכת בלבד.') });
  }
  try {
    const updated = await updateAcademicCalendar(req.body ?? {}, req.user!.uid);
    return res.status(200).json(updated);
  } catch (error: any) {
    console.error('updateAcademicCalendarConfig error:', error);
    return res.status(400).json({ message: clientMessage(error, L(req, 'Failed to update academic calendar.', 'עדכון לוח השנה האקדמי נכשל.')) });
  }
};
