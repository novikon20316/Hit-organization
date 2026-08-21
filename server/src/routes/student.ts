import { Router } from 'express';
import {
    getStudentProject,
    getThesisTemplate,
    getFirstStepMode,
    getBrowseSupervisors,
    joinProjectDirect,
} from '../controllers/studentController.js'
import { chooseTrack } from '../controllers/studentTrackController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/projects/:id', verifyToken, getStudentProject)
router.get('/thesis-template', verifyToken, getThesisTemplate)
router.get('/first-step-mode', verifyToken, getFirstStepMode)
router.get('/browse-supervisors', verifyToken, getBrowseSupervisors)
router.post('/join-project-direct', verifyToken, joinProjectDirect)
// POST /api/student/track/choose   { track: 'thesis'|'project' } — self-service
router.post('/track/choose', verifyToken, chooseTrack)



export default router;