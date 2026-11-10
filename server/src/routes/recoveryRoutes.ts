// src/routes/recoveryRoutes.ts — mounted at /api/admin/recovery.
// Every handler checks system_admin itself (recoveryController.ts).

import express, { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  beginRestore, cancelRestore, finishKeyTest, finishRestore, getRecoveryStatusAdmin,
  restoreAuthBatch, restoreDisableMissingUsers, restoreDryRun, restoreFileUpload,
  restoreFirestoreBatch, restoreLiveCollections, restoreLiveFiles, restoreWipeCollection,
  runRecoveryBackupNow, startKeyTest,
} from '../controllers/recoveryController.js';

const router = Router();

router.get('/status', verifyToken, getRecoveryStatusAdmin);
router.post('/run', verifyToken, runRecoveryBackupNow);
router.post('/key-test/start', verifyToken, startKeyTest);
router.post('/key-test/finish', verifyToken, finishKeyTest);

router.post('/restore/dry-run', verifyToken, restoreDryRun);
router.get('/restore/live-files', verifyToken, restoreLiveFiles);
router.get('/restore/live-collections', verifyToken, restoreLiveCollections);
router.post('/restore/begin', verifyToken, beginRestore);
router.post('/restore/wipe', verifyToken, restoreWipeCollection);
router.post('/restore/auth', verifyToken, restoreAuthBatch);
router.post('/restore/firestore', verifyToken, restoreFirestoreBatch);
// One file per request, raw bytes (Cloud Run caps a request at 32 MiB).
router.post('/restore/file', express.raw({ type: 'application/octet-stream', limit: '30mb' }), verifyToken, restoreFileUpload);
router.post('/restore/disable-missing', verifyToken, restoreDisableMissingUsers);
router.post('/restore/finish', verifyToken, finishRestore);
router.post('/restore/cancel', verifyToken, cancelRestore);

export default router;
