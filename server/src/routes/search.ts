// src/routes/search.ts
import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { search } from '../controllers/searchController.js';

const router = Router();

// GET /api/search?q= — scoped project/student search for the web Ctrl+K palette
router.get('/', verifyToken, search);

export default router;
