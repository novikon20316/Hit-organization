// src/routes/integrations.ts
//
// PUBLIC router (no verifyToken) - the caller is administrative-coordinator's
// own server, which has no Firebase Auth account in this system. Gated by
// verifyIntegrationKey's shared secret instead. See integrationController.ts.

import { Router } from 'express';
import { verifyIntegrationKey } from '../middleware/integrationAuth.js';
import { getStudentProgressByIdNumber } from '../controllers/integrationController.js';

const router = Router();

router.use(verifyIntegrationKey);

router.get('/student-progress/:idNumber', getStudentProgressByIdNumber);

export default router;
