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
export const getStudentStatusOptions = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const config = await getStudentStatusConfig();
    return res.status(200).json(config);
  } catch (error: any) {
    console.error('getStudentStatusOptions error:', error);
    return res.status(500).json({ message: 'Failed to load student status options.' });
  }
};

// PUT /api/admin/student-statuses — system_admin only. Body: any subset of
// { primary: StatusOption[], secondary: StatusOption[] } (whole-list replace
// per axis, matching academicCalendarController's partial-update convention).
export const updateStudentStatusOptions = async (req: AuthenticatedRequest, res: Response) => {
  if (!isSystemAdmin(req)) {
    return res.status(403).json({ message: 'system_admin only.' });
  }
  try {
    const updated = await updateStudentStatusConfig(req.body ?? {}, req.user!.uid);
    return res.status(200).json(updated);
  } catch (error: any) {
    console.error('updateStudentStatusOptions error:', error);
    return res.status(400).json({ message: error.message || 'Failed to update student status options.' });
  }
};

// PUT /api/admin/users/:id/status — system_admin (any student) or
// faculty_admin (only a student in their own faculty). Body: any subset of
// { primaryStatus: string | null, secondaryStatus: string | null }; null
// clears that field. Values are validated against the CURRENT configured
// option keys, so a stale/removed status can never be written.
export const setStudentStatus = async (req: AuthenticatedRequest, res: Response) => {
  const { id: studentId } = req.params;
  if (!studentId || typeof studentId !== 'string') {
    return res.status(400).json({ message: 'Invalid student id.' });
  }
  if (!isSystemAdmin(req) && !isFacultyAdmin(req)) {
    return res.status(403).json({ message: 'Access denied: system_admin or faculty_admin only.' });
  }

  try {
    const studentSnap = await db.collection('users').doc(studentId).get();
    if (!studentSnap.exists) return res.status(404).json({ message: 'Student not found.' });
    const student = studentSnap.data()!;
    if (student.role !== 'student') {
      return res.status(400).json({ message: 'This endpoint only sets status on student accounts.' });
    }
    if (!isSystemAdmin(req) && student.facultyId !== req.user!.facultyId) {
      return res.status(403).json({ message: "Access denied: outside your faculty." });
    }

    const { primaryStatus, secondaryStatus } = req.body ?? {};
    const config = await getStudentStatusConfig();
    const primaryKeys = new Set(config.primary.map((o) => o.key));
    const secondaryKeys = new Set(config.secondary.map((o) => o.key));

    const update: Record<string, unknown> = {};
    if (primaryStatus !== undefined) {
      if (primaryStatus !== null && !primaryKeys.has(primaryStatus)) {
        return res.status(400).json({ message: `Invalid primaryStatus: "${primaryStatus}"` });
      }
      update.primaryStatus = primaryStatus === null ? admin.firestore.FieldValue.delete() : primaryStatus;
    }
    if (secondaryStatus !== undefined) {
      if (secondaryStatus !== null && !secondaryKeys.has(secondaryStatus)) {
        return res.status(400).json({ message: `Invalid secondaryStatus: "${secondaryStatus}"` });
      }
      update.secondaryStatus = secondaryStatus === null ? admin.firestore.FieldValue.delete() : secondaryStatus;
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: 'Nothing to update — provide primaryStatus and/or secondaryStatus.' });
    }

    await db.collection('users').doc(studentId).update(update);
    return res.status(200).json({ success: true, message: 'Status updated.' });
  } catch (error: any) {
    console.error('setStudentStatus error:', error);
    return res.status(500).json({ message: 'Failed to update student status.' });
  }
};
