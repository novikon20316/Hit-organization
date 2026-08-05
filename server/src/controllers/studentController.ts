import admin from 'firebase-admin'
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../config/firebase.js';
import { withinCoordinatorScope, facultyIdMatches } from '../services/scopeAuthorization.js';
import {
  getMilestonesForTemplateId, getActiveMilestonesFor, deriveProcessType,
  type WorkflowMilestoneSpec,
} from '../services/workflowTemplates.js';
import { computeProjectFinalGrade } from '../services/gradeEngine.js';

// Mirrors web/lib/roles.ts's PERMISSION_MAP: view_all_projects (cross-faculty,
// no ownership needed) vs. view_faculty_projects (same-faculty only) vs.
// view_own_project (supervisor/secondary_supervisor — ownership only, no
// blanket bypass). Keep in sync with projectController.ts's copy.
//
// administrative_secretary is deliberately NOT in FULL_ACCESS_ROLES despite
// being in view_all_projects there — that permission predates per-degree
// coordinators (one per major, e.g. data science vs. industrial engineering)
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
    // Own faculty, an explicit 'all', or any extra faculty granted via
    // internalExaminerFacultyIds (see facultyIdMatches).
    const hasFacultyAccess =
      FACULTY_SCOPED_ROLES.includes(requester.role) &&
      facultyIdMatches(requester, data?.facultyId ?? '', 'internalExaminerFacultyIds');
    const hasCoordinatorScopeAccess =
      requester.role === 'administrative_secretary' &&
      withinCoordinatorScope(requester, { facultyId: data?.facultyId ?? '', major: data?.major || undefined });
    if (!isOwnProject && !hasFullAccess && !hasFacultyAccess && !hasCoordinatorScopeAccess) {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    // Weighted final grade across every milestone, by the project's own
    // workflow template — same resolution chain as
    // supervisorController.ts's getSupervisorProjectDetail (an explicit
    // workflowTemplateRefs entry for this project's track first, else the
    // faculty's currently-active template for legacy projects). null until
    // every nonzero-weighted milestone is graded — see gradeEngine.ts's
    // computeProjectFinalGrade.
    const workflowTemplateRefs: { degreeType: string; projectType: string; templateId: string }[] = data?.workflowTemplateRefs ?? [];
    const matchingRef = workflowTemplateRefs.find(
      (r) => r.degreeType === data?.degreeType && r.projectType === data?.projectType
    );
    let templateMilestones: WorkflowMilestoneSpec[] = [];
    if (matchingRef) {
      const resolved = await getMilestonesForTemplateId(matchingRef.templateId);
      if (resolved) templateMilestones = resolved.milestones;
    }
    if (templateMilestones.length === 0) {
      const processType = deriveProcessType(data?.degreeType, data?.projectType);
      const resolved = await getActiveMilestonesFor(data?.facultyId, processType, data?.major ?? null);
      templateMilestones = resolved.milestones;
    }
    const milestonesSnap = await db.collection('milestones').where('projectId', '==', id).get();
    const actualMilestones = milestonesSnap.docs.map((d) => d.data() as { type: string; finalGrade?: number | null });
    const overallFinalGrade = computeProjectFinalGrade(templateMilestones, actualMilestones);

    return res.status(200).json({
      id: projectDoc.id,
      ...data,
      // Parse Firestore Timestamp to ISO string if needed by JSON client
      semesterStart: data?.semesterStart ? data.semesterStart.toDate().toISOString() : null,
      overallFinalGrade,
    });
  } catch (error: any) {
    console.error('Error fetching student project:', error);
    return res.status(500).json({ error: error.message });
  }
};

