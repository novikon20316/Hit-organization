import { Router, Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest, verifyToken } from '../middleware/auth.js';

const router = Router();

/**
 * @route   POST /api/users/sync
 * @desc    Creates or updates a user profile safely following exact Firestore structures
 * @access  Private (Requires valid Firebase Token)
 */
router.post('/sync', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { 
      newUid, 
      email, 
      displayName, 
      displayNameHe, 
      displayNameEn, 
      role, 
      facultyId, 
      degreeType, 
      yearOfStudy, 
      major, 
      studentId 
    } = req.body;

    // Validate absolute essentials
    if (!newUid || !email || !role) {
      return res.status(400).json({ error: 'Missing critical identity parameters.' });
    }

    // Validate that the role matches your exact allowed enum array strings
    const validRoles = ['student', 'supervisor', 'examiner', 'coordinator', 'faculty_admin', 'system_admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role structure: ${role}` });
    }

    // Validate target faculty matches system keys
    const validFaculties = ['computer_science', 'electrical', 'software', 'industrial', 'mechanical', 'learning_technology', 'all'];
    if (facultyId && !validFaculties.includes(facultyId)) {
      return res.status(400).json({ error: `Invalid facultyId configuration: ${facultyId}` });
    }

    const userRef = db.collection('users').doc(newUid);

    // Build the document mirroring your exact Firestore blueprints
    const firestoreUserDoc = {
      uid: newUid,
      email,
      displayName: displayName || displayNameHe || 'משתמש חדש',
      displayNameHe: displayNameHe || displayName || 'משתמש חדש',
      displayNameEn: displayNameEn || 'New User',
      role, // 'student' | 'supervisor' | 'examiner' | 'coordinator' | etc.
      facultyId: facultyId || 'computer_science',
      additionalRoles: [],
      
      // Student specific metadata metrics or null values for faculty/staff
      degreeType: role === 'student' ? (degreeType || 'bachelors') : null,
      yearOfStudy: role === 'student' ? (Number(yearOfStudy) || 1) : null,
      major: role === 'student' ? (major || 'computer_science') : null,
      studentId: role === 'student' ? (studentId || null) : null,
      
      // Default system health status metrics
      isActive: true,
      profileComplete: true,
      hasActiveProject: false,
      language: 'he', // Default localization choice
      expoPushToken: null,
      
      // Examiner structural arrays
      ...(role === 'examiner' ? { dates: [] } : {}),
      
      updatedAt: new Date().toISOString()
    };

    await userRef.set(firestoreUserDoc, { merge: true });

    return res.status(200).json({ 
      success: true, 
      message: 'User synchronized flawlessly matching Firestore requirements.',
      user: firestoreUserDoc 
    });
  } catch (error: any) {
    console.error('Error synchronizing Firestore rules structure:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;