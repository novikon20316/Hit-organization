import { Router } from 'express';
import {
    getStudentProject,
    getThesisTemplate,
    getFirstStepMode,
    getBrowseSupervisors,
    joinProjectDirect,
} from '../controllers/studentController.js'
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/projects/:id', verifyToken, getStudentProject)
router.get('/thesis-template', verifyToken, getThesisTemplate)
router.get('/first-step-mode', verifyToken, getFirstStepMode)
router.get('/browse-supervisors', verifyToken, getBrowseSupervisors)
router.post('/join-project-direct', verifyToken, joinProjectDirect)



export default router;