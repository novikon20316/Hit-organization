import { Router } from 'express';
import {
    getStudentProject,    
} from '../controllers/studentController.js'
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/projects/:id', verifyToken, getStudentProject)



export default router;