import { Router, Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest, verifyToken } from '../middleware/auth.js';

const router = Router();

/**
 * @route   POST /api/milestones/grade
 * @desc    Secures the evaluation endpoint against cross-faculty configuration parameters
 */
router.post('/grade', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { projectId, milestoneType, scores, feedback, approved } = req.body;
    
    // Safety guard using attributes mapped directly from your verification sequence
    const evaluatorRole = req.user?.role;
    const evaluatorFaculty = req.user?.facultyId;

    if (!projectId || !milestoneType) {
      return res.status(400).json({ error: 'Missing evaluation metadata criteria.' });
    }

    // Pull project context from database
    const projectDoc = await db.collection('projects').doc(projectId).get();
    if (!projectDoc.exists) {
      return res.status(404).json({ error: 'Project file not found.' });
    }

    const projectData = projectDoc.data();

    // ENFORCE SECURITY RULES: Bypassed by system_admin, otherwise checked strictly against project facultyId
    if (evaluatorRole !== 'system_admin' && evaluatorFaculty !== projectData?.facultyId) {
      return res.status(403).json({ error: 'Access Denied: Cross-faculty grading violations detected.' });
    }

    const submissionRef = db.collection('projects').doc(projectId).collection('submissions').doc(milestoneType);

    await submissionRef.set({
      status: approved ? 'approved' : 'rejected',
      evaluation: {
        evaluatorUid: req.user?.uid,
        feedback, // Safe bilingual processing context
        scores,
        gradedAt: new Date().toISOString()
      }
    }, { merge: true });

    return res.status(200).json({ success: true, message: 'Evaluation securely verified and committed.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;