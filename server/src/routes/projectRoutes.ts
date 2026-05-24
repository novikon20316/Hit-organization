import { Router } from 'express';
import { authenticateUser, verifyToken } from '../middleware/auth.js';
import {
  getSupervisorDashboard,
  createProject,
  handleApplicationDecision,
  getStudentProject,
  submitStudentMilestone,
  submitMilestoneGrade,
  deleteProject,
  editProject,
  getProjects,
} from '../controllers/projectController.js';
const router = Router();

router.get('/', verifyToken, getProjects)
// Supervisor Dashboards
router.get('/supervisor/dashboard', authenticateUser, getSupervisorDashboard);
router.post('/supervisor/projects', authenticateUser, createProject);
router.post('/supervisor/applications/decision', authenticateUser, handleApplicationDecision);
router.post('/projects/milestones/:milestoneId/grade', authenticateUser, submitMilestoneGrade);
router.delete('/supervisor/projects/:id', authenticateUser, deleteProject);
router.put('/supervisor/projects/:id', authenticateUser, editProject);
// Student Interfaces
router.get('/student/projects/:id', authenticateUser, getStudentProject);
router.post('/student/projects/:id/milestones/:milestoneId/submit', authenticateUser, submitStudentMilestone);

export default router;