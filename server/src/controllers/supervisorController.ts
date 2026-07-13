import { Response } from 'express';
import admin from 'firebase-admin';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { enrollStudentInProject } from '../services/projectEnrollment.js';

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

// ─── GET /api/supervisor/dashboard ───────────────────────────────────────────
export const getSupervisorDashboard = async (req: AuthenticatedRequest, res: Response) => {
  const supervisorId = req.user?.uid;
  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized access.' });

  try {
    const userSnap = await db.collection('users').doc(supervisorId).get();
    const userData = userSnap.data() ?? {};

    const projectsSnap = await db.collection('projects')
      .where('supervisorId', '==', supervisorId)
      .get();

    const myProjects = projectsSnap.docs.map(doc => {
      const data = doc.data();
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
      };
    });

    const applicationsSnap = await db.collection('applications')
      .where('supervisorId', '==', supervisorId)
      .where('status', '==', 'applied')
      .get();
    const applications = applicationsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const milestonesSnap = await db.collection('milestones')
      .where('supervisorId', '==', supervisorId)
      .where('status', '==', 'submitted')
      .get();

    const pendingGrades = milestonesSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id:             doc.id,
        projectId:      data.projectId      ?? '',
        projectTitleHe: data.projectTitleHe ?? '',
        projectTitleEn: data.projectTitleEn ?? '',
        type:           data.type           ?? '',
        status:         data.status         ?? '',
        studentNames:   data.studentNames   ?? [],
        fileUrls:       data.fileUrls       ?? [],
        submissionNote: data.submissionNote ?? '',
        facultyId:      data.facultyId      ?? '',
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

// ─── POST /api/supervisor/projects ───────────────────────────────────────────
export const createSupervisorProject = async (req: AuthenticatedRequest, res: Response) => {
  const supervisorId = req.user?.uid;
  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized access.' });
  if (!['supervisor', 'secondary_supervisor'].includes(req.user?.role ?? '')) {
    return res.status(403).json({ message: 'Access denied: supervisors only.' });
  }

  try {
    const {
      titleHe, titleEn, descriptionHe, descriptionEn,
      degreeType, projectType, projectInfo,
      NumberOfStudents, requiredSkills, facultyId,
      gradingCriteria, // ← NEW: array of { key, label, maxScore }
      prerequisites, // ← courses a student must have completed to be eligible
    } = req.body;
 
    if (!titleHe?.trim() || !titleEn?.trim()) {
      return res.status(400).json({ message: 'Title in both languages is required.' });
    }
 
    // Validate criteria if provided — must sum to 100
    if (gradingCriteria && Array.isArray(gradingCriteria)) {
      const total = gradingCriteria.reduce(
        (sum: number, c: any) => sum + (Number(c.maxScore) || 0), 0
      );
      if (total !== 100) {
        return res.status(400).json({
          message: `Grading criteria must sum to 100 (currently ${total}).`,
        });
      }
    }
 
    const newProjectRef = db.collection('projects').doc();
 
    await newProjectRef.set({
      titleHe,
      titleEn,
      descriptionHe:      descriptionHe      ?? '',
      descriptionEn:      descriptionEn      ?? '',
      degreeType:         degreeType         ?? 'bachelors',
      projectType:        projectType        ?? 'project',
      projectInfo:        projectInfo        ?? null,
      NumberOfStudents:   NumberOfStudents   ?? 1,
      requiredSkills:     requiredSkills     ?? [],
      prerequisites:      Array.isArray(prerequisites) ? prerequisites : [],
      facultyId:          facultyId          ?? req.user?.facultyId ?? '',
      supervisorId,
      projectId:          newProjectRef.id,
      enrolledStudentIds: [],
      status:             'active',
      // Save criteria — fall back to sensible defaults if supervisor skipped the section
      gradingCriteria: gradingCriteria ?? [
        { key: 'clarity',     label: 'Research Clarity', maxScore: 20 },
        { key: 'methodology', label: 'Methodology',       maxScore: 25 },
        { key: 'feasibility', label: 'Feasibility',       maxScore: 20 },
        { key: 'innovation',  label: 'Innovation',        maxScore: 15 },
        { key: 'writing',     label: 'Writing Quality',   maxScore: 20 },
      ],
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
    if (appSnap.data()?.supervisorId !== supervisorId)
      return res.status(403).json({ message: 'Forbidden.' });

    const projectId = appSnap.data()?.projectId;
    const studentId = appSnap.data()?.studentId;
    const facultyId = appSnap.data()?.facultyId ?? '';

    // Fetch project title + student push token in parallel
    const [projectSnap, studentSnap, supervisorSnap] = await Promise.all([
      db.collection('projects').doc(projectId).get(),
      db.collection('users').doc(studentId).get(),
      db.collection('users').doc(supervisorId).get(),
    ]);

    const projectTitleHe = projectSnap.data()?.titleHe ?? '';
    const projectTitleEn = projectSnap.data()?.titleEn ?? '';
    const studentToken   = studentSnap.data()?.expoPushToken ?? null;
    const supervisorName = supervisorSnap.data()?.displayNameHe ?? supervisorSnap.data()?.displayName ?? '';

    await applicationRef.update({
      status:        decision,
      supervisorNote: notes || null,
      reviewedAt:    new Date().toISOString(),
    });

    if (decision === 'approved') {
      // 1-3. Project/student/milestone writes — shared with the admin and
      // faculty-admin manual-enrollment paths so all three stay in sync.
      await enrollStudentInProject(projectId, studentId, supervisorId, facultyId);

      // 4. ✅ Firestore notification — approved
      await createNotification({
        recipientId:      studentId,
        type:             'application_approved',
        titleHe:          'בקשתך אושרה! 🎉',
        titleEn:          'Application Approved! 🎉',
        bodyHe:           `המנחה ${supervisorName} אישר את בקשתך לפרויקט "${projectTitleHe}".`,
        bodyEn:           `Supervisor ${supervisorName} approved your application for "${projectTitleEn}".`,
        relatedProjectId: projectId,
      });

      // 5. ✅ Push notification — approved
      if (studentToken) {
        await sendPushNotification(
          studentToken,
          '✅ Application Approved!',
          `You have been accepted to "${projectTitleEn}".`,
          { projectId },
        );
      }

    } else if (decision === 'rejected') {
      // ✅ Firestore notification — rejected
      await createNotification({
        recipientId:      studentId,
        type:             'application_rejected',
        titleHe:          'בקשתך נדחתה',
        titleEn:          'Application Rejected',
        bodyHe:           `לצערנו, בקשתך לפרויקט "${projectTitleHe}" נדחתה.${notes ? ` הערה: ${notes}` : ''}`,
        bodyEn:           `Unfortunately your application for "${projectTitleEn}" was rejected.${notes ? ` Note: ${notes}` : ''}`,
        relatedProjectId: projectId,
      });

      // ✅ Push notification — rejected
      if (studentToken) {
        await sendPushNotification(
          studentToken,
          '❌ Application Update',
          `Your application for "${projectTitleEn}" was not accepted.`,
          { projectId },
        );
      }

    } else if (decision === 'meeting_requested') {
      // ✅ Firestore notification — meeting requested
      await createNotification({
        recipientId:      studentId,
        type:             'meeting_requested',
        titleHe:          'בקשת פגישה 📅',
        titleEn:          'Meeting Requested 📅',
        bodyHe:           `המנחה ${supervisorName} מבקש לקיים פגישה לפני קבלת ההחלטה על פרויקט "${projectTitleHe}".`,
        bodyEn:           `Supervisor ${supervisorName} requested a meeting before deciding on "${projectTitleEn}".`,
        relatedProjectId: projectId,
      });

      if (studentToken) {
        await sendPushNotification(
          studentToken,
          '📅 Meeting Requested',
          `Your supervisor wants to meet regarding "${projectTitleEn}".`,
          { projectId },
        );
      }
    }

    return res.status(200).json({ success: true, message: `Application ${decision} successfully.` });
  } catch (error: any) {
    console.error('handleApplicationDecision Error:', error);
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
const EDITABLE_PROJECT_FIELDS = [
  'titleHe', 'titleEn', 'descriptionHe', 'descriptionEn',
  'degreeType', 'projectType', 'requiredSkills',
] as const;

export const updateSupervisorProject = async (req: AuthenticatedRequest, res: Response) => {
  const supervisorId = req.user?.uid;
  const { id: projectId } = req.params;
  const updateData: Record<string, unknown> = {};
  for (const field of EDITABLE_PROJECT_FIELDS) {
    if (req.body?.[field] !== undefined) updateData[field] = req.body[field];
  }

  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized.' });
  if (!projectId || typeof projectId !== 'string')
    return res.status(400).json({ message: 'Invalid projectId.' });

  try {
    const projectRef  = db.collection('projects').doc(projectId);
    const projectSnap = await projectRef.get();

    if (!projectSnap.exists) return res.status(404).json({ message: 'Project not found.' });
    if (projectSnap.data()?.supervisorId !== supervisorId)
      return res.status(403).json({ message: 'Forbidden.' });

    await projectRef.update({ ...updateData, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

    // ✅ Notify enrolled students that the project was updated
    const enrolledStudentIds: string[] = projectSnap.data()?.enrolledStudentIds ?? [];
    const titleHe = projectSnap.data()?.titleHe ?? '';
    const titleEn = projectSnap.data()?.titleEn ?? '';

    await Promise.all(enrolledStudentIds.map(async (studentId) => {
      await createNotification({
        recipientId:      studentId,
        type:             'project_updated',
        titleHe:          'פרויקט עודכן 📝',
        titleEn:          'Project Updated 📝',
        bodyHe:           `הפרויקט "${titleHe}" עודכן על ידי המנחה.`,
        bodyEn:           `Your project "${titleEn}" was updated by your supervisor.`,
        relatedProjectId: projectId,
      });

      const token = await getUserPushToken(studentId);
      if (token) {
        await sendPushNotification(
          token,
          '📝 Project Updated',
          `"${titleEn}" has been updated by your supervisor.`,
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
    if (projectSnap.data()?.supervisorId !== supervisorId) {
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

// ─── DELETE /api/supervisor/projects/:id ─────────────────────────────────────
export const deleteSupervisorProject = async (req: AuthenticatedRequest, res: Response) => {
  const supervisorId = req.user?.uid;
  const { id: projectId } = req.params;

  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized.' });
  if (!projectId || typeof projectId !== 'string')
    return res.status(400).json({ message: 'Invalid projectId.' });

  try {
    const projectRef  = db.collection('projects').doc(projectId);
    const projectSnap = await projectRef.get();

    if (!projectSnap.exists) return res.status(404).json({ message: 'Project not found.' });
    if (projectSnap.data()?.supervisorId !== supervisorId)
      return res.status(403).json({ message: 'Forbidden.' });

    const enrolledStudentIds: string[] = projectSnap.data()?.enrolledStudentIds ?? [];
    const titleHe = projectSnap.data()?.titleHe ?? '';
    const titleEn = projectSnap.data()?.titleEn ?? '';

    // Soft delete
    await projectRef.update({
      isArchived: true,
      deletedAt:  admin.firestore.FieldValue.serverTimestamp(),
    });

    // Delete milestones
    const milestonesSnap = await db.collection('milestones').where('projectId', '==', projectId).get();
    const batch = db.batch();
    milestonesSnap.forEach(d => batch.delete(d.ref));
    await batch.commit();

    // ✅ Notify enrolled students the project was removed
    await Promise.all(enrolledStudentIds.map(async (studentId) => {
      await createNotification({
        recipientId:      studentId,
        type:             'project_deleted',
        titleHe:          'פרויקט הוסר ⚠️',
        titleEn:          'Project Removed ⚠️',
        bodyHe:           `הפרויקט "${titleHe}" הוסר על ידי המנחה.`,
        bodyEn:           `The project "${titleEn}" has been removed by your supervisor.`,
        relatedProjectId: projectId,
      });

      const token = await getUserPushToken(studentId);
      if (token) {
        await sendPushNotification(
          token,
          '⚠️ Project Removed',
          `"${titleEn}" has been removed by your supervisor.`,
          { projectId },
        );
      }
    }));

    return res.status(200).json({ success: true, message: 'Project deleted successfully.' });
  } catch (error: any) {
    console.error('deleteSupervisorProject Error:', error);
    return res.status(500).json({ message: 'Failed to delete project.' });
  }
};