import { Request, Response, NextFunction } from 'express';
import { auth, db } from '../config/firebase.js';

// 1. Fixed ts(2375) by adding explicit support for 'undefined' to matching optional fields
export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string | undefined; // Added explicitly to satisfy exactOptionalPropertyTypes
    role: string;
    facultyId: string;
  };
}

export const verifyToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized payload context.' });
  }

  // 2. Fixed ts(2345) by ensuring idToken is strictly a string (not undefined)
  const rawToken = authHeader.split('Bearer ')[1];
  if(!rawToken){
    return res.status(401).json({ error: 'Malformed Authorization Header token.' });
  }
  const idToken: string  = rawToken;
  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const userDoc = await db.collection('users').doc(uid).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User registration document does not exist in Firestore.' });
    }

    const userData = userDoc.data();

    if (!userData?.isActive) {
      return res.status(403).json({ error: 'Account disabled by administration.' });
    }

    // Assign mapped values safely
    req.user = {
      uid,
      email: decodedToken.email, // Now fully compatible with the interface above
      role: userData.role || 'student', // Fallback defaults to ensure strings
      facultyId: userData.facultyId || 'computer_science'
    };

    return next();
  } catch (error: any) {
    console.error('Security token processing error:', error);
    return res.status(403).json({ error: 'Session handshake failed: Invalid authentication.' });
  }
};