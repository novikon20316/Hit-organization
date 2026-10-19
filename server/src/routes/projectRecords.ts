import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  getProjectRecord,
  getMyProjectRecords,
  getScopedSupervisors,
  getSupervisorProjectRecords,
  getFacultyTaxonomyForRecords,
  editProjectRecordEntry,
  deleteProjectRecordEntry,
  restoreProjectRecordEntry,
  updateProjectRecordNumber,
  exportProjectRecords,
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
// GET /api/project-records/export?facultyId=&from=&to= — .xlsx of every
// record the caller may see. Must stay above '/:projectId'.
router.get('/export', verifyToken, exportProjectRecords);

// system_admin-only break-glass corrections — see projectRecordsController.ts's
// own header comment on each handler.
// PATCH /api/project-records/entries/:entryId
router.patch('/entries/:entryId', verifyToken, editProjectRecordEntry);
// DELETE /api/project-records/entries/:entryId
router.delete('/entries/:entryId', verifyToken, deleteProjectRecordEntry);
// POST /api/project-records/entries/:entryId/restore
router.post('/entries/:entryId/restore', verifyToken, restoreProjectRecordEntry);
// PATCH /api/project-records/:projectId/record-number
router.patch('/:projectId/record-number', verifyToken, updateProjectRecordNumber);

// GET /api/project-records/:projectId
router.get('/:projectId', verifyToken, getProjectRecord);

export default router;
