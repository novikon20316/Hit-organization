import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  requestProjectErasureHandler,
  getPendingErasureRequests,
  decideErasureRequestHandler,
  eraseProjectHandler,
  restoreProjectHandler,
  getArchivedProjects,
} from '../controllers/projectErasureController.js';

const router = Router();

// POST /api/projects/:id/request-erasure   { reason }               — supervisor/secondary_supervisor
router.post('/:id/request-erasure', verifyToken, requestProjectErasureHandler);
// GET  /api/projects/erasure-requests/pending                       — coordinator/system_admin
router.get('/erasure-requests/pending', verifyToken, getPendingErasureRequests);
// POST /api/projects/erasure-requests/:id/decide  { decision, reason? } — coordinator/system_admin
router.post('/erasure-requests/:id/decide', verifyToken, decideErasureRequestHandler);
// POST /api/projects/:id/erase   { reason? }                        — system_admin only
router.post('/:id/erase', verifyToken, eraseProjectHandler);
// POST /api/projects/:id/restore                                    — coordinator/system_admin
router.post('/:id/restore', verifyToken, restoreProjectHandler);
// GET  /api/projects/archived                                       — coordinator/system_admin
router.get('/archived', verifyToken, getArchivedProjects);

export default router;
