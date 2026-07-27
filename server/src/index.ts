// src/index.ts

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv'
import userRoutes         from './routes/users.js';
import applicationRoutes  from './routes/applications.js';
import milestoneRoutes    from './routes/milestones.js';
import notificationRoutes from './routes/notifications.js';
import projectRoutes      from './routes/projectRoutes.js';
import chatRoutes         from './routes/chatRoute.js';
import adminRoutes        from './routes/adminRoutes.js';
import coordinatorRoutes  from './routes/coordinator.js';
import projectCoordinatorRoutes from './routes/projectCoordinator.js';
import supervisorRoute    from './routes/supervisor.js';
import studentRoutes      from './routes/student.js';
import staffRoutes        from './routes/staff.js';
import authRoutes         from './routes/authRoutes.js';
import examinerRoutes     from './routes/examiner.js';
import maintenanceRoutes  from './routes/maintenanceRoutes.js';
import facultyTemplateRoutes from './routes/facultyTemplates.js';
import workflowTemplateRoutes from './routes/workflowTemplates.js';
import reportsRoutes from './routes/reports.js';
import examinerAccessRoutes from './routes/examinerAccess.js';
import gradSchoolHeadRoutes from './routes/gradSchoolHead.js';
import programHeadRoutes from './routes/programHead.js';
import loginSecurityRoutes from './routes/loginSecurity.js';
import legalRoutes from './routes/legal.js';
import feedbackRoutes from './routes/feedback.js';
import gradeHistoryRoutes from './routes/gradeHistory.js';
import clockPauseRoutes from './routes/clockPause.js';
import exceptionalActionRoutes from './routes/exceptionalActions.js';
import examinerEscalationRoutes from './routes/examinerEscalation.js';
import trackChangeRoutes from './routes/trackChange.js';
import bulkPermissionsRoutes from './routes/bulkPermissions.js';
import presenceRoutes from './routes/presence.js';
import { verifyToken } from './middleware/auth.js';
import { getMilestonesByQuery } from './controllers/milestoneController.js';
import { getInfoFiles } from './controllers/infoFilesController.js';
import { getFacultyContent } from './controllers/facultyContentController.js';
import { getStudentStatusOptions } from './controllers/studentStatusController.js';
import { v2 as cloudinary } from 'cloudinary';
import { purgeDueAccounts, flagGraduatedStudents } from './services/accountDeletion.js';
import { sendMilestoneDeadlineReminders, sendExaminerDeadlineReminders } from './services/notificationScheduler.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { WEBSITE_URL } from './config/links.js';


dotenv.config()
const app  = express();
const PORT = Number(process.env.PORT) || 5000; // ← cast to number fixes ts(2769)

// MEDIUM FIX: Express 5 auto-forwards rejections from async route handlers
// to the error middleware below, and every scheduled sweep in this file
// already self-catches — but neither covers a stray fire-and-forget async
// call outside the request lifecycle (nothing today, but nothing prevents
// one being added later). Without this, that would be a true unhandled
// rejection, which under Node's default terminates the ENTIRE process —
// taking down every in-flight request for every user, not just the one
// that triggered it. unhandledRejection is logged and the process keeps
// running (the promise itself already failed; nothing else is corrupted).
// uncaughtException logs and exits — Node's own guidance is that a process
// is in an undefined state after one, so continuing risks running
// corrupted; Render restarts the process automatically on exit.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception — exiting:', err);
  process.exit(1);
});

// LOW FIX: baseline security response headers (X-Content-Type-Options,
// X-Frame-Options, Strict-Transport-Security, etc). Defaults only — this is
// a JSON API with no HTML views, so helmet's default CSP has nothing to
// restrict here.
app.use(helmet());

// LOW FIX: cors() with no options reflects and allows every origin. Only
// browsers enforce CORS at all, so the only real consumer of this allowlist
// is the web frontend; React Native's fetch sends no Origin header and is
// unaffected either way. `!origin` also covers curl/Postman/server-to-server
// calls, which were never subject to CORS in the first place.
const ALLOWED_ORIGINS = new Set([
  WEBSITE_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);
app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.has(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
}));
app.use(express.json({ limit: '10mb' }));
app.use('/api', apiLimiter);
app.get('/api/projects/:projectId/milestones', verifyToken, getMilestonesByQuery);
// Any authenticated user (students included) can list info files —
// not scoped under /api/admin or /api/coordinator, which only handle
// uploading/deleting them.
app.get('/api/info-files', verifyToken, getInfoFiles);
// Same reasoning — free-text faculty procedures/announcements (requirements
// doc section 15), companion to info-files' file attachments.
app.get('/api/faculty-content', verifyToken, getFacultyContent);
// Same reasoning as info-files above — any authenticated user needs to be
// able to resolve a status key to a label wherever it's displayed, not just
// whoever can edit the option lists (that's /api/admin/student-statuses).
app.get('/api/student-statuses', verifyToken, getStudentStatusOptions);

