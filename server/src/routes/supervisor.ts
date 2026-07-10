import { Router, Response } from 'express';
import {
    updateSupervisorProject,
    deleteSupervisorProject,
    gradeMilestone,
    getSupervisorDashboard,
    handleApplicationDecision,
    createSupervisorProject,
    getSupervisorExaminerRecommendations,
    createExaminerRecommendation,
} from '../controllers/supervisorController.js'
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/dashboard', verifyToken, getSupervisorDashboard)
router.put('/projects/:id', verifyToken, updateSupervisorProject)
router.delete('/projects/:id', verifyToken, deleteSupervisorProject)
router.post('/milestones/:id/grade', verifyToken, gradeMilestone)
router.post('/applications/decision', verifyToken, handleApplicationDecision)
router.post('/projects', verifyToken, createSupervisorProject)
router.get('/examiner-recommendations', verifyToken, getSupervisorExaminerRecommendations)
router.post('/examiner-recommendations', verifyToken, createExaminerRecommendation)


export default router;