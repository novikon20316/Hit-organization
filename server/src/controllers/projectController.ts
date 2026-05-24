// src/controllers/projectController.ts
// Removed broken: import { Message } from 'protobufjs'

import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import admin from 'firebase-admin';

const db = admin.firestore();

const MILESTONE_PROGRESS: Record<string, number> = {
  research_proposal: 25,
  progress_report:   50,
  final_report:      75,
  defense:           100,
};

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

// ─── Milestone creation helper ────────────────────────────────────────────────
async function createMilestonesOnApproval({
  projectId, studentIds, facultyId, supervisorId,
}: { projectId: string; studentIds: string[]; facultyId: string; supervisorId: string }) {
  const templates = [
    { type: 'research_proposal', title: 'Research Proposal', daysToDead: 30  },
    { type: 'progress_report',   title: 'Progress Report',   daysToDead: 90  },
    { type: 'final_report',      title: 'Final Report',      daysToDead: 180 },
    { type: 'defense',           title: 'Defense',           daysToDead: 210 },
  ];

  const batch = db.batch();
  templates.forEach((m) => {
    const ref     = db.collection('milestones').doc();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + m.daysToDead);
    batch.set(ref, {
      projectId, studentIds, facultyId, supervisorId,
      type:       m.type,
      title:      m.title,
      status:     'pending',
      dueDate:    admin.firestore.Timestamp.fromDate(dueDate),
      createdAt:  admin.firestore.FieldValue.serverTimestamp(),
      examinerIds:    [],
      supervisorScore:null,
      examiner1Score: null,
      examiner2Score: null,
      fileUrls:       [],
    });
  });
  await batch.commit();
}

