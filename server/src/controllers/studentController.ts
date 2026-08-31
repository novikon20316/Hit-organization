import admin from 'firebase-admin'
import { Response } from 'express';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { db } from '../config/firebase.js';
import { withinCoordinatorScope, facultyIdMatches } from '../services/scopeAuthorization.js';
import {
  getMilestonesForTemplateId, getActiveMilestonesFor, deriveProcessType, resolveFirstStepMode,
  type WorkflowMilestoneSpec,
} from '../services/workflowTemplates.js';
import { computeProjectFinalGrade } from '../services/gradeEngine.js';
import { enrollStudentInProject } from '../services/projectEnrollment.js';
import { resolveEffectiveTrack } from '../config/studentTrack.js';

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
    const hasFullAccess = hasAnyRole(requester, FULL_ACCESS_ROLES);
    // Own faculty, an explicit 'all', or any extra faculty granted via
    // internalExaminerFacultyIds (see facultyIdMatches).
    const hasFacultyAccess =
      hasAnyRole(requester, FACULTY_SCOPED_ROLES) &&
      facultyIdMatches(requester, data?.facultyId ?? '', 'internalExaminerFacultyIds');
    const hasCoordinatorScopeAccess =
      hasAnyRole(requester, ['administrative_secretary']) &&
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

    // The project doc itself only rarely carries a denormalized
    // supervisorName (createSupervisorProject/createAdminProject never set
    // it) — every staff-facing project read already falls back to a lookup
    // by supervisorId when it's missing (see e.g. projectController.ts's
    // getInProgressProjects, adminController.ts's getAdminProjects). This
    // was the one student-facing read that didn't, so ActiveDashboard.tsx's
    // `{project.supervisorName}` (no fallback text, unlike BrowseProjects)
    // rendered blank for every student whose project never got that field.
    let supervisorName = data?.supervisorName || '';
    if (!supervisorName && data?.supervisorId) {
      const supDoc = await db.collection('users').doc(data.supervisorId).get();
      supervisorName = supDoc.data()?.displayName || supDoc.data()?.displayNameHe || 'Unknown Supervisor';
    }

    return res.status(200).json({
      id: projectDoc.id,
      ...data,
      supervisorName,
      // Parse Firestore Timestamp to ISO string if needed by JSON client
      semesterStart: data?.semesterStart ? data.semesterStart.toDate().toISOString() : null,
      overallFinalGrade,
    });
  } catch (error: any) {
    console.error('Error fetching student project:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ─── GET /api/student/first-step-mode ────────────────────────────────────────
// What a student with no active project should see first — browse/apply to
// individually-posted projects (today's only behavior) or browse/choose a
// supervisor instead — resolved from the approved workflow-template for this
// student's own facultyId+degreeType(+major). See
// services/workflowTemplates.ts's resolveFirstStepMode for the masters
// (msc_thesis vs msc_project) ambiguity handling.
export const getFirstStepMode = async (req: AuthenticatedRequest, res: Response) => {
  const studentId = req.user?.uid;
  if (!studentId) return res.status(401).json({ message: 'Unauthorized.' });

  try {
    const studentSnap = await db.collection('users').doc(studentId).get();
    const studentData = studentSnap.data() ?? {};
    const facultyId = studentData.facultyId;
    const degreeType = studentData.degreeType;

    if (!facultyId || (degreeType !== 'bachelors' && degreeType !== 'masters')) {
      // Incomplete profile — fall back to today's universal behavior rather
      // than blocking the student from seeing anything.
      return res.status(200).json({ firstStepMode: 'browse_projects', supervisorSelectionRequiresApproval: true });
    }

    const resolved = await resolveFirstStepMode(facultyId, degreeType, studentData.major ?? null);
    return res.status(200).json(resolved);
  } catch (error: any) {
    console.error('getFirstStepMode error:', error);
    return res.status(500).json({ message: 'Failed to resolve first-step mode.' });
  }
};

// ─── GET /api/student/browse-supervisors ─────────────────────────────────────
// Supervisor-grouped view of the same active/eligible projects
// GET /api/projects already exposes flat — for faculties whose approved
// template's firstStepMode is 'choose_supervisor'. Each supervisor's entry
// lists only their projects the student is actually eligible for (major,
// degree type, remaining capacity), same checks applyApplication itself
// re-enforces as the real access-control boundary.
export const getBrowseSupervisors = async (req: AuthenticatedRequest, res: Response) => {
  const studentId = req.user?.uid;
  if (!studentId) return res.status(401).json({ message: 'Unauthorized.' });

  try {
    const studentSnap = await db.collection('users').doc(studentId).get();
    const studentData = studentSnap.data() ?? {};
    const facultyId = studentData.facultyId;
    const degreeType = studentData.degreeType;
    if (!facultyId || !degreeType) {
      return res.status(400).json({ message: 'Your profile is missing a faculty or degree type.' });
    }

    const projectsSnap = await db.collection('projects')
      .where('facultyId', '==', facultyId)
      .where('status', '==', 'active')
      .where('degreeTypes', 'array-contains', degreeType)
      .get();

    const effectiveTrack = resolveEffectiveTrack(studentData);
    const eligibleProjects = projectsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .filter((p) => {
        if (p.isArchived) return false; // see services/projectErasure.ts
        if (p.major && studentData.major !== p.major) return false;
        // A student's thesis/project track is fixed (see config/studentTrack.ts).
        const types: string[] = p.projectTypes ?? (p.projectType ? [p.projectType] : []);
        if (types.length > 0 && !types.includes(effectiveTrack)) return false;
        const capacity = p.maxStudents ?? p.NumberOfStudents ?? 1;
        const enrolledCount = (p.enrolledStudentIds ?? []).length;
        return enrolledCount < capacity;
      });

    const supervisorIds = [...new Set(eligibleProjects.map((p) => p.supervisorId).filter(Boolean))];
    const supervisorSnaps = await Promise.all(supervisorIds.map((uid) => db.collection('users').doc(uid).get()));
    const supervisorNames: Record<string, string> = {};
    supervisorSnaps.forEach((snap) => {
      if (snap.exists) supervisorNames[snap.id] = snap.data()?.displayName ?? snap.data()?.displayNameHe ?? 'Unknown';
    });

    const bySupervisor: Record<string, {
      supervisorId: string; supervisorName: string;
      projects: Array<{
        id: string; titleHe: string; titleEn: string; descriptionHe: string; descriptionEn: string;
        projectTypes: string[]; major: string | null; remainingCapacity: number;
      }>;
    }> = {};

    eligibleProjects.forEach((p) => {
      const supervisorId: string | undefined = p.supervisorId;
      if (!supervisorId) return;
      if (!bySupervisor[supervisorId]) {
        bySupervisor[supervisorId] = {
          supervisorId,
          supervisorName: supervisorNames[supervisorId] ?? 'Unknown',
          projects: [],
        };
      }
      const capacity = p.maxStudents ?? p.NumberOfStudents ?? 1;
      bySupervisor[supervisorId].projects.push({
        id: p.id,
        titleHe: p.titleHe ?? '',
        titleEn: p.titleEn ?? '',
        descriptionHe: p.descriptionHe ?? '',
        descriptionEn: p.descriptionEn ?? '',
        projectTypes: p.projectTypes ?? (p.projectType ? [p.projectType] : []),
        major: p.major ?? null,
        remainingCapacity: capacity - (p.enrolledStudentIds ?? []).length,
      });
    });

    return res.status(200).json({ supervisors: Object.values(bySupervisor) });
  } catch (error: any) {
    console.error('getBrowseSupervisors error:', error);
    return res.status(500).json({ message: 'Failed to load supervisors.' });
  }
};

// ─── POST /api/student/join-project-direct ───────────────────────────────────
// Self-service mirror of adminController.ts's enrollStudentAdmin — no
// application record, no supervisor approval step. Only usable when the
// student's own faculty+degree resolved to firstStepMode 'choose_supervisor'
// with supervisorSelectionRequiresApproval === false; re-checked here (never
// trusted from the client) so this can't be used to bypass approval for a
// faculty/degree that requires it.
export const joinProjectDirect = async (req: AuthenticatedRequest, res: Response) => {
  const studentId = req.user?.uid;
  if (!studentId) return res.status(401).json({ message: 'Unauthorized.' });
  const { projectId } = req.body;
  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ message: 'projectId is required.' });
  }

  try {
    const [projectSnap, studentSnap] = await Promise.all([
      db.collection('projects').doc(projectId).get(),
      db.collection('users').doc(studentId).get(),
    ]);
    if (!projectSnap.exists) return res.status(404).json({ message: 'Project not found.' });

    const projectData = projectSnap.data()!;
    const studentData = studentSnap.data() ?? {};

    if (studentData.hasActiveProject) {
      return res.status(400).json({ message: 'You already have an active project.' });
    }

    const degreeType = studentData.degreeType;
    if (degreeType !== 'bachelors' && degreeType !== 'masters') {
      return res.status(400).json({ message: 'Your profile is missing a valid degree type.' });
    }

    const mode = await resolveFirstStepMode(studentData.facultyId ?? projectData.facultyId, degreeType, studentData.major ?? null);
    if (mode.firstStepMode !== 'choose_supervisor' || mode.supervisorSelectionRequiresApproval) {
      return res.status(403).json({ message: 'Direct enrollment is not enabled for your faculty/degree — please apply instead.' });
    }

    if (projectData.isArchived || (projectData.status && projectData.status !== 'active')) {
      return res.status(400).json({ message: 'This project is no longer accepting students.' });
    }
    if (projectData.major && studentData.major !== projectData.major) {
      return res.status(403).json({ message: 'This project is not open to your major.' });
    }
    const projectDegreeTypes: string[] = projectData.degreeTypes ?? (projectData.degreeType ? [projectData.degreeType] : []);
    if (projectDegreeTypes.length > 0 && !projectDegreeTypes.includes(degreeType)) {
      return res.status(403).json({ message: 'This project is not open to your degree type.' });
    }
    const capacity = projectData.maxStudents ?? projectData.NumberOfStudents ?? 1;
    const enrolledCount = (projectData.enrolledStudentIds ?? []).length;
    if (enrolledCount >= capacity) {
      return res.status(400).json({ message: 'This project has already reached its student capacity.' });
    }

    await enrollStudentInProject(projectId, studentId, projectData.supervisorId, projectData.facultyId);

    return res.status(200).json({ success: true, message: 'Enrolled successfully.' });
  } catch (error: any) {
    console.error('joinProjectDirect error:', error);
    return res.status(500).json({ message: 'Failed to join project.' });
  }
};

