// src/routes/users.ts

import { Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest, verifyToken } from '../middleware/auth.js';


// ─── GET /api/users/me ────────────────────────────────────────────────────────
// Returns the full Firestore user document for the authenticated user.
export const getFullFirestore = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Missing uid.' });

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found.' });

    return res.status(200).json(userDoc.data());
  } catch (error: any) {
    console.error('GET /me error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ─── GET /api/users/profile ───────────────────────────────────────────────────
// Alias for /me — fixes the 404 in AdminLayout which calls /api/users/profile
export const getUserProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Missing uid.' });

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found.' });

    return res.status(200).json(userDoc.data());
  } catch (error: any) {
    console.error('GET /profile error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ─── POST /api/users/sync ─────────────────────────────────────────────────────
export const syncData = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      newUid, email, displayName, displayNameHe, displayNameEn,
      role, facultyId, degreeType, yearOfStudy, major, studentId,
    } = req.body;

    if (!newUid || !email || !role) {
      return res.status(400).json({ error: 'Missing required fields: newUid, email, role.' });
    }

    const validRoles = ['student', 'supervisor', 'examiner', 'coordinator', 'faculty_admin', 'system_admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role: ${role}` });
    }

    const validFaculties = [
      'computer_science', 'electrical', 'software',
      'industrial', 'mechanical', 'learning_technology', 'all',
    ];
    if (facultyId && !validFaculties.includes(facultyId)) {
      return res.status(400).json({ error: `Invalid facultyId: ${facultyId}` });
    }

    const userRef = db.collection('users').doc(newUid);
    const firestoreUserDoc = {
      uid:          newUid,
      email,
      displayName:  displayName   || displayNameHe || 'משתמש חדש',
      displayNameHe:displayNameHe || displayName   || 'משתמש חדש',
      displayNameEn:displayNameEn || 'New User',
      role,
      facultyId:    facultyId || 'computer_science',
      additionalRoles: [],

      degreeType:   role === 'student' ? (degreeType  || 'bachelors') : null,
      yearOfStudy:  role === 'student' ? (Number(yearOfStudy) || 1)   : null,
      major:        role === 'student' ? (major        || 'computer_science') : null,
      studentId:    role === 'student' ? (studentId    || null) : null,

      isActive:        true,
      profileComplete: true,
      hasActiveProject:false,
      language:        'he',
      expoPushToken:   null,

      ...(role === 'examiner' ? { dates: [] } : {}),

      updatedAt: new Date().toISOString(),
    };

    await userRef.set(firestoreUserDoc, { merge: true });

    return res.status(200).json({ success: true, user: firestoreUserDoc });
  } catch (error: any) {
    console.error('POST /sync error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ─── POST /api/users/update-push-token ───────────────────────────────────────
export const updatePushToken = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid   = req.user?.uid;
    const { token } = req.body;

    if (!uid)   return res.status(401).json({ error: 'Unauthorized' });
    if (!token) return res.status(400).json({ error: 'Missing token' });

    await db.collection('users').doc(uid).update({
      expoPushToken: token,
      pushTokenUpdatedAt: new Date().toISOString(),
    });

    console.log(`📲 Push token updated for ${uid}`);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('updatePushToken error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const logout = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid      = req.user?.uid;
    const role     = req.user?.role;
    const facultyId = req.user?.facultyId;

    if (!uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userRef = db.collection('users').doc(uid);
    const now     = new Date().toISOString();

    // ─── 1. Universal — clear push token for all roles ────────────────────
    await userRef.update({
      expoPushToken: null,
      lastLogoutAt:  now,
    });

    // ─── 2. Role-specific cleanup ─────────────────────────────────────────
    switch (role) {

      case 'student': {
        // Log the logout event — useful for audit trail
        console.log(`📚 Student ${uid} logged out`);
        break;
      }

      case 'supervisor': {
        // Release any "currently reviewing" locks on projects
        const lockedProjects = await db.collection('projects')
          .where('lockedByUid', '==', uid)
          .get();

        const batch = db.batch();
        lockedProjects.docs.forEach(doc => {
          batch.update(doc.ref, { lockedByUid: null, lockedAt: null });
        });
        await batch.commit();

        console.log(`👨‍🏫 Supervisor ${uid} logged out, released ${lockedProjects.size} project locks`);
        break;
      }

      case 'examiner': {
        // Log audit trail
        console.log(`🔍 Examiner ${uid} logged out`);
        break;
      }

      case 'coordinator': {
        // Log audit trail with faculty context
        console.log(`📋 Coordinator ${uid} (faculty: ${facultyId}) logged out`);
        break;
      }

      case 'faculty_admin': {
        console.log(`🏛️ Faculty admin ${uid} (faculty: ${facultyId}) logged out`);
        break;
      }

      case 'system_admin': {
        // Log to a dedicated admin_audit collection
        await db.collection('admin_audit').add({
          uid,
          action:    'logout',
          timestamp: now,
          facultyId,
        });
        console.log(`🔐 System admin ${uid} logged out — audit log written`);
        break;
      }

      default:
        console.warn(`⚠️ Unknown role "${role}" logged out`);
    }

    return res.status(200).json({ message: 'Logged out successfully' });

  } catch (error: any) {
    console.error('Logout error:', error);
    return res.status(500).json({ error: 'Failed to logout' });
  }
};

