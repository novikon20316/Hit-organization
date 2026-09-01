// src/controllers/studentsListController.ts
//
// GET /api/admin/students-list — a read-only student roster for
// faculty_admin (every student under their faculty, any major/degree) and
// grad_school_head (masters students only, narrowed to whichever majors
// their coordinatorScopes name — see majorAllowed below — or the whole
// faculty's masters students if none are set). system_admin sees everyone.
//
// Scoped the same way listManagedStaff (facultyAdminController.ts) scopes
// the staff roster — via each role's own *FacultyIds delegate field — with
// grad_school_head additionally narrowed by degreeType and, optionally, by
// major through the generic coordinatorScopes mechanism (already used
// elsewhere for administrative_secretary's own scope — see
// scopeAuthorization.ts's withinCoordinatorScope).

import { Response } from 'express';
import admin from 'firebase-admin';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { facultyIdMatches, type RoleFacultyField } from '../services/scopeAuthorization.js';

const db = admin.firestore();

function hasRole(user: AuthenticatedRequest['user'], r: string): boolean {
  return user?.role === r || (user?.roles ?? []).includes(r);
}

/** True if `user` holds a coordinatorScope naming a specific major for
 *  `student`'s faculty (or a cross-faculty 'all' scope). If the account has
 *  no such scope at all, it's unrestricted on the major axis — "the entire
 *  faculty's masters degree if he does not have any specific major". */
function majorAllowed(user: AuthenticatedRequest['user'], student: { facultyId: string; major?: string | null }): boolean {
  const scopes = user?.coordinatorScopes ?? [];
  const majorScopes = scopes.filter((s) => s.major && (s.facultyId === 'all' || s.facultyId === student.facultyId));
  if (majorScopes.length === 0) return true;
  return majorScopes.some((s) => s.major === student.major);
}

function inScope(user: AuthenticatedRequest['user'], student: { facultyId: string; major?: string | null; degreeType?: string | null }): boolean {
  if (hasRole(user, 'system_admin')) return true;
  if (hasRole(user, 'faculty_admin')) {
    return facultyIdMatches(user as any, student.facultyId, 'facultyAdminFacultyIds' as RoleFacultyField);
  }
  if (hasRole(user, 'grad_school_head')) {
    if (student.degreeType !== 'masters') return false;
    if (!facultyIdMatches(user as any, student.facultyId, 'gradSchoolHeadFacultyIds' as RoleFacultyField)) return false;
    return majorAllowed(user, student);
  }
  return false;
}

export const listStudentsForScope = async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user;
  const isAllowed = hasRole(user, 'system_admin') || hasRole(user, 'faculty_admin') || hasRole(user, 'grad_school_head');
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
