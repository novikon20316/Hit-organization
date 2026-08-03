// src/routes/users.ts

import { Request, Response } from 'express';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { db, auth } from '../config/firebase.js';
import { AuthenticatedRequest, verifyToken } from '../middleware/auth.js';
import { DEGREE_LENGTHS } from '../config/degreeLengths.js';
import { VALID_MAJORS } from '../config/majors.js';
import { checkDeletionEligibility, requestDeletion, cancelDeletion } from '../services/accountDeletion.js';
import { checkStudentEligibility, markRosterEntryUsed } from '../services/studentRoster.js';
import { isAllowedStudentEmailDomain, STUDENT_ALLOWED_EMAIL_DOMAINS } from '../services/emailValidation.js';
import { hashPassword, getTempPasswordHash, clearTempPasswordHash } from '../services/userImportExport.js';
import { logAuditEvent } from '../services/auditLog.js';

// Exported — also used by adminController.ts's updateStudentAcademicYear to
// recompute this whenever a student's yearOfStudy is corrected/advanced, so
// the same staleness bug fixed below (see getFullFirestore/getUserProfile)
// can't reappear the moment yearOfStudy actually gets an update path.
export function computeIsEligible(
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

    return res.status(200).json(withRecomputedEligibility(userDoc.data()!));
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

    return res.status(200).json(withRecomputedEligibility(userDoc.data()!));
  } catch (error: any) {
    console.error('GET /profile error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Bug fix: isEligibleForProcess was previously written ONCE at signup time
// (whatever yearOfStudy the student typed on the signup form — almost always
// NOT their final year) and never recomputed again — there was no
// yearOfStudy update path at all, so a student who later reached their
// actual final year stayed permanently stuck on the "ineligible" screen no
// matter what. Recomputing it on every profile read means it always
// reflects the CURRENT stored degreeType/major/yearOfStudy, including once
// updateStudentAcademicYear (adminController.ts) gives staff a way to
// correct/advance that field.
function withRecomputedEligibility(data: FirebaseFirestore.DocumentData): FirebaseFirestore.DocumentData {
  if (data.role !== 'student') return data;
  return {
    ...data,
    isEligibleForProcess: computeIsEligible(data.degreeType ?? null, data.major ?? null, data.yearOfStudy ?? null),
  };
}

// ─── POST /api/users/verify-eligibility ───────────────────────────────────────
// PUBLIC — no Firebase Auth account exists yet at this point in the signup
// flow (see mobile/app/(auth)/signup.tsx, called before createUserWithEmailAndPassword).
// This is a fail-fast UX check only; syncData below re-checks the same thing
// authoritatively (right before the Firestore profile is written) and is the
// real gate — this endpoint existing or being skipped can't bypass that.
export const verifyStudentEligibility = async (req: Request, res: Response) => {
  const { studentId, facultyId, degreeType, major } = req.body;
  if (!studentId || !facultyId || !degreeType) {
    return res.status(400).json({ eligible: false, message: 'Missing studentId, facultyId, or degreeType.' });
  }

  try {
    const result = await checkStudentEligibility(studentId, facultyId, degreeType, major);
    return res.status(200).json({ eligible: result.eligible, message: result.reason });
  } catch (error: any) {
    console.error('verifyStudentEligibility error:', error);
    return res.status(500).json({ eligible: false, message: 'Failed to verify eligibility.' });
  }
};

// ─── POST /api/users/sync ─────────────────────────────────────────────────────
// Self-service signup sync only — the client is an unprivileged, freshly
// authenticated Firebase user at this point. newUid must match the caller's
// own verified uid (no writing/overwriting other accounts), and role is
// hard-locked to 'student' since every other role is provisioned via admin
// import (see createImportedUserAccount in services/userImportExport.ts),
// never through this endpoint.
export const syncData = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // The ID token's own email_verified claim, set by Firebase Auth — not
    // something the client body can spoof. Registration must not create the
    // Firestore profile (and thus the working account) until the user has
    // confirmed the email address they signed up with.
    if (!req.user?.emailVerified) {
      return res.status(403).json({ error: 'Please verify your email before completing registration.' });
    }

    const {
      newUid, email, displayName, displayNameHe, displayNameEn,
      role, facultyId, degreeType, yearOfStudy, major, studentId,
    } = req.body;

    if (!newUid || !email || !role) {
      return res.status(400).json({ error: 'Missing required fields: newUid, email, role.' });
    }

    // Students may only self-register with an @gmail.com or @my.hit.ac.il
    // address — real deliverability is already proven above (emailVerified
    // requires clicking Firebase's confirmation link), this just restricts
    // WHICH domains are acceptable in the first place. Client-side signup
    // pages enforce this too (before creating the Firebase Auth account at
    // all), this is defense-in-depth for anyone hitting the API directly.
    if (!isAllowedStudentEmailDomain(email)) {
      return res.status(400).json({ error: `Email must be an @${STUDENT_ALLOWED_EMAIL_DOMAINS.join(' or @')} address.` });
    }

    if (newUid !== req.user?.uid) {
      return res.status(403).json({ error: 'newUid must match the authenticated user.' });
    }

    if (role !== 'student') {
      return res.status(403).json({ error: 'This endpoint may only provision student accounts.' });
    }

    // Mirrors CROSS_FACULTY_ROLES in mobile/firebase/roles.ts — keep in sync.
    const CROSS_FACULTY_ROLES = ['system_admin', 'administrative_secretary', 'grad_school_head', 'internal_examiner'];
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

    // major must always be one of the canonical program slugs — never free
    // text or a silently-guessed default — since scope-matching (e.g.
    // coordinator assignment by major) depends on it being reliable.
    if (role === 'student' && !VALID_MAJORS.has(major)) {
      return res.status(400).json({ error: `Invalid major: "${major}"` });
    }

    // Authoritative gate — the public verify-eligibility endpoint the client
    // calls before this is only a fail-fast UX check; this is what actually
    // decides whether the account gets created. See services/studentRoster.ts.
    const eligibility = await checkStudentEligibility(studentId, resolvedFacultyId, degreeType, major);
    if (!eligibility.eligible) {
      return res.status(403).json({ error: eligibility.reason || 'You are not on the approved students list for this faculty and degree.' });
    }

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
      major:        role === 'student' ? major : null,
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

    // Locks the roster entry so this ID can't be reused by a second account.
    // Best-effort: the profile above is already written and correct even if
    // this fails — it would just leave the roster entry reusable, which a
    // coordinator can review manually rather than the student being blocked.
    try {
      await markRosterEntryUsed(studentId, resolvedFacultyId, degreeType, newUid);
    } catch (rosterErr) {
      console.error(`syncData: failed to mark roster entry used for ${newUid}:`, rosterErr);
    }

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

// ─── POST /api/users/log-login ────────────────────────────────────────────────
// Called once by both clients right after a successful Firebase sign-in
// (there's no other server touchpoint for login — it happens entirely via
// the client Firebase SDK). Feeds the "Live Transportation" admin table.
export const logLogin = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    await logAuditEvent({
      userId: uid,
      userRole: req.user?.role ?? 'student',
      action: 'login',
      entityType: 'session',
      entityId: uid,
      userDisplayName: req.user?.displayName,
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('logLogin error:', error);
    return res.status(500).json({ error: 'Failed to log login' });
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

    // Feeds the "Live Transportation" admin table — additive alongside the
    // pre-existing per-role console.log/admin_audit branches below, which
    // stay untouched.
    await logAuditEvent({
      userId: uid,
      userRole: role ?? 'student',
      action: 'logout',
      entityType: 'session',
      entityId: uid,
      userDisplayName: req.user?.displayName,
    });

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
// set by createImportedUserAccount in services/userImportExport.ts). The only
// live call site today is right after a fresh login (login.tsx / the
// mustChangePassword redirect in _layout.tsx), so authTime is always fresh
// there — requiring it closes off a stolen-but-valid older token permanently
// changing (and locking the real owner out of) the account.
const PASSWORD_CHANGE_REAUTH_MAX_AGE_SECONDS = 5 * 60;

// system_admin accounts are the highest-value target in this system, so they
// get a stricter policy than everyone else's 6-character minimum. Checked
// against req.user's CURRENT role/roles at call time — matches the same
// "is this effectively a system_admin" pattern used elsewhere (e.g.
// disableUser2FA's authorization check).
const SYSTEM_ADMIN_PASSWORD_MIN_LENGTH = 12;
const SYSTEM_ADMIN_PASSWORD_SYMBOL_RE = /[^A-Za-z0-9]/;

export function validateSystemAdminPassword(password: string): string | null {
  if (password.length < SYSTEM_ADMIN_PASSWORD_MIN_LENGTH) {
    return `System admin passwords must be at least ${SYSTEM_ADMIN_PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[A-Z]/.test(password)) return 'System admin passwords must include at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'System admin passwords must include at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'System admin passwords must include at least one digit.';
  if (!SYSTEM_ADMIN_PASSWORD_SYMBOL_RE.test(password)) {
    return 'System admin passwords must include at least one symbol.';
  }
  return null;
}

// Everyone else's floor — previously just "6 characters," no complexity
// requirement at all. Same character-class checks as the system_admin
// policy above, just an 8-character minimum instead of 12.
const STANDARD_PASSWORD_MIN_LENGTH = 8;
const STANDARD_PASSWORD_SYMBOL_RE = /[^A-Za-z0-9]/;

export function validateStandardPassword(password: string): string | null {
  if (password.length < STANDARD_PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${STANDARD_PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must include at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include at least one digit.';
  if (!STANDARD_PASSWORD_SYMBOL_RE.test(password)) {
    return 'Password must include at least one symbol.';
  }
  return null;
}

export const changePassword = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    const authTime = req.user?.authTime;
    if (!uid) return res.status(401).json({ error: 'Unauthorized.' });
    if (!authTime || (Date.now() / 1000 - authTime) > PASSWORD_CHANGE_REAUTH_MAX_AGE_SECONDS) {
      return res.status(403).json({ error: 'Please log in again before changing your password.' });
    }

    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'A new password is required.' });
    }

    const isSystemAdmin = req.user?.role === 'system_admin' || (req.user?.roles ?? []).includes('system_admin');
    const policyError = isSystemAdmin ? validateSystemAdminPassword(newPassword) : validateStandardPassword(newPassword);
    if (policyError) return res.status(400).json({ error: policyError });

    // Reject re-submitting whatever temporary/reset password the account was
    // just issued (Excel import, admin-created account, or a login-security
    // re-enable) — see the tempPasswordHash written alongside
    // mustChangePassword in adminController.ts/userImportExport.ts/
    // loginSecurity.ts. Only ever set while mustChangePassword is pending; a
    // voluntary later change finds nothing here and this is a no-op. Lives
    // in users/{uid}/private/security, not the top-level doc — see
    // setTempPasswordHash's own comment for why.
    const tempPasswordHash = await getTempPasswordHash(uid);
    if (tempPasswordHash && hashPassword(newPassword) === tempPasswordHash) {
      return res.status(400).json({ error: 'Your new password cannot be the same as the temporary password you were issued.' });
    }

    await auth.updateUser(uid, { password: newPassword });
    await db.collection('users').doc(uid).update({
      mustChangePassword: false,
      updatedAt: new Date().toISOString(),
    });
    await clearTempPasswordHash(uid);

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

