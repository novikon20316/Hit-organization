// src/controllers/studentContactsController.ts
//
// GET /api/milestones/:id/student-contacts — the students on one milestone,
// with the contact details the research-proposal / progress-report forms and
// the coordinator's recommendation form print for each teammate. Those forms
// used to read users/{uid} directly from Firestore; phone numbers now live
// server-only in users/{uid}/private/contact (services/privateContact.ts), so
// they come through here instead.
//
// Allowed: a student on that milestone (their own teammates), the project's
// supervisor/secondary supervisor, or staff whose scope covers the project.

import { Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { isValidDocId } from '../services/idValidation.js';
import { resolveMilestoneScope, withinCoordinatorScope } from '../services/scopeAuthorization.js';
import { isStaffMember } from '../services/twoFactorEnforcement.js';
import { getPrivateContacts } from '../services/privateContact.js';
import { L } from '../utils/localize.js';

export const getMilestoneStudentContacts = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid || !req.user) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  const milestoneId = String(req.params.id ?? '');
  if (!isValidDocId(milestoneId)) return res.status(400).json({ message: L(req, 'Invalid milestone.', 'אבן דרך לא תקינה.') });

  try {
    const mSnap = await db.collection('milestones').doc(milestoneId).get();
    const milestone = mSnap.data();
    if (!milestone) return res.status(404).json({ message: L(req, 'Milestone not found.', 'אבן הדרך לא נמצאה.') });
    const studentIds: string[] = (milestone.studentIds ?? []).filter((id: unknown) => typeof id === 'string' && isValidDocId(id));

    let allowed = studentIds.includes(uid);
    if (!allowed && isStaffMember(req.user.role, req.user.roles)) {
      const project = milestone.projectId
        ? (await db.collection('projects').doc(milestone.projectId).get()).data()
        : undefined;
      const scope = await resolveMilestoneScope(milestoneId);
      allowed = project?.supervisorId === uid
        || project?.secondarySupervisorId === uid
        || hasAnyRole(req.user, ['system_admin'])
        || (!!scope && (req.user.facultyId === 'all' || req.user.facultyId === scope.facultyId || withinCoordinatorScope(req.user, scope)));
    }
    if (!allowed) return res.status(403).json({ message: L(req, 'Forbidden.', 'הגישה נדחתה.') });

    const profileSnaps = studentIds.length
      ? await db.getAll(...studentIds.map((id) => db.collection('users').doc(id)))
      : [];
    const profiles = new Map(profileSnaps.map((s) => [s.id, s.data()] as const));
    const contacts = await getPrivateContacts(studentIds, new Map(profiles));
    const students = studentIds.map((id) => {
      const u = profiles.get(id) ?? {};
      return {
        uid: id,
        displayName: (u.displayName ?? '') as string,
        studentId: (u.studentId ?? null) as string | null,
        phoneNumber: contacts.get(id)?.phoneNumber ?? null,
        email: (u.email ?? null) as string | null,
        accumulatedCredits: typeof u.accumulatedCredits === 'number' ? u.accumulatedCredits : null,
      };
    });
    return res.status(200).json({ students });
  } catch (error) {
    console.error('getMilestoneStudentContacts error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load student details.', 'טעינת פרטי הסטודנטים נכשלה.') });
  }
};
