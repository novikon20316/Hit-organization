// src/controllers/studentTrackController.ts
//
// HTTP surface for a student's initial thesis/project track assignment — see
// services/studentTrack.ts. Distinct from trackChangeController.ts, which
// switches an already-enrolled project's track.

import { Response } from 'express';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { db } from '../config/firebase.js';
import { withinCoordinatorScope } from '../services/scopeAuthorization.js';
import {
  chooseStudentTrack,
  setThesisEligibility,
  setThesisEligibilityFromAverage,
  adminOverrideStudentTrack,
  StudentTrackError,
} from '../services/studentTrack.js';
import { isValidDocId } from '../services/idValidation.js';
import { L } from '../utils/localize.js';
import { specializationsForStudent } from '../config/specialization.js';
import { logAuditEvent } from '../services/auditLog.js';
import { normalizeCompletedCourses } from '../services/prerequisites.js';

// Mirrors PROJECT_COORDINATOR_DASHBOARD_ROLES in projectCoordinatorController.ts
// plus 'coordinator' — the plain faculty coordinator role is who the business
// rule actually names as responsible for granting thesis eligibility, but
// isn't in that file's own allowlist (kept narrow there for unrelated
// endpoints — see that file's COORDINATOR_STATISTICS_ROLES for the same
// "add a scoped extra constant rather than widen the shared one" precedent).
// grad_school_head added so a CS grad-school head can enter their own
// faculty's students' averages too — withinCoordinatorScope below already
// confines them to their own facultyId, same as program_head.
const THESIS_ELIGIBILITY_ROLES = ['coordinator', 'administrative_secretary', 'faculty_admin', 'program_head', 'grad_school_head', 'system_admin'];

export const chooseTrack = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (req.user.role !== 'student') {
    return res.status(403).json({ message: L(req, 'Only a student may choose their own track.', 'רק סטודנט יכול לבחור את המסלול שלו.') });
  }
  const { track } = req.body;

  try {
    await chooseStudentTrack(req.user.uid, track, req.user.uid, req.user.role);
    return res.status(200).json({ success: true, track });
  } catch (error) {
    if (error instanceof StudentTrackError) {
      return res.status(400).json({ message: error.messageEn, messageHe: error.messageHe, messageEn: error.messageEn });
    }
    const message = error instanceof Error ? error.message : L(req, 'Failed to set track.', 'קביעת המסלול נכשלה.');
    return res.status(400).json({ message });
  }
};

export const setStudentThesisEligibility = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (!hasAnyRole(req.user, THESIS_ELIGIBILITY_ROLES)) {
    return res.status(403).json({ message: L(req, 'Forbidden.', 'הפעולה אסורה.') });
  }
  const { studentId } = req.params;
  const { eligible, reason } = req.body;
  if (typeof eligible !== 'boolean') {
    return res.status(400).json({ message: L(req, 'eligible must be a boolean.', 'eligible חייב להיות ערך בוליאני.') });
  }
  if (!isValidDocId(studentId)) {
    return res.status(400).json({ message: L(req, 'Invalid studentId.', 'מזהה הסטודנט אינו תקין.') });
  }

  try {
    const studentSnap = await db.collection('users').doc(studentId).get();
    if (!studentSnap.exists || studentSnap.data()?.role !== 'student') {
      return res.status(404).json({ message: L(req, 'Student not found.', 'הסטודנט לא נמצא.') });
    }
    const studentData = studentSnap.data()!;
    if (!withinCoordinatorScope(req.user, { facultyId: studentData.facultyId ?? '', major: studentData.major || undefined })) {
      return res.status(403).json({ message: L(req, 'This student is outside your assigned scope.', 'סטודנט זה אינו בתחום האחריות שהוקצה לך.') });
    }

    await setThesisEligibility(studentId, eligible, reason, req.user.uid, req.user.role);
    return res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof StudentTrackError) {
      return res.status(400).json({ message: error.messageEn, messageHe: error.messageHe, messageEn: error.messageEn });
    }
    const message = error instanceof Error ? error.message : L(req, 'Failed to set thesis eligibility.', 'קביעת הזכאות לתזה נכשלה.');
    return res.status(400).json({ message });
  }
};

