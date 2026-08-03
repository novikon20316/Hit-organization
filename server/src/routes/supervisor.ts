import { Router, Response } from 'express';
import {
    updateSupervisorProject,
    deleteSupervisorProject,
    getSupervisorDashboard,
    getSupervisorProjectDetail,
    handleApplicationDecision,
    createSupervisorProject,
    getSupervisorExaminerRecommendations,
    createExaminerRecommendation,
} from '../controllers/supervisorController.js'
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/dashboard', verifyToken, getSupervisorDashboard)
router.get('/projects/:id/detail', verifyToken, getSupervisorProjectDetail)
router.put('/projects/:id', verifyToken, updateSupervisorProject)
router.delete('/projects/:id', verifyToken, deleteSupervisorProject)
// Grading goes through POST /api/projects/milestones/:milestoneId/grade
// (submitMilestoneGrade) — this file's own duplicate gradeMilestone endpoint
// (with zero live callers) was removed.
router.post('/applications/decision', verifyToken, handleApplicationDecision)
router.post('/projects', verifyToken, createSupervisorProject)
router.get('/examiner-recommendations', verifyToken, getSupervisorExaminerRecommendations)
router.post('/examiner-recommendations', verifyToken, createExaminerRecommendation)


export default router;