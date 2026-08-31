import { Response } from 'express';
import admin from 'firebase-admin';
import { v2 as cloudinary } from 'cloudinary';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { majorsForFaculty } from '../config/majors.js';
import { notifyUser } from '../services/notify.js';
import { resolveStaffForScope, withinCoordinatorScope } from '../services/scopeAuthorization.js';
import { targetScreenFor } from '../services/notificationTargets.js';
import { logAuditEvent } from '../services/auditLog.js';
import {
  resolveWorkflowTemplateRefs, DEGREE_TYPE_ORDER, PROJECT_TYPE_ORDER,
  getMilestonesForTemplateId, getActiveMilestonesFor, deriveProcessType,
  resolveFinalGradeSignoffRole, resolveMilestoneOrder,
  type WorkflowMilestoneSpec, type FormFieldSpec,
} from '../services/workflowTemplates.js';
import { computeProjectFinalGrade } from '../services/gradeEngine.js';
import { normalizePrerequisites } from '../services/prerequisites.js';

const db = admin.firestore();

// ─── Push notification helper ─────────────────────────────────────────────────
async function sendPushNotification(token: string, title: string, body: string, data: any = {}) {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ to: token, title, body, data }),
    });
  } catch (err) {
    console.error('Push notification failed:', err);
  }
}