// Same allowlist/scope model as setStudentThesisEligibility above — entering
// an average is just another way to reach the same decision, not a
// separately-authorized action.
export const setStudentThesisAverage = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (!hasAnyRole(req.user, THESIS_ELIGIBILITY_ROLES)) {
    return res.status(403).json({ message: L(req, 'Forbidden.', 'הפעולה אסורה.') });
  }
  const { studentId } = req.params;
  const { average } = req.body;
  if (typeof average !== 'number') {
    return res.status(400).json({ message: L(req, 'average must be a number.', 'average חייב להיות מספר.') });
  }
  if (!isValidDocId(studentId)) {
    return res.status(400).json({ message: L(req, 'Invalid studentId.', 'מזהה הסטודנט אינו תקין.') });
  }

  try {
    const studentSnap = await db.collection('users').doc(studentId).get();
    if (!studentSnap.exists || studentSnap.data()?.role !== 'student') {
      return res.status(404).json({ message: L(req, 'Student not found.', 'הסטודנט לא נמצא.') });
    }
    const studentData = studentSnap.data()!;
    if (!withinCoordinatorScope(req.user, { facultyId: studentData.facultyId ?? '', major: studentData.major || undefined })) {
      return res.status(403).json({ message: L(req, 'This student is outside your assigned scope.', 'סטודנט זה אינו בתחום האחריות שהוקצה לך.') });
    }

    await setThesisEligibilityFromAverage(studentId, average, req.user.uid, req.user.role);
    return res.status(200).json({ success: true });
  } catch (error) {
    // error.status: 409/'ALREADY_GRADED' when a concurrent submission for
    // the same student already won (see setThesisEligibilityFromAverage's
    // transaction) — everything else stays a plain 400, same as before.
    if (error instanceof StudentTrackError) {
      return res.status(error.status).json({ message: error.messageEn, messageHe: error.messageHe, messageEn: error.messageEn, code: error.code });
    }
    const message = error instanceof Error ? error.message : L(req, 'Failed to set thesis average.', 'קביעת הממוצע לתזה נכשלה.');
    return res.status(400).json({ message });
  }
};

export const overrideStudentTrack = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (!hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'system_admin only.', 'מנהל מערכת בלבד.') });
  }
  const { id: studentId } = req.params;
  const { track, trackLocked, thesisEligible } = req.body;
  if (!isValidDocId(studentId)) {
    return res.status(400).json({ message: L(req, 'Invalid studentId.', 'מזהה הסטודנט אינו תקין.') });
  }

  try {
    await adminOverrideStudentTrack(
      studentId,
      { track, trackLocked, thesisEligible },
      req.user.uid,
    );
    return res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof StudentTrackError) {
      return res.status(400).json({ message: error.messageEn, messageHe: error.messageHe, messageEn: error.messageEn });
    }
    const message = error instanceof Error ? error.message : L(req, 'Failed to override track.', 'שינוי המסלול בכפייה נכשל.');
    return res.status(400).json({ message });
  }
};

// Who may set/correct a student's specialization (תחום) after signup — e.g.
// for students who registered before the field existed. Scoped the same way
// as the thesis-eligibility endpoints (withinCoordinatorScope).
const SPECIALIZATION_ROLES = ['coordinator', 'administrative_secretary', 'system_admin'];

export const setStudentSpecialization = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (!hasAnyRole(req.user, SPECIALIZATION_ROLES)) {
    return res.status(403).json({ message: L(req, 'Forbidden.', 'הפעולה אסורה.') });
  }
  const { studentId } = req.params;
  const specialization: unknown = req.body?.specialization ?? null;
  if (!isValidDocId(studentId)) {
    return res.status(400).json({ message: L(req, 'Invalid studentId.', 'מזהה הסטודנט אינו תקין.') });
  }
  if (specialization !== null && typeof specialization !== 'string') {
    return res.status(400).json({ message: L(req, 'Invalid specialization.', 'תחום התמחות לא תקין.') });
  }

  try {
    const studentRef = db.collection('users').doc(studentId);
    const studentSnap = await studentRef.get();
    if (!studentSnap.exists || studentSnap.data()?.role !== 'student') {
      return res.status(404).json({ message: L(req, 'Student not found.', 'הסטודנט לא נמצא.') });
    }
    const studentData = studentSnap.data()!;
    if (!withinCoordinatorScope(req.user, { facultyId: studentData.facultyId ?? '', major: studentData.major || undefined })) {
      return res.status(403).json({ message: L(req, 'This student is outside your assigned scope.', 'סטודנט זה אינו בתחום האחריות שהוקצה לך.') });
    }

    const allowed = specializationsForStudent(studentData);
    if (allowed.length === 0) {
      return res.status(400).json({ message: L(req, "This student's program has no specializations.", 'לתוכנית של סטודנט זה אין תחומי התמחות.') });
    }
    if (specialization !== null && !allowed.includes(specialization)) {
      return res.status(400).json({ message: L(req, "This specialization is not available for the student's program/track.", 'תחום ההתמחות אינו זמין לתוכנית/למסלול של הסטודנט.') });
    }

    await studentRef.update({ specialization, updatedAt: new Date().toISOString() });
    await logAuditEvent({
      userId: req.user.uid,
      userRole: req.user.role,
      action: 'student_specialization_set',
      entityType: 'user',
      entityId: studentId,
      oldValue: { specialization: studentData.specialization ?? null },
      newValue: { specialization },
    });
    return res.status(200).json({ success: true, specialization });
  } catch (error) {
    const message = error instanceof Error ? error.message : L(req, 'Failed to set specialization.', 'עדכון תחום ההתמחות נכשל.');
    return res.status(400).json({ message });
  }
};

