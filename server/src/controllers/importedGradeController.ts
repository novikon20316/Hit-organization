// src/controllers/importedGradeController.ts
//
// POST /api/milestones/:milestoneId/imported-grade  { grade, comment? }
//
// Grade for a milestone the student finished BEFORE being brought into the
// system (importedAsDone — see services/importedStudentPlacement.ts and
// projectEnrollment.ts's ImportedProgress). Such a milestone is already
// closed as approved, past every chain stage, so the normal grading flow
// (submitMilestoneGrade) never applies to it; this sets the grade directly.
// Allowed for the project's supervisor / secondary supervisor, and for a
// coordinator / administrative coordinator whose scope covers it (and
// system_admin). Re-entering overwrites it (to fix a typo); every change is
// audit-logged with the previous value.

import { Response } from 'express';
import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { L } from '../utils/localize.js';
import { isValidDocId } from '../services/idValidation.js';
import { resolveMilestoneScope, withinCoordinatorScope } from '../services/scopeAuthorization.js';
import { logAuditEvent } from '../services/auditLog.js';

const COORDINATOR_ROLES = ['coordinator', 'administrative_secretary', 'system_admin'];

export const setImportedMilestoneGrade = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'גישה לא מורשית.') });
  const { milestoneId } = req.params;
  if (!isValidDocId(milestoneId)) return res.status(400).json({ message: L(req, 'Invalid milestoneId', 'מזהה אבן הדרך אינו תקין.') });

  const grade = Number(req.body?.grade);
  if (req.body?.grade === '' || req.body?.grade == null || !Number.isFinite(grade) || grade < 0 || grade > 100) {
    return res.status(400).json({ message: L(req, 'Grade must be a number from 0 to 100.', 'הציון חייב להיות מספר בין 0 ל-100.') });
  }
  const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim().slice(0, 2000) : '';

  try {
    const ref = db.collection('milestones').doc(milestoneId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ message: L(req, 'Milestone not found', 'אבן הדרך לא נמצאה.') });
    const m = snap.data()!;
    if (!m.importedAsDone) {
      return res.status(400).json({ message: L(req, 'This milestone is graded through its normal workflow.', 'אבן דרך זו מקבלת ציון בתהליך הרגיל שלה.') });
    }

    // Supervisor of the project, or a coordinator-level role in scope —
    // checked against roles[] too, not only the primary role.
    const roles = [req.user?.role, ...(req.user?.roles ?? [])].filter(Boolean) as string[];
    const isOwnSupervisor = m.supervisorId === uid || m.secondarySupervisorId === uid;
    let allowed = isOwnSupervisor;
    if (!allowed && roles.some((r) => COORDINATOR_ROLES.includes(r))) {
      const scope = await resolveMilestoneScope(milestoneId);
      allowed = !!scope && withinCoordinatorScope(req.user, scope);
    }
    if (!allowed) return res.status(403).json({ message: L(req, 'Not allowed to grade this milestone.', 'אין הרשאה להזין ציון לאבן דרך זו.') });

    const previous = m.finalGrade ?? null;
    await ref.update({
      finalGrade: grade,
      supervisorScore: grade,
      importedGrade: {
        enteredBy: uid,
        enteredByName: req.user?.displayName ?? null,
        enteredAt: admin.firestore.FieldValue.serverTimestamp(),
        comment,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await logAuditEvent({
      userId: uid,
      userRole: req.user?.role ?? 'unknown',
      action: 'imported_milestone_grade_set',
      entityType: 'milestone',
      entityId: milestoneId,
      oldValue: { finalGrade: previous },
      newValue: { finalGrade: grade, comment },
      explanation: 'Grade entered for a milestone finished before the student was brought into the system.',
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('setImportedMilestoneGrade error:', error);
    return res.status(500).json({ message: L(req, 'Failed to save the grade.', 'שמירת הציון נכשלה.') });
  }
};
