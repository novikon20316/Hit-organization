// src/controllers/studentsListController.ts
//
// GET /api/admin/students-list — a read-only student roster for
// faculty_admin (every student under their faculty, any major/degree),
// grad_school_head (masters students only, narrowed to whichever majors
// their coordinatorScopes name — see majorAllowed below — or the whole
// faculty's masters students if none are set), and administrative_secretary
// (whatever their own coordinatorScopes name, same scope the thesis-average
// write endpoints already use). system_admin sees everyone.
//
// Scoped the same way listManagedStaff (facultyAdminController.ts) scopes
// the staff roster — via each role's own *FacultyIds delegate field — with
// grad_school_head additionally narrowed by degreeType and, optionally, by
// major through the generic coordinatorScopes mechanism, and
// administrative_secretary (no *FacultyIds field of its own) scoped directly
// via that same mechanism (scopeAuthorization.ts's withinCoordinatorScope).

import { Response } from 'express';
import admin from 'firebase-admin';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { isStudentWithinStaffScope } from '../services/scopeAuthorization.js';

const db = admin.firestore();

function hasRole(user: AuthenticatedRequest['user'], r: string): boolean {
  return user?.role === r || (user?.roles ?? []).includes(r);
}

// The scope predicate itself now lives in scopeAuthorization.ts
// (isStudentWithinStaffScope), shared with adminController.ts's Add/Delete
// Student endpoints so a coordinator can never create or delete a student
// outside what this roster would even show them.
function inScope(user: AuthenticatedRequest['user'], student: { facultyId: string; major?: string | null; degreeType?: string | null }): boolean {
  return isStudentWithinStaffScope(user, student);
}

export const listStudentsForScope = async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user;
  const isAllowed = hasRole(user, 'system_admin') || hasRole(user, 'faculty_admin') || hasRole(user, 'grad_school_head') || hasRole(user, 'administrative_secretary');
  if (!user || !isAllowed) {
    return res.status(403).json({ message: 'Access denied.' });
  }

  try {
    const snap = await db.collection('users').where('role', '==', 'student').get();
    const students = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u: any) => inScope(user, { facultyId: u.facultyId ?? '', major: u.major ?? null, degreeType: u.degreeType ?? null }))
      .map((u: any) => ({
        id: u.id,
        displayName: u.displayName ?? '',
        email: u.email ?? '',
        studentId: u.studentId ?? '',
        facultyId: u.facultyId ?? '',
        degreeType: u.degreeType ?? null,
        major: u.major ?? null,
        yearOfStudy: u.yearOfStudy ?? null,
        isEligibleForProcess: !!u.isEligibleForProcess,
        track: u.track ?? null,
        trackPolicy: u.trackPolicy ?? null,
        trackLocked: !!u.trackLocked,
        thesisEligibility: u.thesisEligibility ?? null,
        hasActiveProject: !!u.hasActiveProject,
        supervisorId: u.supervisorId ?? null,
        isActive: u.isActive !== false,
      }));

    return res.status(200).json({ success: true, students });
  } catch (error: any) {
    console.error('listStudentsForScope error:', error);
    return res.status(500).json({ message: 'Failed to load students list.' });
  }
};
