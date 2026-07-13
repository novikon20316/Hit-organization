import { Router } from 'express';
import {
    getStudentProject,
    getThesisTemplate,
} from '../controllers/studentController.js'
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/projects/:id', verifyToken, getStudentProject)
router.get('/thesis-template', verifyToken, getThesisTemplate)



export default router;