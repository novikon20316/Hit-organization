import admin from 'firebase-admin'
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../config/firebase.js';
import { withinCoordinatorScope } from '../services/scopeAuthorization.js';

// Mirrors web/lib/roles.ts's PERMISSION_MAP: view_all_projects (cross-faculty,
// no ownership needed) vs. view_faculty_projects (same-faculty only) vs.
// view_own_project (supervisor/secondary_supervisor — ownership only, no
// blanket bypass). Keep in sync with projectController.ts's copy.
//
// administrative_secretary is deliberately NOT in FULL_ACCESS_ROLES despite
// being in view_all_projects there — that permission predates per-degree
// secretaries (one per major, e.g. data science vs. industrial engineering)
// and was never meant to mean "every faculty's every project." She's scoped
// below via withinCoordinatorScope to whichever facultyId/major(s) are
// actually assigned to her account (see CoordinatorScopesModal), same as the
// write endpoints in coordinatorController.ts already do for her.
const FULL_ACCESS_ROLES = [
  'coordinator', 'program_head', 'faculty_admin', 'grad_school_head', 'system_admin',
];
const FACULTY_SCOPED_ROLES = ['internal_examiner'];

// Static resource — same template for every masters-thesis student, so it's
// a hardcoded Cloudinary URL rather than a Firestore-backed upload flow.
const THESIS_TEMPLATE_URL =
  'https://res.cloudinary.com/dp7stlfas/raw/upload/v1783850174/thesis-templates/HIT_Masters_Thesis_Template.dotx';
const THESIS_TEMPLATE_FILENAME = 'HIT_Masters_Template.dotx';

export const getThesisTemplate = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
  return res.status(200).json({
    url: THESIS_TEMPLATE_URL,
    fileName: THESIS_TEMPLATE_FILENAME,
  });
};

export const getStudentProject = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const requester = req.user;
    if (!requester) return res.status(401).json({ message: 'Unauthorized.' });
    if (typeof id !== 'string' || !id) {
        return res.status(400).json({ message: 'Invalid or missing projectId' });
    }
    const projectDoc = await db.collection('projects').doc(id).get();

    if (!projectDoc.exists) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const data = projectDoc.data();
    const isOwnProject =
      data?.supervisorId === requester.uid ||
      data?.secondarySupervisorId === requester.uid ||
      (data?.enrolledStudentIds ?? []).includes(requester.uid);
    const hasFullAccess = FULL_ACCESS_ROLES.includes(requester.role);
    const hasFacultyAccess =
      FACULTY_SCOPED_ROLES.includes(requester.role) &&
      (requester.facultyId === 'all' || requester.facultyId === data?.facultyId);
    const hasSecretaryScopeAccess =
      requester.role === 'administrative_secretary' &&
      withinCoordinatorScope(requester, { facultyId: data?.facultyId ?? '', major: data?.major || undefined });
    if (!isOwnProject && !hasFullAccess && !hasFacultyAccess && !hasSecretaryScopeAccess) {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    return res.status(200).json({
      id: projectDoc.id,
      ...data,
      // Parse Firestore Timestamp to ISO string if needed by JSON client
      semesterStart: data?.semesterStart ? data.semesterStart.toDate().toISOString() : null,
    });
  } catch (error: any) {
    console.error('Error fetching student project:', error);
    return res.status(500).json({ error: error.message });
  }
};

