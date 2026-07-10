// src/routes/users.ts

import { Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { db, auth } from '../config/firebase.js';
import { AuthenticatedRequest, verifyToken } from '../middleware/auth.js';
import { DEGREE_LENGTHS } from '../config/degreeLengths.js';
import { checkDeletionEligibility, requestDeletion, cancelDeletion } from '../services/accountDeletion.js';

function computeIsEligible(
  degreeType: string | null,
  major: string | null,
  yearOfStudy: number | null
): boolean {
  if (!degreeType || yearOfStudy === null) return false;

  if (degreeType === 'masters') {
    // Masters year 1 = eligible, year 2 = NOT eligible
    return yearOfStudy === 1;
  }

  if (degreeType === 'bachelors') {
    const totalYears = DEGREE_LENGTHS[major ?? 'default'] ?? DEGREE_LENGTHS.default;
    if(!totalYears) return false; // fallback if major is unknown
    // Eligible only in final year (3rd year for 3-year degrees, 3rd or 4th for 4-year)
    return yearOfStudy >= (totalYears === 4 ? 3 : totalYears);
  }

  return false;
}

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

    // Mirrors CROSS_FACULTY_ROLES in mobile/firebase/roles.ts — keep in sync.
    const CROSS_FACULTY_ROLES = ['system_admin', 'project_coordinator', 'grad_school_head', 'internal_examiner'];
    const isCrossFaculty = CROSS_FACULTY_ROLES.includes(role);

    const validFaculties = [
      'sciences', 'electrical', 'industrial',
      'learning_tech', 'medical_tech', 'design', 'all',
    ];
    if (facultyId && !validFaculties.includes(facultyId)) {
      return res.status(400).json({ error: `Invalid facultyId: ${facultyId}` });
    }
    if (!isCrossFaculty && !facultyId) {
      return res.status(400).json({ error: 'facultyId is required for this role.' });
    }
    const resolvedFacultyId = isCrossFaculty ? 'all' : facultyId;

    const isEligibleForProcess = computeIsEligible(
      degreeType,
      major,
      yearOfStudy
    );


    const userRef = db.collection('users').doc(newUid);
    const firestoreUserDoc = {
      uid:          newUid,
      email,
      displayName:  displayName   || displayNameHe || 'משתמש חדש',
      displayNameHe:displayNameHe || displayName   || 'משתמש חדש',
      displayNameEn:displayNameEn || 'New User',
      role,
      facultyId:    resolvedFacultyId,
      additionalRoles: [],

      degreeType:   role === 'student' ? (degreeType  || 'bachelors') : null,
      yearOfStudy:  role === 'student' ? (Number(yearOfStudy) || 1)   : null,
      major:        role === 'student' ? (major        || 'computer_science') : null,
      studentId:    role === 'student' ? (studentId    || null) : null,
      // Anchor for the automatic graduation-based deletion sweep (see
      // services/accountDeletion.ts). Defaults to signup time; system_admin
      // can correct it per-student for transfers/import discrepancies.
      programStartDate: role === 'student' ? Timestamp.now() : null,

      isActive:        true,
      profileComplete: true,
      hasActiveProject:false,
      language:        'he',
      expoPushToken:   null,
      totp_enabled: false,
      totp_last_verified: null,

      ...(role === 'examiner' ? { dates: [] } : {}),
      isEligibleForProcess,
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

// ─── POST /api/users/change-password ─────────────────────────────────────────
// Used both for voluntary password changes and the forced first-login change
// after an account was created via Excel import (see mustChangePassword flag
// set by createImportedUserAccount in services/userImportExport.ts).
export const changePassword = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized.' });

    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    await auth.updateUser(uid, { password: newPassword });
    await db.collection('users').doc(uid).update({
      mustChangePassword: false,
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('changePassword error:', error);
    return res.status(500).json({ error: error.message || 'Failed to change password.' });
  }
};

// ─── POST /api/users/delete-account/request ──────────────────────────────────
// Self-service account deletion (Apple/Google store requirement). Requires a
// freshly-reauthenticated ID token (see reauthenticateWithCredential on the
// client) — this is irreversible-adjacent, so a modified client can't skip
// the reauth prompt and hit this with an old-but-valid token.
const REAUTH_MAX_AGE_SECONDS = 5 * 60; // 5 minutes

export const requestAccountDeletion = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const authTime = req.user?.authTime;
  if (!uid) return res.status(401).json({ error: 'Unauthorized.' });

  if (!authTime || (Date.now() / 1000 - authTime) > REAUTH_MAX_AGE_SECONDS) {
    return res.status(401).json({ error: 'Please re-authenticate before deleting your account.' });
  }

  try {
    const result = await checkDeletionEligibility(uid);
    if (!result.eligible) {
      return res.status(409).json({ error: result.reason });
    }

    await requestDeletion(uid, 'self_requested');
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('requestAccountDeletion error:', error);
    return res.status(500).json({ error: error.message || 'Failed to request account deletion.' });
  }
};

// ─── POST /api/users/delete-account/cancel ───────────────────────────────────
export const cancelAccountDeletion = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: 'Unauthorized.' });

  try {
    await cancelDeletion(uid);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('cancelAccountDeletion error:', error);
    return res.status(500).json({ error: error.message || 'Failed to cancel account deletion.' });
  }
};

