import { Router } from 'express';
import {
  getWorkflowTemplates,
  createWorkflowTemplateProposal,
  approveWorkflowTemplateController,
  rejectWorkflowTemplateController,
} from '../controllers/workflowTemplateController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/', verifyToken, getWorkflowTemplates);
router.post('/', verifyToken, createWorkflowTemplateProposal);
router.post('/:id/approve', verifyToken, approveWorkflowTemplateController);
router.post('/:id/reject', verifyToken, rejectWorkflowTemplateController);

export default router;
