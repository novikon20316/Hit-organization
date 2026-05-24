import { Router } from 'express';
import { 
  defenseWindowsDays
} from '../controllers/configController.js';
import {verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/system/defenseWindowDays', verifyToken, defenseWindowsDays);


export default router;