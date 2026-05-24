import { Router, Response } from 'express';
import {
    updateSupervisorProject,
    deleteSupervisorProject,
    gradeMilestone,
    getSupervisorDashboard,
    handleApplicationDecision,
    createSupervisorProject
} from '../controllers/supervisorController.js'
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/dashboard', verifyToken, getSupervisorDashboard)
router.put('/projects/:id', verifyToken, updateSupervisorProject)
router.delete('/projects/:id', verifyToken, deleteSupervisorProject)
router.post('/milestones/:id/grade', verifyToken, gradeMilestone)
router.post('/decision', verifyToken, handleApplicationDecision)
router.post('/projects', verifyToken, createSupervisorProject)


export default router;