import {Router} from 'express'
import{
    getFacultyTemplateDashboard,
    createFacultyTemplate,
    updateFacultyTemplate,
    deleteFacultyTemplate,
    approveTemplateProposal,
    rejectTemplateProposal,
} from '../controllers/facultyTemplateController.js'
import { verifyToken } from '../middleware/auth.js';

const router = Router()

router.get('/dashboard', verifyToken, getFacultyTemplateDashboard)
router.post('/', verifyToken, createFacultyTemplate)
router.put('/:templateId', verifyToken, updateFacultyTemplate)
router.delete('/:templateId', verifyToken, deleteFacultyTemplate)
router.post('/proposals/:templateId/approve', verifyToken, approveTemplateProposal)
router.post('/proposals/:templateId/reject', verifyToken, rejectTemplateProposal)

export default router;