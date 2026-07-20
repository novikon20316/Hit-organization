// src/controllers/gradeHistoryController.ts
//
// Read-only grade history over the existing `grades` + `auditLog` collections
// (both already written on every grade submission/change/approval — see
// projectController.ts's submitMilestoneGrade/submitIndividualGrade and
// gradSchoolHeadController.ts's approveFinalGrade). Nothing new is written
// here; this just surfaces what's already tracked.

import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../config/firebase.js';

// Mirrors projectController.ts's STAFF_ROLES / studentController.ts's STAFF_ROLES.
const STAFF_ROLES = [
  'supervisor', 'secondary_supervisor', 'coordinator', 'administrative_secretary',
  'program_head', 'internal_examiner', 'faculty_admin', 'grad_school_head', 'system_admin',
];

const GRADE_AUDIT_ACTIONS = ['grade_entered', 'grade_changed', 'final_grade_approved'];

function serializeTimestamp(value: any): string | null {
  return value?.toDate?.().toISOString?.() ?? null;
}

/**
 * GET /api/grades/history/:projectId
 * Per-milestone grade submissions (from `grades`) interleaved with the
 * matching audit-log entries (from `auditLog`), for the project's own
 * student(s)/supervisor or any staff role.
 */
export const getProjectGradeHistory = async (req: AuthenticatedRequest, res: Response) => {
  const requester = req.user;
  const { projectId } = req.params;
  if (!requester) return res.status(401).json({ message: 'Unauthorized.' });
  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ message: 'Invalid projectId' });
  }

  try {
    const projectSnap = await db.collection('projects').doc(projectId).get();
    if (!projectSnap.exists) return res.status(404).json({ message: 'Project not found' });
    const project = projectSnap.data()!;

    const isOwnProject =
      project.supervisorId === requester.uid ||
      (project.enrolledStudentIds ?? []).includes(requester.uid);
    if (!isOwnProject && !STAFF_ROLES.includes(requester.role)) {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    const milestonesSnap = await db.collection('milestones')
      .where('projectId', '==', projectId)
      .get();

    if (milestonesSnap.empty) {
      return res.status(200).json({ milestones: [] });
    }

    const milestoneIds = milestonesSnap.docs.map((d) => d.id);

    const [gradesSnap, auditSnap] = await Promise.all([
      db.collection('grades').where('projectId', '==', projectId).get(),
      // Firestore allows only one 'in' clause per query, and 'entityId' is
      // the selective one — filter `action` down to GRADE_AUDIT_ACTIONS in
      // memory below instead of stacking a second 'in'. Caps at 30 ids,
      // which this app's per-project milestone count never approaches.
      db.collection('auditLog')
        .where('entityType', '==', 'milestone')
        .where('entityId', 'in', milestoneIds)
        .get(),
    ]);

    const gradesByMilestone = new Map<string, any[]>();
    for (const doc of gradesSnap.docs) {
      const g = doc.data();
      const list = gradesByMilestone.get(g.milestoneId) ?? [];
      list.push({
        id: doc.id,
        graderId: g.graderId,
        graderRole: g.graderRole,
        comments: g.comments ?? '',
        isFinalized: g.isFinalized ?? false,
        submittedAt: serializeTimestamp(g.submittedAt),
        grading: g.grading ?? null,
      });
      gradesByMilestone.set(g.milestoneId, list);
    }

    const auditByMilestone = new Map<string, any[]>();
    for (const doc of auditSnap.docs) {
      const a = doc.data();
      if (!GRADE_AUDIT_ACTIONS.includes(a.action)) continue;
      const list = auditByMilestone.get(a.entityId) ?? [];
      list.push({
        id: doc.id,
        action: a.action,
        userId: a.userId,
        userRole: a.userRole,
        oldValue: a.oldValue ?? null,
        newValue: a.newValue ?? null,
        explanation: a.explanation ?? null,
        timestamp: serializeTimestamp(a.timestamp),
      });
      auditByMilestone.set(a.entityId, list);
    }

    const milestones = milestonesSnap.docs.map((doc) => {
      const m = doc.data();
      const grades = (gradesByMilestone.get(doc.id) ?? [])
        .sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''));
      const auditTrail = (auditByMilestone.get(doc.id) ?? [])
        .sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));

      return {
        milestoneId: doc.id,
        type: m.type ?? null,
        status: m.status ?? null,
        finalGrade: m.finalGrade ?? null,
        finalGradeByStudent: m.finalGradeByStudent ?? null,
        gradeApproved: m.gradeApproved ?? false,
        gradeApprovedBy: m.gradeApprovedBy ?? null,
        gradeApprovedAt: serializeTimestamp(m.gradeApprovedAt),
        grades,
        auditTrail,
      };
    });

    return res.status(200).json({ milestones });
  } catch (error) {
    console.error('getProjectGradeHistory error:', error);
    return res.status(500).json({ message: 'Failed to load grade history' });
  }
};
