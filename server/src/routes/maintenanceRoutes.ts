 import { Router } from 'express';
 import { 
   getMaintenanceStatus,
   updateMaintenanceStatus,
   deleteMaintenanceStatus
 } from '../controllers/maintenanceController.js';
 import {verifyToken } from '../middleware/auth.js';
 import { getAppVersionPolicy, getAppVersionPolicyAdmin, updateAppVersionPolicy } from '../controllers/appVersionController.js';
 
 const router = Router();
 
 router.get('/system/maintenance-status', verifyToken, getMaintenanceStatus);
 router.post('/admin/system/maintenance', verifyToken, updateMaintenanceStatus);
 router.delete('/admin/system/maintenance', verifyToken, deleteMaintenanceStatus);
 // Minimum mobile app build (services/appVersion.ts). The GET is PUBLIC — the
 // app checks it before anyone signs in.
 router.get('/app-version', getAppVersionPolicy);
 router.get('/admin/system/app-version', verifyToken, getAppVersionPolicyAdmin);
 router.put('/admin/system/app-version', verifyToken, updateAppVersionPolicy);

 export default router;