// ─── Update project progress ──────────────────────────────────────────────────
export const updateProjectProgress = async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params;
  const { milestoneType } = req.body;

  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ message: 'Invalid or missing projectId' });
  }

  try {
    const newProgress = MILESTONE_PROGRESS[milestoneType] ?? 0;
    await db.collection('projects').doc(projectId).update({
      progress:      newProgress,
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.status(200).json({ success: true, progress: newProgress });
  } catch (error) {
    console.error('updateProjectProgress error:', error);
    return res.status(500).json({ message: 'Failed to update project progress' });
  }
};

// ─── Supervisor dashboard ─────────────────────────────────────────────────────
export const getSupervisorDashboard = async (req: AuthenticatedRequest, res: Response) => {
  const uid = (req as any).user?.uid;

  try {
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return res.status(404).json({ message: 'User not found' });

    const userData    = userSnap.data() || {};
    const facultyId   = userData.facultyId   ?? '';
    const supervisorName = userData.displayName ?? '';

    const [projSnap, appSnap, mileSnap] = await Promise.all([
      db.collection('projects')
        .where('facultyId',   '==', facultyId)
        .where('supervisorId','==', uid)
        .where('isArchived',  '==', false)
        .orderBy('createdAt', 'desc')
        .get(),
      db.collection('applications')
        .where('supervisorId','==', uid)
        .where('status', 'in', ['pending', 'meeting_requested'])
        .get(),
      db.collection('milestones')
        .where('supervisorId','==', uid)
        .where('status',      '==', 'submitted')
        .get(),
    ]);

    const myProjects = projSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const applications = [];
    for (const d of appSnap.docs) {
      const data = d.data();
      try {
        const [projDoc, studentDoc] = await Promise.all([
          db.collection('projects').doc(data.projectId).get(),
          db.collection('users').doc(data.studentId).get(),
        ]);
        applications.push({
          id:             d.id,
          projectId:      data.projectId,
          projectTitleHe: projDoc.data()?.titleHe    ?? '',
          projectTitleEn: projDoc.data()?.titleEn    ?? '',
          studentId:      data.studentId,
          studentName:    studentDoc.data()?.displayName ?? '',
          studentEmail:   studentDoc.data()?.email       ?? '',
          transcriptUrl:  data.transcriptUrl,
          cvUrl:          data.cvUrl,
          coverNote:      data.coverNote,
          status:         data.status,
          submittedAt:    data.submittedAt,
        });
      } catch (e) {
        console.warn(`Skipped application ${d.id}:`, e);
      }
    }

    const pendingGrades = [];
    for (const d of mileSnap.docs) {
      const data    = d.data();
      const projDoc = await db.collection('projects').doc(data.projectId).get();
      if (projDoc.data()?.supervisorId !== uid) continue;

      const studentNames: string[] = [];
      for (const sid of (data.studentIds ?? [])) {
        const sDoc = await db.collection('users').doc(sid).get();
        if (sDoc.exists) studentNames.push(sDoc.data()?.displayName ?? '');
      }

      pendingGrades.push({
        id:             d.id,
        projectId:      data.projectId,
        projectTitleHe: projDoc.data()?.titleHe ?? '',
        projectTitleEn: projDoc.data()?.titleEn ?? '',
        type:           data.type,
        status:         data.status,
        studentNames,
        dueDate:        data.dueDate,
        submittedAt:    data.submittedAt,
        fileUrls:       data.fileUrls       ?? [],
        submissionNote: data.submissionNote ?? '',
        facultyId:      projDoc.data()?.facultyId ?? '',
      });
    }

    return res.status(200).json({ supervisorName, facultyId, myProjects, applications, pendingGrades });
  } catch (error) {
    console.error('getSupervisorDashboard error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

// ─── Create project ───────────────────────────────────────────────────────────
export const createProject = async (req: AuthenticatedRequest, res: Response) => {
  const uid = (req as any).user?.uid;
  const { titleHe, titleEn, descriptionHe, descriptionEn, degreeType, projectType, maxStudents, requiredSkills, facultyId } = req.body;

  try {
    const projectRef = await db.collection('projects').add({
      supervisorId:       uid,
      facultyId,
      titleHe:            titleHe.trim(),
      titleEn:            titleEn.trim(),
      descriptionHe:      descriptionHe.trim(),
      descriptionEn:      descriptionEn.trim(),
      degreeType,
      projectType,
      maxStudents:        Number(maxStudents || 1),
      requiredSkills,
      status:             'published',
      enrolledStudentIds: [],
      applicationIds:     [],
      semesterStart:      null,
      academicYear:       `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
      isArchived:         false,
      createdAt:          admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:          admin.firestore.FieldValue.serverTimestamp(),
      deletedAt:          null
    });

    const supervisorSnap = await db.collection('users').doc(uid).get();
    const expoPushToken  = supervisorSnap.data()?.expoPushToken;
    if (expoPushToken) {
      await sendPushNotification(expoPushToken, '📢 New Project Published!', 'A new project is available.', {
        projectId: projectRef.id, type: 'project_published',
      });
    }

    return res.status(201).json({ success: true, projectId: projectRef.id });
  } catch (error) {
    console.error('createProject error:', error);
    return res.status(500).json({ message: 'Failed to create project' });
  }
};

// ─── Application decision ─────────────────────────────────────────────────────
export const handleApplicationDecision = async (req: AuthenticatedRequest, res: Response) => {
  const uid = (req as any).user?.uid;
  const { applicationId, projectId, decision, studentId, facultyId } = req.body;

  try {
    const batch  = db.batch();
    const appRef = db.collection('applications').doc(applicationId);
    batch.update(appRef, { status: decision, reviewedAt: admin.firestore.FieldValue.serverTimestamp() });

    if (decision === 'approved') {
      batch.update(db.collection('projects').doc(projectId), {
        enrolledStudentIds: admin.firestore.FieldValue.arrayUnion(studentId),
        status:    'in_progress',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batch.update(db.collection('users').doc(studentId), {
        hasActiveProject: true,
        activeProjectId:  projectId,
        supervisorId:     uid,
        updatedAt:        admin.firestore.FieldValue.serverTimestamp(),
      });
      await createMilestonesOnApproval({ projectId, studentIds: [studentId], facultyId, supervisorId: uid });
    }

    const studentSnap = await db.collection('users').doc(studentId).get();
    const token       = studentSnap.data()?.expoPushToken;

    const messages: Record<string, { titleHe:string; titleEn:string; bodyHe:string; bodyEn:string }> = {
      approved:          { titleHe:'המועמדות אושרה',  titleEn:'Application Approved',  bodyHe:'המנחה אישר את המועמדות שלך.',        bodyEn:'Your application was approved.' },
      rejected:          { titleHe:'המועמדות נדחתה',  titleEn:'Application Rejected',  bodyHe:'המנחה דחה את המועמדות שלך.',         bodyEn:'Your application was rejected.' },
      meeting_requested: { titleHe:'נקבעה פגישה',      titleEn:'Meeting Requested',     bodyHe:'המנחה ביקש לקבוע פגישה.',           bodyEn:'The supervisor requested a meeting.' },
    };
    const msg = messages[decision] ?? messages.rejected;

    const notifRef = db.collection('notifications').doc();
    batch.set(notifRef, {
      recipientId: studentId, type: decision,
      ...msg, isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      relatedProjectId: projectId, relatedMilestoneId: null,
    });
    if(!msg){
      return res.status(500).json({
        message: "message Error creating"
      })
    }
    await batch.commit();
    if (token) await sendPushNotification(token, msg.titleEn, msg.bodyEn, { type: decision, relatedProjectId: projectId });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('handleApplicationDecision error:', error);
    return res.status(500).json({ message: 'Failed to process application decision' });
  }
};

// ─── Get student project ──────────────────────────────────────────────────────
export const getStudentProject = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Invalid projectId' });

  try {
    const snap = await db.collection('projects').doc(id).get();
    if (!snap.exists) return res.status(404).json({ message: 'Project not found' });
    return res.status(200).json({ id: snap.id, ...snap.data() });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load project' });
  }
};

// ─── Submit milestone grade ───────────────────────────────────────────────────
export const submitMilestoneGrade = async (req: AuthenticatedRequest, res: Response) => {
  const uid         = (req as any).user?.uid;
  const { milestoneId } = req.params;
  const { givenScore, comments } = req.body;

  if (givenScore === undefined || givenScore === null) {
    return res.status(400).json({ message: 'Missing givenScore' });
  }
  if (!milestoneId || typeof milestoneId !== 'string') {
    return res.status(400).json({ message: 'Invalid milestoneId' });
  }

  try {
    const milestoneRef  = db.collection('milestones').doc(milestoneId);
    const milestoneSnap = await milestoneRef.get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: 'Milestone not found' });

    const data        = milestoneSnap.data() || {};
    const supervisorId= data.supervisorId;
    const examinerIds: string[] = data.examinerIds ?? [];

    const updatePayload: Record<string, any> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (uid === supervisorId) {
      updatePayload.supervisorScore    = Number(givenScore);
      updatePayload.supervisorComments = comments?.trim() ?? '';
      updatePayload.status             = 'supervisor_graded';
    } else if (examinerIds[0] === uid) {
      updatePayload.examiner1Score    = Number(givenScore);
      updatePayload.examiner1Comments = comments?.trim() ?? '';
    } else if (examinerIds[1] === uid) {
      updatePayload.examiner2Score    = Number(givenScore);
      updatePayload.examiner2Comments = comments?.trim() ?? '';
    } else {
      return res.status(403).json({ message: 'Not authorized to grade this milestone' });
    }

    // Check if all graders are done
    const next = { ...data, ...updatePayload };
    const allDone =
      next.supervisorScore  !== null &&
      (examinerIds.length < 1 || next.examiner1Score !== null) &&
      (examinerIds.length < 2 || next.examiner2Score !== null);

    if (allDone) {
      updatePayload.status   = 'graded';
      updatePayload.gradedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    await milestoneRef.update(updatePayload);
    return res.status(200).json({ success: true, status: updatePayload.status ?? data.status });
  } catch (error) {
    console.error('submitMilestoneGrade error:', error);
    return res.status(500).json({ message: 'Failed to submit grade' });
  }
};

// ─── Delete project (soft) ────────────────────────────────────────────────────
export const deleteProject = async (req: AuthenticatedRequest, res: Response) => {
  const uid  = (req as any).user?.uid;
  const { id } = req.params;
  if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Invalid projectId' });

  try {
    const projRef = db.collection('projects').doc(id);
    const snap    = await projRef.get();
    if (snap.data()?.supervisorId !== uid) return res.status(403).json({ message: 'Unauthorized' });
    // Initialize a Firestore batch
    const batch = db.batch();

    // 1. Soft-delete the project (archive it)
    batch.update(projRef, { 
      isArchived: true, 
      deletedAt: admin.firestore.FieldValue.serverTimestamp() 
    });
    const milestonesSnap = await db.collection('milestones').where('projectId', '==', id).get();
    milestonesSnap.forEach((doc) => {
      batch.delete(doc.ref); 
    });
    // Commit the batch to execute all operations simultaneously
    await batch.commit();

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: 'Deletion failed' });
  }
};

// ─── Edit project ─────────────────────────────────────────────────────────────
export const editProject = async (req: AuthenticatedRequest, res: Response) => {
  const uid  = (req as any).user?.uid;
  const { id } = req.params;
  const { titleHe, titleEn, descriptionHe, descriptionEn, degreeType, projectType, requiredSkills } = req.body;
  if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Invalid projectId' });

  try {
    const projRef = db.collection('projects').doc(id);
    const snap    = await projRef.get();
    if (snap.data()?.supervisorId !== uid) return res.status(403).json({ message: 'Unauthorized' });

    await projRef.update({
      titleHe, titleEn, descriptionHe, descriptionEn,
      degreeType, projectType, requiredSkills,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: 'Update failed' });
  }
};

// ─── Submit milestone (student) ───────────────────────────────────────────────
export const submitStudentMilestone = async (req: AuthenticatedRequest, res: Response) => {
  const { milestoneId } = req.params;
  const { fileUrls, submissionNote } = req.body;

  if (!milestoneId || typeof milestoneId !== 'string') {
    return res.status(400).json({ message: 'Invalid milestoneId' });
  }

  try {
    await db.collection('milestones').doc(milestoneId).update({
      status:         'submitted',
      submittedAt:    admin.firestore.FieldValue.serverTimestamp(),
      fileUrls:       fileUrls       ?? [],
      submissionNote: submissionNote ?? '',
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: 'Milestone submission failed' });
  }
};

export const getProjects = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Extract the query parameters sent by the frontend
    const { status, facultyId, degreeType } = req.query;

    // Start with a reference to the projects collection
    let projectsQuery: FirebaseFirestore.Query = db.collection('projects');

    // Dynamically apply filters based on what the frontend requested
    if (status) {
      projectsQuery = projectsQuery.where('status', '==', status);
    }
    if (facultyId) {
      projectsQuery = projectsQuery.where('facultyId', '==', facultyId);
    }
    if (degreeType) {
      // Note: Make sure 'degreeType' matches the exact field name in your Firestore project documents!
      // (Sometimes people name it 'targetDegree' or 'allowedDegrees')
      projectsQuery = projectsQuery.where('degreeType', '==', degreeType);
    }

    // Execute the query
    const snapshot = await projectsQuery.get();

    // Map the documents into a clean array
    const projects = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Return the data exactly how the frontend expects it: { projects: [...] }
    return res.status(200).json({ projects });

  } catch (error: any) {
    console.error('Error fetching projects list:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};