const cloudName = process.env.CLOUDINARY_CLOUD_NAME!;
const apiKey = process.env.CLOUDINARY_API_KEY!;
const apiSecret = process.env.CLOUDINARY_API_SECRET!;

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
});

app.use((req, res, next) => {
  console.log(`📥 Incoming: ${req.method} ${req.url}`);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
// PUBLIC, unauthenticated — required by Google Play's Data Safety / store
// listing review, which needs a reachable privacy policy URL.
app.use(legalRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/milestones',    milestoneRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/feedback',      feedbackRoutes);
app.use('/api/projects',      projectRoutes);
app.use('/api/chats',         chatRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/coordinator',   coordinatorRoutes);
app.use('/api/project-coordinator', projectCoordinatorRoutes);
app.use('/api/supervisor',    supervisorRoute);
app.use('/api/student',       studentRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/staff',         staffRoutes);
app.use('/api/auth',          authRoutes);
// PUBLIC — no verifyToken. A failed login has no token to attach; identity
// comes from independently re-verifying the password, or from the one-time
// incident code itself. See routes/loginSecurity.ts.
app.use('/api/auth',          loginSecurityRoutes);
app.use('/api/examiner',      examinerRoutes);
// Mounted at /api root — its own route paths already include the full
// segments (/system/maintenance-status, /admin/system/maintenance).
app.use('/api',               maintenanceRoutes);
app.use('/api/faculty-templates', facultyTemplateRoutes);
app.use('/api/workflow-templates', workflowTemplateRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/grad-school-head', gradSchoolHeadRoutes);
app.use('/api/program-head', programHeadRoutes);
// PUBLIC — no verifyToken. External examiners have no Firebase Auth account;
// identity comes from the token/grant code itself. See routes/examinerAccess.ts.
app.use('/api/examiner-access', examinerAccessRoutes);
app.use('/api/grades',        gradeHistoryRoutes);
app.use('/api/projects',      clockPauseRoutes);
app.use('/api/projects',      trackChangeRoutes);
app.use('/api/exceptional-actions', exceptionalActionRoutes);
app.use('/api/coordinator/examiner-escalations', examinerEscalationRoutes);
app.use('/api/admin/permissions', bulkPermissionsRoutes);
app.use('/api/presence', presenceRoutes);
// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ message: 'Internal Server Error' });
});

app.use((req, res) => {
  console.log(`🕵️‍♂️ 404 TRAP CAUGHT A REQUEST: ${req.method} ${req.url}`);
  res.status(404).json({ message: "Route not found" });
});

app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.path}`);
  next();
});

// ─── Account-deletion scheduled sweeps ─────────────────────────────────────────
// In-process interval, not a Cloud Function — this server is already a
// persistent long-running process and no functions/ directory or deployed
// scheduled function exists in this repo today. If this ever moves to
// serverless/multi-instance, these should become real Cloud Scheduler jobs.
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS  = 24 * ONE_HOUR_MS;
setInterval(() => {
  purgeDueAccounts().catch((err) => console.error('purgeDueAccounts sweep failed:', err));
}, ONE_HOUR_MS);
setInterval(() => {
  flagGraduatedStudents().catch((err) => console.error('flagGraduatedStudents sweep failed:', err));
}, ONE_DAY_MS);
// Deadline/escalation notifications — see services/notificationScheduler.ts.
// Hourly (not daily) so a reminder fires promptly once its threshold is
// crossed; per-doc dedup flags keep repeated runs from resending it.
setInterval(() => {
  sendMilestoneDeadlineReminders().catch((err) => console.error('sendMilestoneDeadlineReminders sweep failed:', err));
}, ONE_HOUR_MS);
setInterval(() => {
  sendExaminerDeadlineReminders().catch((err) => console.error('sendExaminerDeadlineReminders sweep failed:', err));
}, ONE_HOUR_MS);

// ─── 0.0.0.0 lets physical devices reach the server on local network ──────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});