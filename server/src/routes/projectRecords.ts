import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  getProjectRecord,
  getMyProjectRecords,
  getScopedSupervisors,
  getSupervisorProjectRecords,
  getFacultyTaxonomyForRecords,
} from '../controllers/projectRecordsController.js';

const router = Router();

// GET /api/project-records/faculties
router.get('/faculties', verifyToken, getFacultyTaxonomyForRecords);
// GET /api/project-records/supervisors
router.get('/supervisors', verifyToken, getScopedSupervisors);
// GET /api/project-records/supervisors/:supervisorId/projects
router.get('/supervisors/:supervisorId/projects', verifyToken, getSupervisorProjectRecords);
// GET /api/project-records/my-projects
router.get('/my-projects', verifyToken, getMyProjectRecords);
// GET /api/project-records/:projectId
router.get('/:projectId', verifyToken, getProjectRecord);

export default router;
