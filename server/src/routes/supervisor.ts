import { Router, Response } from 'express';
import {
    updateSupervisorProject,
    getSupervisorDashboard,
    getSupervisorProjectDetail,
    handleApplicationDecision,
    createSupervisorProject,
    uploadProjectFile,
    getSupervisorExaminerRecommendations,
    createExaminerRecommendation,
    submitStaffRecord,
    decideFinalGrade,
    proposeMeeting,
    getCalendarStatus,
    getCalendarConnectUrl,
    handleCalendarCallback,
    disconnectCalendarHandler,
} from '../controllers/supervisorController.js'
import { uploadMiddleware, handleUploadError } from '../controllers/milestoneController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/dashboard', verifyToken, getSupervisorDashboard)
router.get('/projects/:id/detail', verifyToken, getSupervisorProjectDetail)
router.put('/projects/:id', verifyToken, updateSupervisorProject)
// Grading goes through POST /api/projects/milestones/:milestoneId/grade
// (submitMilestoneGrade) — this file's own duplicate gradeMilestone endpoint
// (with zero live callers) was removed.
router.post('/applications/decision', verifyToken, handleApplicationDecision)
router.post('/applications/:id/propose-meeting', verifyToken, proposeMeeting)
// Calendar connect/status/disconnect are authenticated API calls from our own
// client; the callback below is Google's OAuth redirect landing back on the
// server itself, so it deliberately has no verifyToken — see
// handleCalendarCallback's own comment for how it authenticates instead.
router.get('/calendar/status', verifyToken, getCalendarStatus)
router.get('/calendar/connect', verifyToken, getCalendarConnectUrl)
router.get('/calendar/callback', handleCalendarCallback)
router.post('/calendar/disconnect', verifyToken, disconnectCalendarHandler)
router.post('/projects', verifyToken, createSupervisorProject)
router.post('/projects/upload-file', verifyToken, uploadMiddleware, handleUploadError, uploadProjectFile)
router.get('/examiner-recommendations', verifyToken, getSupervisorExaminerRecommendations)
router.post('/examiner-recommendations', verifyToken, createExaminerRecommendation)
// Staff record (research_proposal/progress_report, upload-or-form) and the
// three-rubric final-grade decision (defense) — see workflowTemplates.ts's
// staffRecordMode/finalGradeComponents for which faculties these apply to.
router.post('/milestones/:id/staff-record', verifyToken, uploadMiddleware, submitStaffRecord)
router.post('/milestones/:id/final-grade-decision', verifyToken, uploadMiddleware, decideFinalGrade)


export default router;