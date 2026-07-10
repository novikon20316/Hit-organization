 import { Router } from 'express';
 import { 
   getMaintenanceStatus,
   updateMaintenanceStatus,
   deleteMaintenanceStatus
 } from '../controllers/maintenanceController.js';
 import {verifyToken } from '../middleware/auth.js';
 
 const router = Router();
 
 router.get('/system/maintenance-status', verifyToken, getMaintenanceStatus);
 router.post('/admin/system/maintenance', verifyToken, updateMaintenanceStatus);
 router.delete('/admin/system/maintenance', verifyToken, deleteMaintenanceStatus);

 export default router;