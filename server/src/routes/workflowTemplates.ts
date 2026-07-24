import { Router } from 'express';
import {
  getWorkflowTemplates,
  createWorkflowTemplateProposal,
  approveWorkflowTemplateController,
  rejectWorkflowTemplateController,
  deleteWorkflowTemplateController,
  getRetroactivePreviewController,
} from '../controllers/workflowTemplateController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/', verifyToken, getWorkflowTemplates);
// Mounted ahead of the generic '/:id' shape below — a fixed path, never
// mistaken for a template id.
router.get('/retroactive-preview', verifyToken, getRetroactivePreviewController);
router.post('/', verifyToken, createWorkflowTemplateProposal);
router.post('/:id/approve', verifyToken, approveWorkflowTemplateController);
router.post('/:id/reject', verifyToken, rejectWorkflowTemplateController);
router.delete('/:id', verifyToken, deleteWorkflowTemplateController);

export default router;
