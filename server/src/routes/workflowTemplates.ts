import { Router } from 'express';
import {
  getWorkflowTemplates,
  createWorkflowTemplateProposal,
  updateWorkflowTemplateProposalController,
  approveWorkflowTemplateController,
  rejectWorkflowTemplateController,
  deleteWorkflowTemplateController,
  duplicateWorkflowTemplateController,
  getRetroactivePreviewController,
} from '../controllers/workflowTemplateController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/', verifyToken, getWorkflowTemplates);
// Mounted ahead of the generic '/:id' shape below — a fixed path, never
// mistaken for a template id.
router.get('/retroactive-preview', verifyToken, getRetroactivePreviewController);
router.post('/', verifyToken, createWorkflowTemplateProposal);
router.put('/:id', verifyToken, updateWorkflowTemplateProposalController);
router.post('/:id/approve', verifyToken, approveWorkflowTemplateController);
router.post('/:id/reject', verifyToken, rejectWorkflowTemplateController);
// A fixed path, mounted alongside retroactive-preview above — resolved by
// facultyId+processType+major (findApprovedTemplateId), not a doc id, so it
// must never be shadowed by the generic '/:id/...' shapes below.
router.post('/duplicate', verifyToken, duplicateWorkflowTemplateController);
router.delete('/:id', verifyToken, deleteWorkflowTemplateController);

export default router;
