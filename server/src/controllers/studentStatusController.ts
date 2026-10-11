// src/controllers/studentStatusController.ts
//
// GET/PUT for the admin-editable Primary/Secondary status option lists (see
// services/studentStatuses.ts), plus setting a specific student's current
// status. system_admin manages the option lists and can set any student's
// status; faculty_admin can only set status for students in their own
// faculty (never manage the shared option lists themselves).

import { Response } from 'express';
import admin from 'firebase-admin';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { getStudentStatusConfig, updateStudentStatusConfig } from '../services/studentStatuses.js';
import { isValidDocId } from '../services/idValidation.js';
import { L } from '../utils/localize.js';

const db = admin.firestore();

function isSystemAdmin(req: AuthenticatedRequest): boolean {
  const role = req.user?.role;
  const roles = req.user?.roles ?? [];
  return role === 'system_admin' || roles.includes('system_admin');
}

function isFacultyAdmin(req: AuthenticatedRequest): boolean {
  const role = req.user?.role;
  const roles = req.user?.roles ?? [];
  return role === 'faculty_admin' || roles.includes('faculty_admin');
}

// GET /api/student-statuses — any authenticated user (labels are shown
// wherever a student's status is displayed, not just to whoever can edit it).
export const getStudentStatusOptions = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = await getStudentStatusConfig();
    return res.status(200).json(config);
  } catch (error: any) {
    console.error('getStudentStatusOptions error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load student status options.', 'טעינת אפשרויות סטטוס הסטודנט נכשלה.') });
  }
};

// PUT /api/admin/student-statuses — system_admin only. Body: any subset of
// { primary: StatusOption[], secondary: StatusOption[] } (whole-list replace
// per axis, matching academicCalendarController's partial-update convention).
export const updateStudentStatusOptions = async (req: AuthenticatedRequest, res: Response) => {
  if (!isSystemAdmin(req)) {
    return res.status(403).json({ message: L(req, 'system_admin only.', 'מנהל מערכת בלבד.') });
  }
  try {
    const updated = await updateStudentStatusConfig(req.body ?? {}, req.user!.uid);
    return res.status(200).json(updated);
  } catch (error: any) {
    console.error('updateStudentStatusOptions error:', error);
    return res.status(400).json({ message: error.message || L(req, 'Failed to update student status options.', 'עדכון אפשרויות סטטוס הסטודנט נכשל.') });
  }
};

// PUT /api/admin/users/:id/status — system_admin (any student) or
// faculty_admin (only a student in their own faculty). Body: any subset of
// { primaryStatus: string | null, secondaryStatus: string | null }; null
// clears that field. Values are validated against the CURRENT configured
// option keys, so a stale/removed status can never be written.
export const setStudentStatus = async (req: AuthenticatedRequest, res: Response) => {
  const { id: studentId } = req.params;
  if (!isValidDocId(studentId)) {
    return res.status(400).json({ message: L(req, 'Invalid student id.', 'מזהה סטודנט לא תקין.') });
  }
  if (!isSystemAdmin(req) && !isFacultyAdmin(req)) {
    return res.status(403).json({ message: L(req, 'Access denied: system_admin or faculty_admin only.', 'הגישה נדחתה: מנהל מערכת או מנהל פקולטה בלבד.') });
  }

  try {
    const studentSnap = await db.collection('users').doc(studentId).get();
    if (!studentSnap.exists) return res.status(404).json({ message: L(req, 'Student not found.', 'הסטודנט לא נמצא.') });
    const student = studentSnap.data()!;
    if (student.role !== 'student') {
      return res.status(400).json({ message: L(req, 'This endpoint only sets status on student accounts.', 'נקודת קצה זו קובעת סטטוס רק עבור חשבונות סטודנטים.') });
    }
    if (!isSystemAdmin(req) && student.facultyId !== req.user!.facultyId) {
      return res.status(403).json({ message: L(req, 'Access denied: outside your faculty.', 'הגישה נדחתה: מחוץ לפקולטה שלך.') });
    }

    const { primaryStatus, secondaryStatus } = req.body ?? {};
    const config = await getStudentStatusConfig();
    const primaryKeys = new Set(config.primary.map((o) => o.key));
    const secondaryKeys = new Set(config.secondary.map((o) => o.key));

    const update: Record<string, unknown> = {};
    if (primaryStatus !== undefined) {
      if (primaryStatus !== null && !primaryKeys.has(primaryStatus)) {
        return res.status(400).json({ message: L(req, `Invalid primaryStatus: "${primaryStatus}"`, `primaryStatus לא תקין: "${primaryStatus}"`) });
      }
      update.primaryStatus = primaryStatus === null ? admin.firestore.FieldValue.delete() : primaryStatus;
    }
    if (secondaryStatus !== undefined) {
      if (secondaryStatus !== null && !secondaryKeys.has(secondaryStatus)) {
        return res.status(400).json({ message: L(req, `Invalid secondaryStatus: "${secondaryStatus}"`, `secondaryStatus לא תקין: "${secondaryStatus}"`) });
      }
      update.secondaryStatus = secondaryStatus === null ? admin.firestore.FieldValue.delete() : secondaryStatus;
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: L(req, 'Nothing to update — provide primaryStatus and/or secondaryStatus.', 'אין מה לעדכן — יש לציין primaryStatus ו/או secondaryStatus.') });
    }

    await db.collection('users').doc(studentId).update(update);
    return res.status(200).json({ success: true, message: L(req, 'Status updated.', 'הסטטוס עודכן.') });
  } catch (error: any) {
    console.error('setStudentStatus error:', error);
    return res.status(500).json({ message: L(req, 'Failed to update student status.', 'עדכון סטטוס הסטודנט נכשל.') });
  }
};