// Who may set a student's completed courses (+ grades) from the student
// detail page — the list project prerequisites are checked against. Same
// roles/scope model as SPECIALIZATION_ROLES above. system_admin can also do
// this unscoped from the Academic Year page (adminController.ts's
// updateStudentCompletedCoursesAsAdmin). Replaces the whole list.
const COMPLETED_COURSES_ROLES = ['coordinator', 'administrative_secretary', 'system_admin'];

export const setStudentCompletedCourses = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (!hasAnyRole(req.user, COMPLETED_COURSES_ROLES)) {
    return res.status(403).json({ message: L(req, 'Forbidden.', 'הפעולה אסורה.') });
  }
  const { studentId } = req.params;
  const { completedCourses } = req.body ?? {};
  if (!isValidDocId(studentId)) {
    return res.status(400).json({ message: L(req, 'Invalid studentId.', 'מזהה הסטודנט אינו תקין.') });
  }
  if (!Array.isArray(completedCourses) || completedCourses.length > 300) {
    return res.status(400).json({ message: L(req, 'completedCourses must be an array.', 'completedCourses חייב להיות מערך.') });
  }

  const normalized: { subject: string; grade: number }[] = [];
  const seen = new Set<string>();
  for (const entry of completedCourses) {
    const subject = typeof entry?.subject === 'string' ? entry.subject.trim().slice(0, 200) : '';
    const grade = Number(entry?.grade);
    if (!subject) return res.status(400).json({ message: L(req, 'Each course needs a subject name.', 'לכל קורס יש להזין שם מקצוע.') });
    if (entry?.grade === '' || entry?.grade == null || !Number.isFinite(grade) || grade < 0 || grade > 100) {
      return res.status(400).json({ message: L(req, `Invalid grade for "${subject}" — must be 0-100.`, `ציון לא תקין עבור "${subject}" — חייב להיות בין 0 ל-100.`) });
    }
    if (seen.has(subject)) {
      return res.status(400).json({ message: L(req, `"${subject}" appears more than once.`, `"${subject}" מופיע יותר מפעם אחת.`) });
    }
    seen.add(subject);
    normalized.push({ subject, grade });
  }

  try {
    const studentRef = db.collection('users').doc(studentId);
    const studentSnap = await studentRef.get();
    if (!studentSnap.exists || studentSnap.data()?.role !== 'student') {
      return res.status(404).json({ message: L(req, 'Student not found.', 'הסטודנט לא נמצא.') });
    }
    const studentData = studentSnap.data()!;
    if (!withinCoordinatorScope(req.user, { facultyId: studentData.facultyId ?? '', major: studentData.major || undefined })) {
      return res.status(403).json({ message: L(req, 'This student is outside your assigned scope.', 'סטודנט זה אינו בתחום האחריות שהוקצה לך.') });
    }

    await studentRef.update({ completedCourses: normalized, updatedAt: new Date().toISOString() });
    await logAuditEvent({
      userId: req.user.uid,
      userRole: req.user.role,
      action: 'completed_courses_updated_by_staff',
      entityType: 'user',
      entityId: studentId,
      oldValue: { completedCourses: normalizeCompletedCourses(studentData.completedCourses) },
      newValue: { completedCourses: normalized },
    });
    return res.status(200).json({ success: true, completedCourses: normalized });
  } catch (error) {
    console.error('setStudentCompletedCourses error:', error);
    return res.status(500).json({ message: L(req, 'Failed to update completed courses.', 'עדכון הקורסים שהושלמו נכשל.') });
  }
};
