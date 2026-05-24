import { Response } from 'express';
import admin from 'firebase-admin';
import { AuthenticatedRequest } from '../middleware/auth.js'; // Adjust path if needed

const db = admin.firestore();

/**
 * 1. GET /api/projects/supervisor/dashboard
 * Fetches the supervisor's active projects, pending applications, and overall statistics.
 */
export const getSupervisorDashboard = async (req: AuthenticatedRequest, res: Response) => {
  console.log('👤 req.user object:', JSON.stringify(req.user));
  const supervisorId = req.user?.uid;
  console.log('🔑 supervisorId from token:', supervisorId);
  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized access.' });

  try {
    // Fetch supervisor profile for name + facultyId
    const userSnap = await db.collection('users').doc(supervisorId).get();
    const userData = userSnap.data() ?? {};

    const projectsSnap = await db.collection('projects')
      .where('supervisorId', '==', supervisorId)
      .get();
    const myProjects = projectsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // ✅ Fix: was 'application' — must match your Firestore collection name
    const applicationsSnap = await db.collection('applications')
      .where('supervisorId', '==', supervisorId)
      .where('status', '==', 'applied')
      .get();
    const applications = applicationsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const milestonesSnap = await db.collection('milestones')
      .where('supervisorId', '==', supervisorId)
      .where('status', '==', 'submitted')
      .get();
    const pendingGrades = milestonesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    console.log('📦 applications found:', applicationsSnap.docs.length);
    applicationsSnap.docs.forEach(d => console.log('  →', d.id, JSON.stringify(d.data())));
    return res.status(200).json({
      success: true,
      supervisorId,                                              // ← this is the critical one
      supervisorName: userData.displayNameHe ?? userData.displayNameEn ?? '',
      facultyId:      userData.facultyId ?? '',
      myProjects,
      applications,
      pendingGrades,
    });
  } catch (error: any) {
    console.error('💥 getSupervisorDashboard CRASH:', error.code, error.message, error.stack);
    return res.status(500).json({ message: 'Failed to compile supervisor dashboard data.' });
  }
};

/**
 * 2. POST /api/projects/supervisor/dashboard (or /projects)
 * Creates a new project listing under this supervisor.
 */
export const createSupervisorProject = async (req: AuthenticatedRequest, res: Response) => {
  const supervisorId = req.user?.uid;
  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized access.' });

  try {
    const projectData = req.body;
    const newProjectRef = db.collection('projects').doc();

    await newProjectRef.set({
      ...projectData,
      projectId: newProjectRef.id,
      supervisorId: supervisorId,
      status: 'active', // Default status for a brand new project
      createdAt: new Date().toISOString()
    });

    return res.status(201).json({ success: true, projectId: newProjectRef.id, message: 'Project created successfully.' });
  } catch (error: any) {
    console.error('createSupervisorProject Error:', error);
    return res.status(500).json({ message: 'Failed to create new project.' });
  }
};

/**
 * 3. POST /api/projects/supervisor/applications/decision
 * Approves or rejects a student's application to a project.
 */
export const handleApplicationDecision = async (req: AuthenticatedRequest, res: Response) => {
  const supervisorId = req.user?.uid;
  const { applicationId, decision, notes } = req.body; // decision should be 'approved' or 'rejected'

  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized.' });
  if (!applicationId || !decision) return res.status(400).json({ message: 'Missing decision parameters.' });

  try {
    const applicationRef = db.collection('application').doc(applicationId);
    const appSnap = await applicationRef.get();

    if (!appSnap.exists) return res.status(404).json({ message: 'Application not found.' });

    // Security Gate: Ensure this supervisor owns the project this application is for
    if (appSnap.data()?.supervisorId !== supervisorId) {
      return res.status(403).json({ message: 'Forbidden: You do not manage this project.' });
    }

    await applicationRef.update({
      status: decision,
      supervisorNote: notes || null,
      reviewedAt: new Date().toISOString()
    });

    // Optional: If approved, you might also want to update the actual Project document to 'enrolled'
    if (decision === 'approved') {
      const projectId = appSnap.data()?.projectId;
      const studentId = appSnap.data()?.studentId;
      await db.collection('projects').doc(projectId).update({ status: 'enrolled', studentId });
    }

    return res.status(200).json({ success: true, message: `Application ${decision} successfully.` });
  } catch (error: any) {
    console.error('handleApplicationDecision Error:', error);
    return res.status(500).json({ message: 'Failed to process application decision.' });
  }
};

