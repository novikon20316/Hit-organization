// src/routes/users.ts

import { Router, Response } from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  logout,
  updatePushToken,
  getUserProfile,
  syncData,
  getFullFirestore
} from '../controllers/userController.js'
console.log("🔥 Loading user routes...");
const router = Router();

// ─── GET /api/users/me ────────────────────────────────────────────────────────
// Returns the full Firestore user document for the authenticated user.
router.get('/me', verifyToken, getFullFirestore);
router.post('/sync', verifyToken, syncData);
router.get('/profile', verifyToken, getUserProfile)
router.post('/update-push-token', verifyToken, updatePushToken)
router.post('/logout', verifyToken, logout)


export default router;