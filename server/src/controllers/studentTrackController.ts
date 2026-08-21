// src/controllers/studentTrackController.ts
//
// HTTP surface for a student's initial thesis/project track assignment — see
// services/studentTrack.ts. Distinct from trackChangeController.ts, which
// switches an already-enrolled project's track.

import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../config/firebase.js';
import { withinCoordinatorScope } from '../services/scopeAuthorization.js';
import {
  chooseStudentTrack,
  setThesisEligibility,
  adminOverrideStudentTrack,
  StudentTrackError,
} from '../services/studentTrack.js';

// Mirrors PROJECT_COORDINATOR_DASHBOARD_ROLES in projectCoordinatorController.ts
// plus 'coordinator' — the plain faculty coordinator role is who the business
// rule actually names as responsible for granting thesis eligibility, but
// isn't in that file's own allowlist (kept narrow there for unrelated
// endpoints — see that file's COORDINATOR_STATISTICS_ROLES for the same
// "add a scoped extra constant rather than widen the shared one" precedent).
const THESIS_ELIGIBILITY_ROLES = ['coordinator', 'administrative_secretary', 'faculty_admin', 'program_head', 'system_admin'];

export const chooseTrack = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
  if (req.user.role !== 'student') {
    return res.status(403).json({ message: 'Only a student may choose their own track.' });
  }
  const { track } = req.body;

  try {
    await chooseStudentTrack(req.user.uid, track, req.user.uid, req.user.role);
    return res.status(200).json({ success: true, track });
  } catch (error) {
    if (error instanceof StudentTrackError) {
      return res.status(400).json({ message: error.messageEn, messageHe: error.messageHe, messageEn: error.messageEn });
    }
    const message = error instanceof Error ? error.message : 'Failed to set track.';
    return res.status(400).json({ message });
  }
};

export const setStudentThesisEligibility = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
  if (!req.user.role || !THESIS_ELIGIBILITY_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden.' });
  }
  const { studentId } = req.params;
  const { eligible, reason } = req.body;
  if (typeof eligible !== 'boolean') {
    return res.status(400).json({ message: 'eligible must be a boolean.' });
  }
  if (!studentId || typeof studentId !== 'string') {
    return res.status(400).json({ message: 'Invalid studentId.' });
  }

  try {
    const studentSnap = await db.collection('users').doc(studentId).get();
    if (!studentSnap.exists || studentSnap.data()?.role !== 'student') {
      return res.status(404).json({ message: 'Student not found.' });
    }
    const studentData = studentSnap.data()!;
    if (!withinCoordinatorScope(req.user, { facultyId: studentData.facultyId ?? '', major: studentData.major || undefined })) {
      return res.status(403).json({ message: 'This student is outside your assigned scope.' });
    }

    await setThesisEligibility(studentId, eligible, reason, req.user.uid, req.user.role);
    return res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof StudentTrackError) {
      return res.status(400).json({ message: error.messageEn, messageHe: error.messageHe, messageEn: error.messageEn });
    }
    const message = error instanceof Error ? error.message : 'Failed to set thesis eligibility.';
    return res.status(400).json({ message });
  }
};

export const overrideStudentTrack = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
  if (req.user.role !== 'system_admin') {
    return res.status(403).json({ message: 'system_admin only.' });
  }
  const { id: studentId } = req.params;
  const { track, trackLocked, thesisEligible } = req.body;
  if (!studentId || typeof studentId !== 'string') {
    return res.status(400).json({ message: 'Invalid studentId.' });
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
    const message = error instanceof Error ? error.message : 'Failed to override track.';
    return res.status(400).json({ message });
  }
};