/**
 * 4. POST /api/projects/supervisor/milestones/:id/grade
 * Submits grades/evaluations for a specific project milestone.
 */
export const gradeMilestone = async (req: AuthenticatedRequest, res: Response) => {
  const supervisorId = req.user?.uid;
  const { id: milestoneId } = req.params;
  const { score, feedback } = req.body;

  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized.' });
  if(!milestoneId || typeof milestoneId !== 'string'){
    return res.status(400).json({
        success:false,
        message: "Error gradeMilestone milestoneId is not good"
    })
  }
  try {
    const milestoneRef = db.collection('milestones').doc(milestoneId);
    const milestoneSnap = await milestoneRef.get();

    if (!milestoneSnap.exists) return res.status(404).json({ message: 'Milestone not found.' });

    await milestoneRef.update({
      [`supervisorGrading.${supervisorId}`]: {
        score: Number(score),
        feedback: feedback || '',
        gradedAt: new Date().toISOString()
      },
      status: 'graded'
    });

    return res.status(200).json({ success: true, message: 'Milestone graded successfully.' });
  } catch (error: any) {
    console.error('gradeMilestone Error:', error);
    return res.status(500).json({ message: 'Failed to submit milestone grade.' });
  }
};

/**
 * 5. PUT /api/projects/supervisor/projects/:id
 * Updates existing project details (title, description, requirements, etc.).
 */
export const updateSupervisorProject = async (req: AuthenticatedRequest, res: Response) => {
  const supervisorId = req.user?.uid;
  const { id: projectId } = req.params;
  const updateData = req.body;

  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized.' });
  if(!projectId || typeof projectId !== 'string'){
    return res.status(400).json({
        success:false,
        message: "Error updating projectId is not good"
    })
  }
  try {
    const projectRef = db.collection('projects').doc(projectId);
    const projectSnap = await projectRef.get();

    if (!projectSnap.exists) return res.status(404).json({ message: 'Project not found.' });

    // Security Gate: Prevent supervisors from editing other supervisors' projects
    if (projectSnap.data()?.supervisorId !== supervisorId) {
      return res.status(403).json({ message: 'Forbidden: You can only edit your own projects.' });
    }

    await projectRef.update({
      ...updateData,
      updatedAt: new Date().toISOString()
    });

    return res.status(200).json({ success: true, message: 'Project updated successfully.' });
  } catch (error: any) {
    console.error('updateSupervisorProject Error:', error);
    return res.status(500).json({ message: 'Failed to update project.' });
  }
};

/**
 * 6. DELETE /api/projects/supervisor/projects/:id
 * Deletes a project completely.
 */
export const deleteSupervisorProject = async (req: AuthenticatedRequest, res: Response) => {
  const supervisorId = req.user?.uid;
  const { id: projectId } = req.params;

  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized.' });
  if(!projectId || typeof projectId !== 'string'){
    return res.status(400).json({
        success:false,
        message: "Error Deleting projectId is not good"
    })
  }
  try {
    const projectRef = db.collection('projects').doc(projectId);
    const projectSnap = await projectRef.get();

    if (!projectSnap.exists) return res.status(404).json({ message: 'Project not found.' });

    // Security Gate: Ensure the supervisor owns the project before allowing deletion
    if (projectSnap.data()?.supervisorId !== supervisorId) {
      return res.status(403).json({ message: 'Forbidden: You can only delete your own projects.' });
    }

    await projectRef.delete();

    // Optional: You could also add logic here to delete associated applications or milestones
    // using a batched write, similar to how we handled search-and-delete previously.

    return res.status(200).json({ success: true, message: 'Project deleted successfully.' });
  } catch (error: any) {
    console.error('deleteSupervisorProject Error:', error);
    return res.status(500).json({ message: 'Failed to delete project.' });
  }
};