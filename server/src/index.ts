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
import supervisorRoute    from './routes/supervisor.js';
import studentRoutes      from './routes/student.js';
import staffRoutes        from './routes/staff.js';
import authRoutes         from './routes/authRoutes.js';
import { verifyToken } from './middleware/auth.js';
import { getMilestonesByQuery } from './controllers/milestoneController.js';
import { v2 as cloudinary } from 'cloudinary';


dotenv.config()
const app  = express();
const PORT = Number(process.env.PORT) || 5000; // ← cast to number fixes ts(2769)

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.get('/api/projects/:projectId/milestones', verifyToken, getMilestonesByQuery);

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
app.use('/api/supervisor',    supervisorRoute);
app.use('/api/student',       studentRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/staff',         staffRoutes);
app.use('/api/auth',          authRoutes);
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

// ─── 0.0.0.0 lets physical devices reach the server on local network ──────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});