// ─── Firestore notification helper ───────────────────────────────────────────
async function createNotification({
  recipientId, type, titleHe, titleEn, bodyHe, bodyEn, relatedProjectId = null, relatedMilestoneId = null,
}: {
  recipientId: string; type: string;
  titleHe: string; titleEn: string;
  bodyHe: string;  bodyEn: string;
  relatedProjectId?:   string | null;
  relatedMilestoneId?: string | null;
}) {
  // Self-guarded like sendPushNotification above — a notification failure
  // must never mask a primary write (grade/update/delete/decision) that has
  // already committed by the time this is called.
  try {
    await db.collection('notifications').add({
      recipientId, type, titleHe, titleEn, bodyHe, bodyEn,
      relatedProjectId, relatedMilestoneId,
      isRead:    false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('createNotification failed:', err);
  }
}

// ─── Get push token for a user ────────────────────────────────────────────────
async function getUserPushToken(uid: string): Promise<string | null> {
  const snap = await db.collection('users').doc(uid).get();
  return snap.data()?.expoPushToken ?? null;
}

// Firestore's `in` operator caps at 30 values per query — chunk to stay
// under that for a supervisor with a large caseload.
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Same "done" convention used elsewhere (e.g. projectCoordinatorController.ts)
// for resolving a project's current, still-open milestone — used below to
// fold the old standalone Deadlines tab's info directly into each project
// card instead. Ordering itself comes from resolveMilestoneOrder (each
// milestone doc's own `order`, from the template it was created under).
const DONE_MILESTONE_STATUSES = new Set(['coordinator_approved', 'completed']);
const DAY_MS = 24 * 60 * 60 * 1000;

// ─── GET /api/supervisor/dashboard ───────────────────────────────────────────
// CRITICAL FIX: every query here used to filter on `supervisorId` only, so a
// secondary_supervisor's dashboard was permanently empty — projects,
// applications, and pending grades all exist under the primary supervisor's
// uid, never a secondarySupervisorId field on applications/milestones (only
// the project doc itself carries that field). Projects are now fetched by
// EITHER field and merged; applications/milestones are then queried by the
// resulting project id list, since those two collections never had a
// secondarySupervisorId field to filter on directly.
export const getSupervisorDashboard = async (req: AuthenticatedRequest, res: Response) => {
  const supervisorId = req.user?.uid;
  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized access.' });

  try {
    const userSnap = await db.collection('users').doc(supervisorId).get();
    const userData = userSnap.data() ?? {};

    const [asPrimarySnap, asSecondarySnap] = await Promise.all([
      db.collection('projects').where('supervisorId', '==', supervisorId).get(),
      db.collection('projects').where('secondarySupervisorId', '==', supervisorId).get(),
    ]);
    const seenProjectIds = new Set<string>();
    const projectDocs = [...asPrimarySnap.docs, ...asSecondarySnap.docs].filter((doc) => {
      if (seenProjectIds.has(doc.id)) return false;
      if (doc.data().isArchived) return false; // archived — see services/projectErasure.ts
      seenProjectIds.add(doc.id);
      return true;
    });
    const myProjectIds = [...seenProjectIds];

    const applicationChunks = myProjectIds.length
      ? await Promise.all(chunk(myProjectIds, 30).map((ids) => db.collection('applications').where('projectId', 'in', ids).get()))
      : [];
    // Not filtered to a single status — the Applications tab's status
    // filter (Approved / Set-Meeting / Rejected / All) needs every
    // application for this supervisor's projects, not just open ones.
    const applications = applicationChunks
      .flatMap((snap) => snap.docs)
      .map((doc) => ({ id: doc.id, ...doc.data() }));

    // Unfiltered — shared below by pendingGrades (status === 'submitted') AND
    // each project's own currentMilestone due-date info (any status), so
    // both are derived from one Firestore read instead of two.
    const milestoneChunks = myProjectIds.length
      ? await Promise.all(chunk(myProjectIds, 30).map((ids) => db.collection('milestones').where('projectId', 'in', ids).get()))
      : [];
    const allMilestoneDocs = milestoneChunks.flatMap((snap) => snap.docs);
    const milestoneDocs = allMilestoneDocs.filter((doc) => doc.data().status === 'submitted');

    const milestonesByProjectId: Record<string, any[]> = {};
    allMilestoneDocs.forEach((doc) => {
      const data = doc.data();
      (milestonesByProjectId[data.projectId] ??= []).push({ id: doc.id, ...data });
    });

    // Resolve enrolled-student display info once for every project at once —
    // this is what used to live on the standalone Deadlines tab (student
    // name/degree/year), now folded directly into each project card instead.
    const enrolledStudentIds = [...new Set(projectDocs.flatMap((doc) => doc.data().enrolledStudentIds ?? []))];
    const studentSnaps = enrolledStudentIds.length
      ? await Promise.all(enrolledStudentIds.map((id) => db.collection('users').doc(id as string).get()))
      : [];
    const studentInfoById: Record<string, { name: string; degreeType: string | null; yearOfStudy: number | null }> = {};
    studentSnaps.forEach((snap) => {
      if (!snap.exists) return;
      const data = snap.data()!;
      studentInfoById[snap.id] = {
        name:        data.displayName ?? data.displayNameHe ?? '',
        degreeType:  data.degreeType  ?? null,
        yearOfStudy: data.yearOfStudy ?? null,
      };
    });

    const now = Date.now();

    const myProjects = projectDocs.map(doc => {
      const data = doc.data();
      const projectMilestones = (milestonesByProjectId[doc.id] ?? [])
        .slice()
        .sort((a, b) => resolveMilestoneOrder(a) - resolveMilestoneOrder(b));
      // The first not-yet-done milestone, in template order — mirrors
      // getProjectCoordinatorDashboard's own "current milestone" resolution.
      // Fully-done projects (or ones with no milestones yet, e.g. no student
      // enrolled) get no currentMilestone at all — there's no meaningful due
      // date left to color-code.
      const current = projectMilestones.find((m) => !DONE_MILESTONE_STATUSES.has(m.status)) ?? null;

      let currentMilestone: {
        nameHe: string; nameEn: string; type: string;
        dueDate: string | null; daysLeft: number | null;
        urgency: 'green' | 'orange' | 'red' | null;
      } | null = null;

      if (current) {
        const dueDate = current.dueDate?.toDate?.() ?? null;
        const daysLeft = dueDate ? Math.ceil((dueDate.getTime() - now) / DAY_MS) : null;
        // green: more than a week left · orange: 1-7 days left · red: due
        // today or already past due — see the supervisor dashboard's project
        // card border color.
        const urgency: 'green' | 'orange' | 'red' | null =
          daysLeft === null ? null : daysLeft > 7 ? 'green' : daysLeft >= 1 ? 'orange' : 'red';
        currentMilestone = {
          nameHe: current.nameHe ?? current.type,
          nameEn: current.nameEn ?? current.type,
          type:   current.type,
          dueDate: dueDate ? dueDate.toISOString() : null,
          daysLeft,
          urgency,
        };
      }

      return {
        id:                 doc.id,
        titleHe:            data.titleHe            ?? '',
        titleEn:            data.titleEn            ?? '',
        descriptionHe:      data.descriptionHe      ?? '',
        descriptionEn:      data.descriptionEn      ?? '',
        facultyId:          data.facultyId          ?? '',
        status:             data.status             ?? '',
        degreeType:         data.degreeType         ?? '',
        projectType:        data.projectType        ?? '',
        academicYear:       data.academicYear       ?? '',
        applicationIds:     data.applicationIds     ?? [],
        enrolledStudentIds: data.enrolledStudentIds ?? [],
        NumberOfStudents:   data.maxStudents        ?? data.NumberOfStudents ?? 1,
        requiredSkills:     data.requiredSkills     ?? [],
        projectFileUrl:     data.projectFileUrl     ?? null,
        enrolledStudents: (data.enrolledStudentIds ?? []).map((sid: string) => ({
          id: sid,
          name: studentInfoById[sid]?.name ?? '',
          degreeType: studentInfoById[sid]?.degreeType ?? null,
          yearOfStudy: studentInfoById[sid]?.yearOfStudy ?? null,
        })),
        currentMilestone,
      };
    });

    const pendingGrades = milestoneDocs.map(doc => {
      const data = doc.data();
      return {
        id:             doc.id,
        projectId:      data.projectId      ?? '',
        projectTitleHe: data.projectTitleHe ?? '',
        projectTitleEn: data.projectTitleEn ?? '',
        type:           data.type           ?? '',
        status:         data.status         ?? '',
        studentNames:   data.studentNames   ?? [],
        // Needed so a caller can submit a per-student individual grade
        // component (POST /api/projects/milestones/:id/individual-grade,
        // see projectController.ts's submitIndividualGrade) — mobile gets
        // this today via its own direct Firestore listener instead of this
        // endpoint; added here so the web port has a real id to submit
        // against too, without duplicating that Firestore read client-side.
        studentIds:     data.studentIds     ?? [],
        fileUrls:       data.fileUrls       ?? [],
        submissionNote: data.submissionNote ?? '',
        facultyId:      data.facultyId      ?? '',
        // Per-milestone configured grading rubric (see workflowTemplates.ts's
        // GradingComponentSpec) — empty means GradeMilestoneModal falls back
        // to its hardcoded default rubric.
        gradingComponents: data.gradingComponents ?? [],
        dueDate:        data.dueDate?.toDate?.()?.toISOString()     ?? null,
        submittedAt:    data.submittedAt?.toDate?.()?.toISOString() ?? null,
      };
    });

    return res.status(200).json({
      success: true,
      supervisorId,
      supervisorName: userData.displayNameHe ?? userData.displayNameEn ?? '',
      facultyId:      userData.facultyId ?? '',
      myProjects,
      applications,
      pendingGrades,
    });
  } catch (error: any) {
    console.error('getSupervisorDashboard error:', error);
    return res.status(500).json({ message: 'Failed to compile supervisor dashboard data.' });
  }
};

// ─── GET /api/supervisor/projects/:id/detail ─────────────────────────────────
// Powers the "view workflow" modal — the project's resolved template
// milestone list (names, due-date mode, examiner/rubric config) plus each
// enrolled student's own submission status per milestone type. Milestone
// docs are already 1:1 per student (see projectEnrollment.ts — nothing ever
// pushes a second student into an existing milestone doc's studentIds), so
// grouping by studentIds.includes(studentId) is exact, not an approximation.
export const getSupervisorProjectDetail = async (req: AuthenticatedRequest, res: Response) => {
  const supervisorId = req.user?.uid;
  const { id: projectId } = req.params;
  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized.' });
  if (!projectId || typeof projectId !== 'string') return res.status(400).json({ message: 'Invalid projectId.' });

  try {
    const projectSnap = await db.collection('projects').doc(projectId).get();
    if (!projectSnap.exists) return res.status(404).json({ message: 'Project not found.' });
    const project = projectSnap.data()!;
    if (project.supervisorId !== supervisorId && project.secondarySupervisorId !== supervisorId) {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    // Resolve the template this project is running on — same fallback chain
    // as projectEnrollment.ts: an explicit workflowTemplateRefs entry for the
    // project's own track first, else the faculty's currently-active template
    // (covers legacy projects created before workflowTemplateRefs existed).
    const workflowTemplateRefs: { degreeType: string; projectType: string; templateId: string }[] = project.workflowTemplateRefs ?? [];
    const matchingRef = workflowTemplateRefs.find(
      (r) => r.degreeType === project.degreeType && r.projectType === project.projectType
    );
    let templateMilestones: WorkflowMilestoneSpec[] = [];
    if (matchingRef) {
      const resolved = await getMilestonesForTemplateId(matchingRef.templateId);
      if (resolved) templateMilestones = resolved.milestones;
    }
    if (templateMilestones.length === 0) {
      const processType = deriveProcessType(project.degreeType, project.projectType);
      const resolved = await getActiveMilestonesFor(project.facultyId, processType, project.major ?? null);
      templateMilestones = resolved.milestones;
    }

    // Per-student submission status.
    const enrolledStudentIds: string[] = project.enrolledStudentIds ?? [];
    const [milestonesSnap, studentSnaps] = await Promise.all([
      db.collection('milestones').where('projectId', '==', projectId).get(),
      Promise.all(enrolledStudentIds.map((sid) => db.collection('users').doc(sid).get())),
    ]);
    const allMilestones = milestonesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, any>));

    // A milestone's real due date is computed once at enrollment (see
    // projectEnrollment.ts's resolveMilestoneDueDate) from the actual
    // approval/enrollment date, not from the template's own dueDaysFromStart
    // — and since a team project now shares one milestone doc per type
    // across every teammate, there's exactly one real due date per type for
    // the whole project, not one per student. Attached to templateMilestones
    // below so the supervisor's "this template's milestones" overview can
    // show it instead of a relative day-offset (that overview is the only
    // place a supervisor sees the FULL roadmap — the per-student list below
    // it only ever renders up to the student's current milestone).
    const dueDateByType: Record<string, string | null> = {};
    allMilestones.forEach((m) => {
      if (m.type && !(m.type in dueDateByType)) {
        dueDateByType[m.type] = m.dueDate?.toDate?.()?.toISOString() ?? null;
      }
    });

    const studentNameById: Record<string, string> = {};
    studentSnaps.forEach((s) => { if (s.exists) studentNameById[s.id] = s.data()?.displayName ?? s.id; });

    const students = enrolledStudentIds.map((studentId) => {
      const studentMilestones = allMilestones.filter((m) => Array.isArray(m.studentIds) && m.studentIds.includes(studentId));
      const milestonesByType: Record<string, Record<string, any>> = {};
      studentMilestones.forEach((m) => { milestonesByType[m.type] = m; });
      // Weighted across every milestone by the template's own
      // percentOfFinalGrade — see gradeEngine.ts's computeProjectFinalGrade.
      // null until every nonzero-weighted milestone is graded.
      const overallFinalGrade = computeProjectFinalGrade(
        templateMilestones,
        studentMilestones as { type: string; finalGrade?: number | null }[]
      );
      return {
        studentId,
        studentName: studentNameById[studentId] ?? studentId,
        overallFinalGrade,
        // Every template milestone gets a row even if this student's doc
        // hasn't been created yet ('not_created' — distinct from 'pending',
        // which means the doc exists but nothing's been submitted).
        milestones: templateMilestones.map((spec) => {
          const m = milestonesByType[spec.type];
          return {
            id: m?.id ?? null,
            type: spec.type,
            status: (m?.status as string | undefined) ?? 'not_created',
            dueDate: m?.dueDate?.toDate?.()?.toISOString() ?? null,
            submittedAt: m?.submittedAt?.toDate?.()?.toISOString() ?? null,
            // The student's submitted files/note for this milestone — lets
            // the supervisor preview/download them straight from the
            // project card instead of a separate Grading tab.
            fileUrls: m?.fileUrls ?? [],
            submissionNote: m?.submissionNote ?? '',
            // Staff-record config (research_proposal/progress_report only —
            // see workflowTemplates.ts's staffRecordMode) and its current
            // submission, if any.
            staffRecordMode: m?.staffRecordMode ?? null,
            staffRecordSubmitted: !!m?.staffRecord,
            // Three-rubric final-grade workflow state (defense only — see
            // workflowTemplates.ts's finalGradeComponents). Lets the UI
            // decide what to show (evaluation form vs. approve/override vs.
            // "awaiting coordinator") without a separate round trip.
            hasFinalGradeComponents: !!m?.finalGradeComponents,
            supervisorEvaluationSubmitted: !!m?.supervisorEvaluation,
            autoCalculatedFinalGrade: m?.autoCalculatedFinalGrade ?? null,
            finalGrade: m?.finalGrade ?? null,
            // The supervisor's own last-submitted score — distinct from
            // finalGrade (which may blend in examiner scores) — so the
            // "Update grade" modal can prefill and PATCH the right value.
            supervisorScore: m?.supervisorScore ?? null,
            gradeApproved: !!m?.gradeApproved,
            gradeOverrideStatus: m?.gradeOverride?.status ?? null,
          };
        }),
      };
    });

    return res.status(200).json({
      templateMilestones: templateMilestones.map((spec) => ({ ...spec, dueDate: dueDateByType[spec.type] ?? null })),
      students,
      createdAt: project.createdAt?.toDate?.()?.toISOString() ?? null,
    });
  } catch (error: any) {
    console.error('getSupervisorProjectDetail error:', error);
    return res.status(500).json({ message: 'Failed to load project workflow detail.' });
  }
};

// ─── POST /api/supervisor/projects ───────────────────────────────────────────
export const createSupervisorProject = async (req: AuthenticatedRequest, res: Response) => {
  const supervisorId = req.user?.uid;
  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized access.' });
  // Checking only req.user.role missed anyone holding 'supervisor' as an
  // ADDITIONAL role rather than their primary one (e.g. a coordinator or
  // program_head who also supervises — see adminController.ts's
  // getSupervisorsList/createAdminProject, which already check both). That
  // mismatch let such a user reach this dashboard (useRequireRole checks the
  // full role+roles set) only to be blocked here at the actual write.
  const supervisorRoles = ['supervisor', 'secondary_supervisor'];
  const isAuthorized = supervisorRoles.includes(req.user?.role ?? '') || (req.user?.roles ?? []).some((r) => supervisorRoles.includes(r));
  if (!isAuthorized) {
    return res.status(403).json({ message: 'Access denied: supervisors only.' });
  }

  try {
    const {
      titleHe, titleEn, descriptionHe, descriptionEn,
      degreeType, degreeTypes: degreeTypesInputRaw,
      projectType, projectTypes: projectTypesInputRaw,
      // CRITICAL FIX: this field used to be called `projectInfo` here, but
      // every student-facing read (mobile Browseprojects.tsx, web
      // BrowseProjects.tsx, both platforms' ProjectProposal type) has always
      // read `projectFileUrl` — a project's info PDF was silently invisible
      // to students even on the rare project doc that had a real value here,
      // since nothing ever read the field it was actually stored under.
      projectFileUrl,
      NumberOfStudents, requiredSkills, facultyId,
      prerequisites, // ← courses a student must have completed to be eligible
      major, // ← optional; omitted means open to every major in the faculty
    } = req.body;

    if (!titleHe?.trim() || !titleEn?.trim()) {
      return res.status(400).json({ message: 'Title in both languages is required.' });
    }

    // Backward-compatible input shape: accept either the new array fields or
    // the old scalar ones (wrapped into a single-item array).
    const degreeTypesInput: string[] = Array.isArray(degreeTypesInputRaw)
      ? degreeTypesInputRaw
      : degreeType ? [degreeType] : ['bachelors'];
    const projectTypesInput: string[] = Array.isArray(projectTypesInputRaw)
      ? projectTypesInputRaw
      : projectType ? [projectType] : ['project'];
    const degreeTypes = DEGREE_TYPE_ORDER.filter((d) => degreeTypesInput.includes(d));
    const projectTypes = PROJECT_TYPE_ORDER.filter((t) => projectTypesInput.includes(t));
    if (degreeTypes.length === 0) {
      return res.status(400).json({ message: 'At least one degree type must be selected.' });
    }
    if (projectTypes.length === 0) {
      return res.status(400).json({ message: 'At least one project type must be selected.' });
    }

    const resolvedFacultyId = facultyId ?? req.user?.facultyId ?? '';

    // A supervisor restricted to specific majors (assignedMajors, set by
    // system_admin) can only post projects within that restriction; an
    // unrestricted supervisor (empty/no assignedMajors) can pick any major
    // of their own faculty, or omit it entirely to stay open to all majors.
    if (major) {
      const validForFaculty = majorsForFaculty(resolvedFacultyId);
      if (!validForFaculty.includes(major)) {
        return res.status(400).json({ message: `Invalid major "${major}" for faculty "${resolvedFacultyId}".` });
      }
      const supervisorSnap = await db.collection('users').doc(supervisorId).get();
      const supervisorMajors: string[] = supervisorSnap.data()?.assignedMajors ?? [];
      if (supervisorMajors.length > 0 && !supervisorMajors.includes(major)) {
        return res.status(403).json({ message: `You're only assigned to post projects in: ${supervisorMajors.join(', ')}.` });
      }
    }

    // Every new project must be explicitly based on the faculty's currently-
    // approved workflow template for each (degreeType, projectType)
    // combination it's open to — see createAdminProject for the same rule.
    const { refs: workflowTemplateRefs, missing } = await resolveWorkflowTemplateRefs(
      resolvedFacultyId, degreeTypes, projectTypes, major ?? null
    );
    if (missing.length > 0) {
      const messages = missing.map((m) => `No approved workflow template for ${m.degreeType}/${m.projectType} — approve one in Workflow Templates first.`);
      return res.status(400).json({ message: messages.join(' ') });
    }

    const newProjectRef = db.collection('projects').doc();

    await newProjectRef.set({
      titleHe,
      titleEn,
      descriptionHe:      descriptionHe      ?? '',
      descriptionEn:      descriptionEn      ?? '',
      degreeType:         degreeTypes[0]!,
      degreeTypes,
      projectType:        projectTypes[0]!,
      projectTypes,
      workflowTemplateRefs,
      projectFileUrl:     projectFileUrl     ?? null,
      NumberOfStudents:   NumberOfStudents   ?? 1,
      requiredSkills:     requiredSkills     ?? [],
      prerequisites:      normalizePrerequisites(prerequisites),
      facultyId:          resolvedFacultyId,
      ...(major ? { major } : {}),
      supervisorId,
      projectId:          newProjectRef.id,
      enrolledStudentIds: [],
      status:             'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({ success: true, projectId: newProjectRef.id });
  } catch (error: any) {
    console.error('createSupervisorProject Error:', error);
    return res.status(500).json({ message: 'Failed to create new project.' });
  }
};

// ─── POST /api/supervisor/applications/decision ───────────────────────────────
export const handleApplicationDecision = async (req: AuthenticatedRequest, res: Response) => {
  const supervisorId = req.user?.uid;
  const { applicationId, decision, notes } = req.body;

  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized.' });
  if (!applicationId || !decision) return res.status(400).json({ message: 'Missing decision parameters.' });

  try {
    const applicationRef = db.collection('applications').doc(applicationId);
    const appSnap = await applicationRef.get();

    if (!appSnap.exists) return res.status(404).json({ message: 'Application not found.' });
    // The application doc only ever denormalizes the project's PRIMARY
    // supervisorId at apply time (see applyApplication) — it never carries
    // secondarySupervisorId, so a co-supervisor (who can already see this
    // application via getSupervisorDashboard's own projectId-based query)
    // got a flat 403 here even on their own jointly-supervised project.
    // Falls back to the project doc's secondarySupervisorId when the direct
    // match fails, same ownership model as updateSupervisorProject.
    const appData = appSnap.data()!;
    if (appData.supervisorId !== supervisorId) {
      const projectSnap = appData.projectId ? await db.collection('projects').doc(appData.projectId).get() : null;
      if (projectSnap?.data()?.secondarySupervisorId !== supervisorId) {
        return res.status(403).json({ message: 'Forbidden.' });
      }
    }

    // A student can now have several open applications at once — the moment
    // the student actually confirms one of their approvals (see
    // applicationController.ts's confirmApplicationStart), enrollStudentInProject
    // auto-closes the rest (see projectEnrollment.ts's
    // closeOtherPendingApplications). This guard catches a second supervisor
    // still trying to act on one of those after the fact, whether they're
    // looking at stale UI or two requests raced.
    if (!['applied', 'meeting_requested'].includes(appSnap.data()?.status)) {
      return res.status(409).json({
        message: appSnap.data()?.autoClosedReason === 'accepted_elsewhere'
          ? 'This student has already been accepted into another project.'
          : 'This application has already been decided.',
      });
    }

    const projectId = appSnap.data()?.projectId;
    const studentId = appSnap.data()?.studentId;

    // Fetch project title + supervisor's display name in parallel — notifyUser
    // fetches the student's own doc (for email/push/sms) itself, so no
    // separate student fetch is needed here anymore.
    const [projectSnap, supervisorSnap] = await Promise.all([
      db.collection('projects').doc(projectId).get(),
      db.collection('users').doc(supervisorId).get(),
    ]);

    const projectTitleHe = projectSnap.data()?.titleHe ?? '';
    const projectTitleEn = projectSnap.data()?.titleEn ?? '';
    const supervisorName = supervisorSnap.data()?.displayNameHe ?? supervisorSnap.data()?.displayName ?? '';

    // Approval no longer enrolls the student immediately — it hands the
    // decision to the student instead (see applicationController.ts's
    // confirmApplicationStart, POST /api/applications/:id/confirm-start),
    // since they may be sitting on several other approvals/pending
    // applications at once and should get to pick which one to actually
    // start. enrollStudentInProject (and the auto-close of every other
    // pending application it triggers) only runs once the student confirms
    // 'yes' there — an outright 'no' just closes this one application,
    // leaving every other pending application untouched.
    await applicationRef.update({
      status:        decision === 'approved' ? 'awaiting_student_confirmation' : decision,
      supervisorNote: notes || null,
      reviewedAt:    new Date().toISOString(),
    });

    // Delivery status (email/push/sms) is persisted on the notification doc
    // by notifyUser — see services/notify.ts.
    if (decision === 'approved') {
      await notifyUser({
        recipientId:      studentId,
        type:             'application_approved',
        titleHe:          'בקשתך אושרה! 🎉 אשר/י שברצונך להתחיל',
        titleEn:          'Application Approved! 🎉 Confirm you want to start',
        bodyHe:           `המנחה ${supervisorName} אישר את בקשתך לפרויקט "${projectTitleHe}". יש לאשר שברצונך להתחיל בפרויקט זה.`,
        bodyEn:           `Supervisor ${supervisorName} approved your application for "${projectTitleEn}". Please confirm whether you want to start this project.`,
        relatedProjectId: projectId,
        emailData:        { projectTitle: { he: projectTitleHe, en: projectTitleEn } },
      });

    } else if (decision === 'rejected') {
      await notifyUser({
        recipientId:      studentId,
        type:             'application_rejected',
        titleHe:          'בקשתך נדחתה',
        titleEn:          'Application Rejected',
        bodyHe:           `לצערנו, בקשתך לפרויקט "${projectTitleHe}" נדחתה.${notes ? ` הערה: ${notes}` : ''}`,
        bodyEn:           `Unfortunately your application for "${projectTitleEn}" was rejected.${notes ? ` Note: ${notes}` : ''}`,
        relatedProjectId: projectId,
        emailData:        { projectTitle: { he: projectTitleHe, en: projectTitleEn } },
      });

    } else if (decision === 'meeting_requested') {
      await notifyUser({
        recipientId:      studentId,
        type:             'meeting_requested',
        titleHe:          'בקשת פגישה 📅',
        titleEn:          'Meeting Requested 📅',
        bodyHe:           `המנחה ${supervisorName} מבקש לקיים פגישה לפני קבלת ההחלטה על פרויקט "${projectTitleHe}".`,
        bodyEn:           `Supervisor ${supervisorName} requested a meeting before deciding on "${projectTitleEn}".`,
        relatedProjectId: projectId,
        emailData:        { projectTitle: { he: projectTitleHe, en: projectTitleEn } },
      });
    }

    return res.status(200).json({ success: true, message: `Application ${decision} successfully.` });
  } catch (error: any) {
    console.error('handleApplicationDecision Error:', error);
    if (error?.message === 'Student already has an active project.') {
      // Same wording as the pre-check guard above, for the narrower race this
      // catches: two supervisors both passed that guard (both applications
      // were still 'applied'/'meeting_requested') and both approvals reached
      // enrollStudentInProject's transaction before either's auto-close ran
      // — only the first commit wins, the second lands here instead.
      return res.status(409).json({ message: 'This student has already been accepted into another project.' });
    }
    return res.status(500).json({ message: 'Failed to process application decision.' });
  }
};

// Grading goes through POST /api/projects/milestones/:milestoneId/grade
// (submitMilestoneGrade) — this file previously had its own duplicate
// gradeMilestone endpoint with no live caller; removed to avoid two
// divergent code paths for the same action.

// ─── PUT /api/supervisor/projects/:id ────────────────────────────────────────
// Only fields the mobile "edit project" form actually sends — a blind
// `{...req.body}` spread previously let a supervisor overwrite anything on
// their own project doc, including facultyId/supervisorId/status/enrolledStudentIds.
// `maxStudents` also lets a coordinator (see PROJECT_EDIT_COORDINATOR_ROLES
// below) fix a human-error student-count typo from the Active Projects tab.
const EDITABLE_PROJECT_FIELDS = [
  'titleHe', 'titleEn', 'descriptionHe', 'descriptionEn',
  'degreeType', 'projectType', 'requiredSkills', 'projectFileUrl', 'maxStudents',
] as const;

// A coordinator overseeing a faculty needs to be able to fix another
// supervisor's human-error typo (wrong title, wrong student count) on this
// same endpoint — previously ownership-only, so a coordinator got a flat
// 403 here regardless of scope. Mirrors the role set already gated on
// elsewhere for coordinator-tier project actions (coordinatorController.ts's
// COORDINATOR_ROLES), not getActiveProjects's narrower list, since this is a
// write action several of those roles legitimately need.
const PROJECT_EDIT_COORDINATOR_ROLES = ['coordinator', 'faculty_admin', 'administrative_secretary', 'system_admin'];

export const updateSupervisorProject = async (req: AuthenticatedRequest, res: Response) => {
  const requesterId = req.user?.uid;
  const { id: projectId } = req.params;
  const updateData: Record<string, unknown> = {};
  for (const field of EDITABLE_PROJECT_FIELDS) {
    if (req.body?.[field] !== undefined) updateData[field] = req.body[field];
  }
  // Both field names coexist in real data with no migration (supervisor-
  // created projects write `NumberOfStudents`, admin-created ones write
  // `maxStudents` — every read site already falls back `maxStudents ??
  // NumberOfStudents`) — keeping both in sync here, rather than picking one,
  // avoids adding a THIRD divergent value instead of resolving the existing one.
  if (updateData.maxStudents !== undefined) updateData.NumberOfStudents = updateData.maxStudents;

  if (!requesterId) return res.status(401).json({ message: 'Unauthorized.' });
  if (!projectId || typeof projectId !== 'string')
    return res.status(400).json({ message: 'Invalid projectId.' });

  // createSupervisorProject refuses an empty title outright; this endpoint
  // had no equivalent guard, so submitting the edit form with a title field
  // blank (e.g. while only touching description/skills) silently wiped an
  // already-enrolled project's title — the exact "Project column shows
  // blank" report from the Students Report tab.
  if (updateData.titleHe !== undefined && !String(updateData.titleHe).trim())
    return res.status(400).json({ message: 'Project title (Hebrew) cannot be empty.' });
  if (updateData.titleEn !== undefined && !String(updateData.titleEn).trim())
    return res.status(400).json({ message: 'Project title (English) cannot be empty.' });

  try {
    const projectRef  = db.collection('projects').doc(projectId);
    const projectSnap = await projectRef.get();

    if (!projectSnap.exists) return res.status(404).json({ message: 'Project not found.' });
    const projectData = projectSnap.data() ?? {};
    // Co-supervisors were previously locked out of editing their own
    // jointly-owned project — this check only ever recognized supervisorId.
    const isOwner = projectData.supervisorId === requesterId || projectData.secondarySupervisorId === requesterId;
    const inCoordinatorScope = hasAnyRole(req.user, PROJECT_EDIT_COORDINATOR_ROLES) && withinCoordinatorScope(req.user, {
      facultyId: projectData.facultyId ?? '',
      major: projectData.major || undefined,
      degreeLevel: projectData.degreeType || undefined,
      processType: projectData.projectType || undefined,
    });
    if (!isOwner && !inCoordinatorScope)
      return res.status(403).json({ message: 'Forbidden.' });

    await projectRef.update({ ...updateData, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

    // ✅ Notify enrolled students that the project was updated
    const enrolledStudentIds: string[] = projectData.enrolledStudentIds ?? [];
    const titleHe = projectData.titleHe ?? '';
    const titleEn = projectData.titleEn ?? '';
    // "by your supervisor" is only accurate for the ownership path — a
    // coordinator fixing another supervisor's typo isn't the student's own
    // supervisor, so the notification stays role-agnostic whenever the edit
    // came from coordinator scope instead of ownership.
    const actorHe = isOwner ? 'על ידי המנחה' : 'על ידי הרכז/ת';
    const actorEn = isOwner ? 'by your supervisor' : 'by the coordinator';

    await Promise.all(enrolledStudentIds.map(async (studentId) => {
      await createNotification({
        recipientId:      studentId,
        type:             'project_updated',
        titleHe:          'פרויקט עודכן 📝',
        titleEn:          'Project Updated 📝',
        bodyHe:           `הפרויקט "${titleHe}" עודכן ${actorHe}.`,
        bodyEn:           `Your project "${titleEn}" was updated ${actorEn}.`,
        relatedProjectId: projectId,
      });

      const token = await getUserPushToken(studentId);
      if (token) {
        await sendPushNotification(
          token,
          '📝 Project Updated',
          `"${titleEn}" has been updated ${actorEn}.`,
          { projectId },
        );
      }
    }));

    return res.status(200).json({ success: true, message: 'Project updated successfully.' });
  } catch (error: any) {
    console.error('updateSupervisorProject Error:', error);
    return res.status(500).json({ message: 'Failed to update project.' });
  }
};

// ─── GET /api/supervisor/examiner-recommendations ────────────────────────────
export const getSupervisorExaminerRecommendations = async (req: AuthenticatedRequest, res: Response) => {
  const supervisorId = req.user?.uid;
  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized.' });

  try {
    const snap = await db.collection('examinerRecommendations')
      .where('supervisorId', '==', supervisorId)
      .get();

    const recommendations = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return res.status(200).json({ recommendations });
  } catch (error: any) {
    console.error('getSupervisorExaminerRecommendations error:', error);
    return res.status(500).json({ message: 'Failed to load examiner recommendations.' });
  }
};

// ─── POST /api/supervisor/examiner-recommendations ───────────────────────────
// Body: { projectId, projectTitleHe, projectTitleEn, recommendedExaminers }
// recommendedExaminers: Array<{ type: 'internal'|'external', internalUserId?, name, email, institution, expertise, priority, notes }>
// See mobile/components/modals/RecommendedExaminerModal.tsx for the exact shape.
export const createExaminerRecommendation = async (req: AuthenticatedRequest, res: Response) => {
  const supervisorId = req.user?.uid;
  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized.' });

  const { projectId, projectTitleHe, projectTitleEn, recommendedExaminers } = req.body;

  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ message: 'Missing projectId.' });
  }
  if (!Array.isArray(recommendedExaminers) || recommendedExaminers.length === 0) {
    return res.status(400).json({ message: 'At least one recommended examiner is required.' });
  }

  try {
    const [projectSnap, supervisorSnap] = await Promise.all([
      db.collection('projects').doc(projectId).get(),
      db.collection('users').doc(supervisorId).get(),
    ]);
    if (!projectSnap.exists) return res.status(404).json({ message: 'Project not found.' });
    if (projectSnap.data()?.supervisorId !== supervisorId && projectSnap.data()?.secondarySupervisorId !== supervisorId) {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    const facultyId     = projectSnap.data()?.facultyId ?? req.user?.facultyId ?? '';
    const supervisorName = supervisorSnap.data()?.displayNameHe ?? supervisorSnap.data()?.displayName ?? '';

    const recRef = db.collection('examinerRecommendations').doc();
    await recRef.set({
      projectId,
      projectTitleHe: projectTitleHe ?? projectSnap.data()?.titleHe ?? '',
      projectTitleEn: projectTitleEn ?? projectSnap.data()?.titleEn ?? '',
      facultyId,
      supervisorId,
      supervisorName,
      recommendedExaminers,
      status:    'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({ success: true, id: recRef.id });
  } catch (error: any) {
    console.error('createExaminerRecommendation error:', error);
    return res.status(500).json({ message: 'Failed to submit examiner recommendation.' });
  }
};

// ─── POST /api/supervisor/milestones/:id/staff-record ────────────────────────
// Only meaningful on a research_proposal/progress_report-type milestone whose
// template configured staffRecordMode === 'upload_or_form' (data_science only,
// as of this writing) — an official record the supervisor attaches alongside
// the student's own submission (fileUrls/submissionNote), stored under a
// separate `staffRecord` field so neither submission ever clobbers the other.
// Either a file is uploaded (see uploadMiddleware, reused from
// milestoneController.ts's own submit-milestone multer config) or a JSON
// `formData` body is sent — never both, file takes priority if present.
export const submitStaffRecord = async (req: AuthenticatedRequest, res: Response) => {
  const supervisorId = req.user?.uid;
  const { id: milestoneId } = req.params;
  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized.' });
  if (!milestoneId || typeof milestoneId !== 'string') return res.status(400).json({ message: 'Invalid milestoneId.' });

  try {
    const milestoneRef = db.collection('milestones').doc(milestoneId);
    const milestoneSnap = await milestoneRef.get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: 'Milestone not found.' });
    const data = milestoneSnap.data()!;

    if (data.staffRecordMode !== 'upload_or_form') {
      return res.status(400).json({ message: 'This milestone does not have a staff record configured.' });
    }
    if (data.supervisorId !== supervisorId && data.secondarySupervisorId !== supervisorId) {
      return res.status(403).json({ message: "Only this project's supervisor may submit a staff record." });
    }

    const files = ((req as any).files as Express.Multer.File[]) ?? [];

    if (files.length > 0) {
      const fileUrls: string[] = [];
      for (const file of files) {
        const base64 = file.buffer.toString('base64');
        const dataUri = `data:${file.mimetype};base64,${base64}`;
        const result = await cloudinary.uploader.upload(dataUri, { resource_type: 'raw', folder: 'staffRecords' });
        fileUrls.push(result.secure_url);
      }
      await milestoneRef.update({
        staffRecord: { mode: 'upload', fileUrls, submittedBy: supervisorId, submittedAt: admin.firestore.FieldValue.serverTimestamp() },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      let formData: Record<string, unknown>;
      try {
        formData = typeof req.body?.formData === 'string' ? JSON.parse(req.body.formData) : req.body?.formData;
      } catch {
        return res.status(400).json({ message: 'Invalid formData.' });
      }
      if (!formData || typeof formData !== 'object') {
        return res.status(400).json({ message: 'Either a file or formData is required.' });
      }
      const fields: FormFieldSpec[] = data.staffFormFields ?? [];
      const missing = fields.filter((f) => f.required && (formData[f.key] === undefined || formData[f.key] === null || formData[f.key] === ''));
      if (missing.length > 0) {
        return res.status(400).json({ message: `Missing required field(s): ${missing.map((f) => f.labelEn).join(', ')}` });
      }
      await milestoneRef.update({
        staffRecord: { mode: 'form', formData, submittedBy: supervisorId, submittedAt: admin.firestore.FieldValue.serverTimestamp() },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('submitStaffRecord error:', error);
    return res.status(500).json({ message: 'Failed to submit staff record.' });
  }
};

// ─── POST /api/supervisor/milestones/:id/final-grade-decision ────────────────
// Body: { decision: 'approve' } | { decision: 'override', grade, reason }
// Only meaningful on a defense milestone whose template configured
// finalGradeComponents (the three-rubric workflow) — 'approve' finalizes the
// already-computed autoCalculatedFinalGrade directly (no further sign-off
// needed, since nothing changed); 'override' requires a mandatory reason and
// routes the proposed grade to whichever role resolveFinalGradeSignoffRole
// resolves to (the coordinator, for data_science) via decideGradeOverride in
// gradSchoolHeadController.ts — it does NOT finalize anything itself.
export const decideFinalGrade = async (req: AuthenticatedRequest, res: Response) => {
  const supervisorId = req.user?.uid;
  const { id: milestoneId } = req.params;
  const { decision, grade, reason } = req.body;
  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized.' });
  if (!milestoneId || typeof milestoneId !== 'string') return res.status(400).json({ message: 'Invalid milestoneId.' });
  if (decision !== 'approve' && decision !== 'override') {
    return res.status(400).json({ message: 'decision must be "approve" or "override".' });
  }

  try {
    const milestoneRef = db.collection('milestones').doc(milestoneId);
    const milestoneSnap = await milestoneRef.get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: 'Milestone not found.' });
    const data = milestoneSnap.data()!;

    if (data.type !== 'defense' || !data.finalGradeComponents) {
      return res.status(400).json({ message: 'This milestone does not use the three-rubric final-grade workflow.' });
    }
    if (data.supervisorId !== supervisorId) {
      return res.status(403).json({ message: "Only this project's supervisor may decide on this milestone's final grade." });
    }
    if (data.autoCalculatedFinalGrade == null) {
      return res.status(400).json({ message: 'The automatic grade has not been computed yet — every evaluation must be submitted first.' });
    }
    if (data.gradeApproved) {
      return res.status(409).json({ message: 'This grade has already been finalized.' });
    }
    if (data.gradeOverride?.status === 'pending') {
      return res.status(409).json({ message: 'A grade override is already pending coordinator review.' });
    }

    // Both branches below now land on the coordinator's queue rather than
    // one self-finalizing — the manager's requirement is "I approve after
    // the supervisor's approval" for every grade, not just contested ones.
    // 'auto_confirmed' is structurally identical to a real override except
    // proposedGrade already equals autoCalculatedFinalGrade and reason is
    // omitted, so decideGradeOverride (gradSchoolHeadController.ts) needs no
    // changes at all — approve_override/keep_auto both yield the same number.
    let proposedGrade: number;
    let reasonTrimmed: string | undefined;
    let kind: 'auto_confirmed' | 'override';

    if (decision === 'approve') {
      proposedGrade = data.autoCalculatedFinalGrade;
      kind = 'auto_confirmed';
    } else {
      const parsedGrade = Number(grade);
      if (!Number.isFinite(parsedGrade) || parsedGrade < 0 || parsedGrade > 100) {
        return res.status(400).json({ message: 'grade must be a number between 0 and 100.' });
      }
      if (typeof reason !== 'string' || !reason.trim()) {
        return res.status(400).json({ message: 'A reason is required when changing the automatically calculated grade.' });
      }
      proposedGrade = parsedGrade;
      reasonTrimmed = reason.trim();
      kind = 'override';
    }

    // Optional file attached alongside the decision (e.g. the signed final-
    // grade paper form, for the record) — never required, the decision
    // itself is what finalizes the grade. See uploadMiddleware (shared with
    // submitStaffRecord).
    const files = ((req as any).files as Express.Multer.File[]) ?? [];
    const fileUrls: string[] = [];
    for (const file of files) {
      const base64 = file.buffer.toString('base64');
      const dataUri = `data:${file.mimetype};base64,${base64}`;
      const result = await cloudinary.uploader.upload(dataUri, { resource_type: 'raw', folder: 'evaluationRecords' });
      fileUrls.push(result.secure_url);
    }

    await milestoneRef.update({
      gradeOverride: {
        kind,
        proposedGrade,
        ...(reasonTrimmed ? { reason: reasonTrimmed } : {}),
        ...(fileUrls.length > 0 ? { fileUrls } : {}),
        proposedBy: supervisorId,
        proposedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'pending',
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await logAuditEvent({
      userId: supervisorId,
      userRole: req.user?.role ?? 'supervisor',
      action: kind === 'override' ? 'final_grade_override_proposed' : 'final_grade_approved_by_supervisor',
      entityType: 'milestone',
      entityId: milestoneId,
      oldValue: { autoCalculatedFinalGrade: data.autoCalculatedFinalGrade },
      newValue: { proposedGrade, ...(reasonTrimmed ? { reason: reasonTrimmed } : {}) },
    });

    // Notify whoever resolveFinalGradeSignoffRole resolves to (the
    // coordinator, for data_science) that a grade is awaiting sign-off —
    // for every decision now, not just overrides.
    try {
      const projectSnap = await db.collection('projects').doc(data.projectId ?? '').get();
      const project = projectSnap.exists ? projectSnap.data()! : {};
      const scope = { facultyId: project.facultyId ?? data.facultyId ?? '' };
      const processType = deriveProcessType(project.degreeType, project.projectType);
      const signoffRole = await resolveFinalGradeSignoffRole(scope.facultyId, processType, project.major ?? null);
      const projectSupervisorIds = [project.supervisorId].filter(Boolean);
      const uids = await resolveStaffForScope(signoffRole, scope, projectSupervisorIds);
      // signoffRole can resolve to several different concrete roles at once
      // (coordinator + administrative_secretary + system_admin, say), and
      // unlike the fixed-role fan-outs elsewhere in this codebase, those
      // don't all land on the same screen for a sign-off task — each
      // recipient's own role has to be looked up to pick their destination.
      const recipientSnaps = await Promise.all(uids.map((uid) => db.collection('users').doc(uid).get()));
      await Promise.all(uids.map((recipientId, idx) => {
        const targetScreen = targetScreenFor(recipientSnaps[idx]?.data()?.role, 'signoff');
        return db.collection('notifications').add({
          recipientId,
          type: 'grade_override_pending',
          titleHe: kind === 'override' ? '⚖️ שינוי ציון ממתין לאישור' : '✅ ציון סופי ממתין לאישור',
          titleEn: kind === 'override' ? '⚖️ Grade Override Pending Approval' : '✅ Final Grade Pending Approval',
          bodyHe: kind === 'override'
            ? `המנחה הציע לשנות את הציון המחושב (${data.autoCalculatedFinalGrade}) ל-${proposedGrade}.`
            : `המנחה אישר את הציון המחושב (${proposedGrade}) — ממתין לאישורך הסופי.`,
          bodyEn: kind === 'override'
            ? `The supervisor proposed changing the computed grade (${data.autoCalculatedFinalGrade}) to ${proposedGrade}.`
            : `The supervisor confirmed the computed grade (${proposedGrade}) — awaiting your final sign-off.`,
          isRead: false,
          relatedProjectId: data.projectId ?? null,
          relatedMilestoneId: milestoneId,
          ...(targetScreen ? { targetScreen } : {}),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }));
    } catch (notifyErr) {
      console.error('decideFinalGrade: failed to notify signoff role:', notifyErr);
    }

    return res.status(200).json({ success: true, status: 'pending_coordinator_review' });
  } catch (error: any) {
    console.error('decideFinalGrade error:', error);
    return res.status(500).json({ message: 'Failed to record final-grade decision.' });
  }
};