// src/index.ts

import express from 'express';
import cors from 'cors';
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
import examinerAccessRoutes from './routes/examinerAccess.js';
import gradSchoolHeadRoutes from './routes/gradSchoolHead.js';
import programHeadRoutes from './routes/programHead.js';
import { verifyToken } from './middleware/auth.js';
import { getMilestonesByQuery } from './controllers/milestoneController.js';
import { getInfoFiles } from './controllers/infoFilesController.js';
import { v2 as cloudinary } from 'cloudinary';
import { purgeDueAccounts, flagGraduatedStudents } from './services/accountDeletion.js';
import { apiLimiter } from './middleware/rateLimit.js';


dotenv.config()
const app  = express();
const PORT = Number(process.env.PORT) || 5000; // ← cast to number fixes ts(2769)

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/api', apiLimiter);
app.get('/api/projects/:projectId/milestones', verifyToken, getMilestonesByQuery);
// Any authenticated user (students included) can list info files —
// not scoped under /api/admin or /api/coordinator, which only handle
// uploading/deleting them.
app.get('/api/info-files', verifyToken, getInfoFiles);

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
  console.log(`📦 Headers:`, req.headers.authorization); 
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/users',         userRoutes);
app.use('/api/milestones',    milestoneRoutes);
app.use('/api/notifications', notificationRoutes);
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
app.use('/api/examiner',      examinerRoutes);
// Mounted at /api root — its own route paths already include the full
// segments (/system/maintenance-status, /admin/system/maintenance).
app.use('/api',               maintenanceRoutes);
app.use('/api/faculty-templates', facultyTemplateRoutes);
app.use('/api/grad-school-head', gradSchoolHeadRoutes);
app.use('/api/program-head', programHeadRoutes);
// PUBLIC — no verifyToken. External examiners have no Firebase Auth account;
// identity comes from the token/grant code itself. See routes/examinerAccess.ts.
app.use('/api/examiner-access', examinerAccessRoutes);
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

// ─── 0.0.0.0 lets physical devices reach the server on local network ──────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});