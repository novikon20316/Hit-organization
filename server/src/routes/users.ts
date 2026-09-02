// src/routes/users.ts

import { Router, Response } from 'express';
import { verifyToken, verifyTokenOnly  } from '../middleware/auth.js';
import { loginSecurityLimiter } from '../middleware/rateLimit.js';
import {
  logout,
  logLogin,
  updatePushToken,
  getUserProfile,
  syncData,
  getFullFirestore,
  changePassword,
  requestAccountDeletion,
  cancelAccountDeletion,
  verifyStudentEligibility,
  completeOnboardingTour,
  uploadUserPhoto,
  getUserPhotoUrl,
  photoUploadMiddleware,
} from '../controllers/userController.js'
console.log("🔥 Loading user routes...");
const router = Router();

// ─── GET /api/users/me ────────────────────────────────────────────────────────
// Returns the full Firestore user document for the authenticated user.
router.get('/me', verifyToken, getFullFirestore);
router.post('/sync', verifyTokenOnly , syncData);
// PUBLIC — called before the Firebase Auth account is created (see signup.tsx).
// Rate-limited like the other unauthenticated-by-necessity endpoints.
router.post('/verify-eligibility', loginSecurityLimiter, verifyStudentEligibility);
router.get('/profile', verifyToken, getUserProfile)
router.post('/update-push-token', verifyToken, updatePushToken)
router.post('/logout', verifyToken, logout)
router.post('/log-login', verifyToken, logLogin)
router.post('/change-password', verifyToken, changePassword)
router.post('/delete-account/request', verifyToken, requestAccountDeletion)
router.post('/delete-account/cancel', verifyToken, cancelAccountDeletion)
router.post('/complete-onboarding-tour', verifyToken, completeOnboardingTour)
router.post('/photo', verifyToken, photoUploadMiddleware, uploadUserPhoto)
router.get('/:uid/photo-url', verifyToken, getUserPhotoUrl)


export default router;