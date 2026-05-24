import { Router } from 'express';
import {
    getStudentProject,
    submitMilestone,
    
} from '../controllers/studentController.js'
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/projects/:id', verifyToken, getStudentProject)
router.post('/projects/:id/milestones/:milestoneId/submit', verifyToken, submitMilestone)



export default router;