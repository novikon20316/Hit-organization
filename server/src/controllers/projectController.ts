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

const STAFF_ROLES = [
  'supervisor', 'secondary_supervisor', 'coordinator', 'project_coordinator',
  'program_head', 'internal_examiner', 'faculty_admin', 'grad_school_head', 'system_admin',
];

// ─── Get student project ──────────────────────────────────────────────────────
export const getStudentProject = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const requester = req.user;
  if (!requester) return res.status(401).json({ message: 'Unauthorized.' });
  if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Invalid projectId' });

  try {
    const snap = await db.collection('projects').doc(id).get();
    if (!snap.exists) return res.status(404).json({ message: 'Project not found' });

    const project = snap.data()!;
    const isOwnProject =
      project.supervisorId === requester.uid ||
      (project.enrolledStudentIds ?? []).includes(requester.uid);
    if (!isOwnProject && !STAFF_ROLES.includes(requester.role)) {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    return res.status(200).json({ id: snap.id, ...project });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load project' });
  }
};

// ─── Submit milestone grade ───────────────────────────────────────────────────
export const submitMilestoneGrade = async (req: AuthenticatedRequest, res: Response) => {
  const uid         = (req as any).user?.uid;
  const { milestoneId } = req.params;
  // Destructure the detailed grading criteria and grade from your mobile client payload
  const { givenScore, comments, projectId, criteria } = req.body;

  const grade = (criteria.clarity + criteria.methodology + criteria.feasibility + criteria.innovation + criteria.writing)
  // Fallback to extract the final score from either property name safely
  const finalScore = givenScore !== undefined && givenScore !== null ? givenScore : grade;

  if (finalScore === undefined || finalScore === null) {
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

    let graderRole = '';

    if (uid === supervisorId) {
      graderRole = 'supervisor';
      updatePayload.supervisorScore    = Number(givenScore);
      updatePayload.supervisorComments = comments?.trim() ?? '';
      updatePayload.status             = 'supervisor_graded';
    } else if (examinerIds[0] === uid) {
      graderRole = 'examiner1';
      updatePayload.examiner1Score    = Number(givenScore);
      updatePayload.examiner1Comments = comments?.trim() ?? '';
    } else if (examinerIds[1] === uid) {
      graderRole = 'examiner2';
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
    const gradeDocumentPayload = {
      milestoneId,
      projectId,
      graderId: uid,
      graderRole,
      comments: comments?.trim() ?? '',
      isFinalized: allDone, 
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      grading: {
        clarity: Math.round(Number(criteria?.clarity ?? finalScore)),
        feasibility: Math.round(Number(criteria?.feasibility ?? finalScore)),
        innovation: Math.round(Number(criteria?.innovation ?? finalScore)),
        methodology: Math.round(Number(criteria?.methodology ?? finalScore)),
        writing: Math.round(Number(criteria?.writing ?? finalScore)),
        total: Math.round(Number(finalScore))
      }
    };
    // Execute updates using a batch to guarantee consistency across collections
    const batch = db.batch();
    
    // 1. Update the parent milestone record
    batch.update(milestoneRef, updatePayload);
    
    // 2. Generate and write a unique document into the 'grades' collection
    const newGradeRef = db.collection('grades').doc();
    batch.set(newGradeRef, gradeDocumentPayload);

    await batch.commit();

    return res.status(200).json({ 
      success: true, 
      status: updatePayload.status ?? data.status 
    });
  } catch (error) {
    console.error('submitMilestoneGrade error:', error);
    return res.status(500).json({ message: 'Failed to submit grade' });
  }
};

// ─── Submit milestone (student) ───────────────────────────────────────────────
export const submitStudentMilestone = async (req: AuthenticatedRequest, res: Response) => {
  const { milestoneId } = req.params;
  const { fileUrls, submissionNote } = req.body;
  const studentId = req.user?.uid;

  if (!studentId) return res.status(401).json({ message: 'Unauthorized.' });
  if (!milestoneId || typeof milestoneId !== 'string') {
    return res.status(400).json({ message: 'Invalid milestoneId' });
  }

  try {
    const milestoneRef  = db.collection('milestones').doc(milestoneId);
    const milestoneSnap = await milestoneRef.get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: 'Milestone not found' });

    const studentIds: string[] = milestoneSnap.data()?.studentIds ?? [];
    if (!studentIds.includes(studentId)) {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    await milestoneRef.update({
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
    const { facultyId, degreeType } = req.query;
    // Default to 'active' so an omitted filter doesn't dump draft/archived
    // projects to whoever calls this. Only staff roles may opt out with
    // status=all — a student passing that should still only see active ones.
    const canSeeAllStatuses = STAFF_ROLES.includes(req.user?.role ?? '');
    const status = (canSeeAllStatuses && req.query.status === 'all')
      ? undefined
      : (req.query.status ?? 'active');

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

export const getActiveProjects = async(req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const role = req.user?.role;

  // Verify coordinator/admin roles
  if (role !== 'coordinator' && role !== 'faculty_admin' && role !== 'admin') {
    return res.status(403).json({ message: 'Unauthorized access' });
  }

  try {
    // 1. Fetch all active projects
    const projectsSnap = await db.collection('projects')
      .where('status', '==', 'active')
      .get();

    if (projectsSnap.empty) {
      return res.status(200).json({ InProgress: [] });
    }

    const rawProjects = projectsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 2. Map through projects and construct per-student relational data structures
    const inProgressPromises = rawProjects.map(async (project: any) => {
      
      // A. Fetch all milestones linked to this specific project
      const milestonesSnap = await db.collection('milestones')
        .where('projectId', '==', project.id)
        .get();
      
      const allProjectMilestones = milestonesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // B. Fetch all students assigned to this active project
      const studentsSnap = await db.collection('users')
        .where('activeProjectId', '==', project.id)
        .get();

      // Define standard chronological milestone ordering
      const MILESTONE_ORDER = ['research_proposal', 'progress_report', 'final_report', 'defense'];

      // C. Process milestones and progress per individual student
      const studentsArray = studentsSnap.docs.map(studentDoc => {
        const studentId = studentDoc.id;
        const studentData = studentDoc.data();

        // Filter out milestones belonging explicitly to this student document ID
        const studentMilestones = allProjectMilestones.filter((m: any) => {
          return Array.isArray(m.studentIds) && m.studentIds.includes(studentId);
        });

        // Sort this specific student's milestones chronologically
        studentMilestones.sort(
          (a: any, b: any) => MILESTONE_ORDER.indexOf(a.type) - MILESTONE_ORDER.indexOf(b.type)
        );

        // Calculate individual progress percentage
        const completedCount = studentMilestones.filter((m: any) => 
          m.status === 'completed' || m.status === 'coordinator_approved'
        ).length;
        
        const studentProgress = studentMilestones.length > 0 
          ? Math.round((completedCount / studentMilestones.length) * 100) 
          : 0;

        // Map milestones to match the exact keys expected by the expanded frontend rows
        const formattedMilestones = studentMilestones.map((m: any) => ({
          type: m.type,
          status: m.status,
          supervisorScore: m.grade || m.finalGrade || null 
        }));

        return {
          id: studentId,
          name: studentData?.displayName || 'Unknown Student',
          progress: studentProgress,
          milestones: formattedMilestones
        };
      });

      // D. Fetch Supervisor Name Fallback if needed
      let supervisorName = project.supervisorName || '';
      if (!supervisorName && project.supervisorId) {
        const supDoc = await db.collection('users').doc(project.supervisorId).get();
        supervisorName = supDoc.data()?.displayName || 'Unknown Supervisor';
      }

      // E. Assemble the complete project object matching the target frontend parameters
      return {
        id: project.id,
        projectTitleHe: project.titleHe || '',
        projectTitleEn: project.titleEn || '',
        facultyId: project.facultyId || '',
        supervisorName,
        status: project.status,
        students: studentsArray // Custom nested block containing targeted progress loops
      };
    });

    // Resolve asynchronous batch lookups
    const inProgressArray = await Promise.all(inProgressPromises);
    // Return the final data payload matching the client wrapper requirement
    return res.status(200).json({ InProgress: inProgressArray });

  } catch (error: any) {
    console.error('Error fetching projects list:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};