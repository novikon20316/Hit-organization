// src/middleware/auth.ts
// Single unified middleware — replaces both auth.ts and authMiddleware.ts
// Import ONLY from this file across the entire server

import { Request, Response, NextFunction } from 'express';
import { auth, db } from '../config/firebase.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    uid:       string;
    email?:    string | undefined;
    role:      string;
    facultyId: string;
  };
}

/**
 * verifyToken — enriches req.user with role + facultyId from Firestore.
 * Use this on ALL routes so controllers can trust req.user.role.
 */
export const verifyToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed authorization token.' });
  }

  const rawToken = authHeader.split('Bearer ')[1];
  if (!rawToken) {
    return res.status(401).json({ error: 'Empty Bearer token.' });
  }

  try {
    const decodedToken = await auth.verifyIdToken(rawToken);
    const uid = decodedToken.uid;

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      console.error(`❌ User ${uid} not found in Firestore.`);
      return res.status(404).json({ error: 'User not found in Firestore.' });
    }


    const userData = userDoc.data();
    console.log("User Data:", userData);
    if (!userData?.isActive) {
      return res.status(403).json({ error: 'Account has been disabled.' });
    }

    req.user = {
      uid,
      email:     decodedToken.email,
      role:      userData.role      ?? 'student',
      facultyId: userData.facultyId ?? 'computer_science',
    };

    return next();
  } catch (error: any) {
    console.error('Token verification error:', error);
    return res.status(403).json({ error: 'Invalid or expired authentication token.' });
  }
};

// Alias so routes that imported authenticateUser still work
// during migration — remove once all routes use verifyToken
export const authenticateUser = verifyToken;

export const verifyTokenOnly = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed authorization token.' });
  }

  const rawToken = authHeader.split('Bearer ')[1];
  if (!rawToken) {
    return res.status(401).json({ error: 'Empty Bearer token.' });
  }

  try {
    const decodedToken = await auth.verifyIdToken(rawToken);
    req.user = {
      uid:       decodedToken.uid,
      email:     decodedToken.email,
      role:      'student',       // default, sync will set the real value
      facultyId: 'computer_science',
    };
    return next();
  } catch (error: any) {
    console.error('Token verification error:', error);
    return res.status(403).json({ error: 'Invalid or expired authentication token.' });
  }
};