// backend/controllers/examinerController.ts
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import admin from 'firebase-admin';

const db = admin.firestore();

/**
 * GET /api/examiner/dashboard
 * FIX: was reading examinerId from req.params — frontend sends no param,
 * it relies on the auth token. Now reads uid from req.user instead.
 */
export const getExaminerDashboard = async (req: AuthenticatedRequest, res: Response) => {
  const examinerId = req.user?.uid; // <-- FIXED: was const { examinerId } = req.params

  if (!examinerId) {
    return res.status(401).json({ message: 'Unauthorized: missing examiner identity.' });
  }

  try {
    const milestonesSnap = await db.collection('milestones')
      .where('examinerIds', 'array-contains', examinerId)
      .get();

    if (milestonesSnap.empty) {
      return res.status(200).json({ milestones: [] });
    }

    const assignedMilestones = await Promise.all(
      milestonesSnap.docs.map(async (milestoneDoc) => {
        const milestoneData = milestoneDoc.data();

        let projectTitleHe = 'Unknown';
        let projectTitleEn = 'Unknown';

        if (milestoneData.projectId) {
          const projectSnap = await db.collection('projects').doc(milestoneData.projectId).get();
          if (projectSnap.exists) {
            projectTitleHe = projectSnap.data()?.titleHe || 'Unknown';
            projectTitleEn = projectSnap.data()?.titleEn || 'Unknown';
          }
        }

        return {
          id: milestoneDoc.id,
          projectId: milestoneData.projectId,
          projectTitleHe,
          projectTitleEn,
          type: milestoneData.type,
          status: milestoneData.status,
          studentNames: milestoneData.studentNames || [],
          studentIds: milestoneData.studentIds || [],
          supervisorId: milestoneData.supervisorId,
          supervisorScore: milestoneData.supervisorScore || null,
          supervisorName: milestoneData.supervisorName || 'Unknown',
          examinerIds: milestoneData.examinerIds || [],
          examiner1Score: milestoneData.examiner1Score || null,
          examiner2Score: milestoneData.examiner2Score || null,
          examiner1GradeId: milestoneData.examiner1GradeId || null,
          examiner2GradeId: milestoneData.examiner2GradeId || null,
        };
      })
    );

    res.status(200).json({ milestones: assignedMilestones });

  } catch (error) {
    console.error('Failed to fetch examiner dashboard:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * POST /api/examiner/milestones/:milestoneId/grade
 * FIX 1: route param renamed from :projectId to :milestoneId to match the
 *         frontend call: /api/examiner/milestones/${selected.id}/grade
 * FIX 2: now writes grading data onto the milestone document (not the project),
 *         which is consistent with how supervisorController grades milestones.
 */
export const updateGrading = async (req: AuthenticatedRequest, res: Response) => {
  const { milestoneId } = req.params; // <-- FIXED: was const { projectId } = req.params

  const { Totalscores, totalScore, comments, criteria } = req.body;
  const examinerUid = req.user?.uid;

  if (!milestoneId || typeof milestoneId !== 'string') {
    return res.status(400).json({ message: 'Missing required milestoneId parameter.' });
  }

  if (!examinerUid) {
    return res.status(401).json({ message: 'Unauthorized: Unable to verify examiner credentials.' });
  }

  try {
    const milestoneRef = db.collection('milestones').doc(milestoneId); // <-- FIXED: was projects
    const milestoneSnap = await milestoneRef.get();

    if (!milestoneSnap.exists) {
      return res.status(404).json({ message: 'Target milestone record not found.' });
    }

    console.log(`📡 Examiner (${examinerUid}) submitting grade for milestone: ${milestoneId}`);

    await milestoneRef.update({
      [`examinerGrading.${examinerUid}`]: {
        totalScore: totalScore !== undefined ? Number(totalScore) : null,
        breakdownScores: Totalscores || null,
        criteriaMapping: criteria || null,
        comments: comments || '',
        gradedAt: new Date().toISOString(),
      },
      lastGradingActivity: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: 'Examiner grading evaluations updated successfully.',
    });
  } catch (error) {
    console.error('Failed to update examiner grades:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getList = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const examinersSnap = await db.collection('users').where('role', '==', 'examiner').get();
    const examiners = examinersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json({ examiners });
  } catch (error) {
    console.error('Failed to fetch examiners:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}