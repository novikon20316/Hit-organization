// src/routes/users.ts

import { Request, Response } from 'express';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { db, auth } from '../config/firebase.js';
import { AuthenticatedRequest, verifyToken } from '../middleware/auth.js';
import { DEGREE_LENGTHS } from '../config/degreeLengths.js';
import { VALID_MAJORS, MAJORS_BY_FACULTY } from '../config/majors.js';
import { checkDeletionEligibility, requestDeletion, cancelDeletion } from '../services/accountDeletion.js';
import { checkStudentEligibility, markRosterEntryUsed } from '../services/studentRoster.js';
import { isAllowedStudentEmailDomain, STUDENT_ALLOWED_EMAIL_DOMAINS } from '../services/emailValidation.js';
import { hashPassword, getTempPasswordHash, clearTempPasswordHash } from '../services/userImportExport.js';
import { logAuditEvent } from '../services/auditLog.js';
import { resolveTrackPolicy } from '../config/studentTrack.js';
import { uploadStudentPhoto, resolveStudentPhotoUrl } from '../services/studentPhoto.js';
import { isTwoFactorSetupRequired } from '../services/twoFactorEnforcement.js';
import multer from 'multer';

const ALLOWED_PHOTO_MIME_TYPES = new Set(['image/png', 'image/jpeg']);
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_PHOTO_MIME_TYPES.has(file.mimetype)),
});
export const photoUploadMiddleware = photoUpload.single('photo');

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

    const data = userDoc.data()!;
    const twoFactorSetupRequired = await isTwoFactorSetupRequired(data.totp_enabled ?? false, data.twoFactorExempt === true);
    return res.status(200).json({ ...withRecomputedEligibility(data), twoFactorSetupRequired });
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

    const data = userDoc.data()!;
    const twoFactorSetupRequired = await isTwoFactorSetupRequired(data.totp_enabled ?? false, data.twoFactorExempt === true);
    return res.status(200).json({ ...withRecomputedEligibility(data), twoFactorSetupRequired });
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
  // photoUrl is generated fresh from the stored photoPublicId on every read
  // (see studentPhoto.ts's file header — never stored as a URL itself), for
  // any role that has one set, not just students.
  const withPhoto = data.photoPublicId
    ? { ...data, photoUrl: resolveStudentPhotoUrl(data.photoPublicId) }
    : data;
  if (withPhoto.role !== 'student') return withPhoto;
  return {
    ...withPhoto,
    isEligibleForProcess: computeIsEligible(withPhoto.degreeType ?? null, withPhoto.major ?? null, withPhoto.yearOfStudy ?? null),
    // Same staleness bug as isEligibleForProcess above: trackPolicy was
    // previously written ONCE at signup (or by the one-off
    // backfillStudentTracks.ts migration) and never recomputed, so any
    // student account created before that migration ran (or whose
    // degreeType/major was corrected afterward) has no trackPolicy field at
    // all — silently skipping the awaiting-grade gate (useStudentData.ts)
    // and the mandatory choose-track redirect (mobile app/_layout.tsx) as if
    // their program had no thesis-eligibility gate. Recomputing it live from
    // the current degreeType/major on every read makes both paths correct
    // without depending on a migration ever having run.
    trackPolicy: resolveTrackPolicy(withPhoto.degreeType ?? null, withPhoto.major ?? null),
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
      role, facultyId, degreeType, yearOfStudy, major, studentId, chosenTrack, phoneNumber,
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
    // (role is hard-locked to 'student' above, so isCrossFaculty is always
    // false here in practice — kept for parity with the mobile list.)
    const CROSS_FACULTY_ROLES = ['system_admin', 'administrative_secretary'];
    const isCrossFaculty = CROSS_FACULTY_ROLES.includes(role);

    // Derived from the canonical faculty list (config/majors.ts) instead of
    // a second hardcoded copy — this list previously omitted 'data_science'
    // (added after this file was last touched), which hard-rejected every
    // Data Science student's signup with a 400 before their Firestore user
    // doc could even be created, silently keeping them invisible to their
    // administrative_coordinator's students-report table (which is
    // correctly rooted at the `users` collection with no such bug of its
    // own — see projectCoordinatorController.ts's getStudentsReport).
    const validFaculties = [...Object.keys(MAJORS_BY_FACULTY), 'all'];
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

    // Student thesis/project track — see config/studentTrack.ts. Resolved
    // server-side from degreeType/major, never trusted from the client;
    // chosenTrack is only ever honored for a 'signup_choice' major, and only
    // 'thesis'/'project' are valid values there.
    const trackPolicy = role === 'student' ? resolveTrackPolicy(degreeType, major) : null;
    if (trackPolicy === 'signup_choice' && chosenTrack !== 'thesis' && chosenTrack !== 'project') {
      return res.status(400).json({ error: 'You must choose a track (thesis or project) to register for this program.' });
    }
    if (trackPolicy && trackPolicy !== 'signup_choice' && (chosenTrack === 'thesis' || chosenTrack === 'project')) {
      return res.status(400).json({ error: 'This program does not allow choosing a track at signup.' });
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
    // Preserve the existing programStartDate on repeat syncs (e.g. a student
    // re-running signup after an interrupted flow) — this field anchors the
    // automatic post-graduation deletion sweep (services/accountDeletion.ts),
    // so re-stamping it to "now" on every call would let a student push their
    // own deletion date out indefinitely just by re-calling this endpoint.
    const existingSnap = await userRef.get();
    const existingProgramStartDate = existingSnap.exists ? existingSnap.data()?.programStartDate : undefined;
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
      phoneNumber:  role === 'student' ? (phoneNumber  || null) : null,
      // Anchor for the automatic graduation-based deletion sweep (see
      // services/accountDeletion.ts). Defaults to signup time on first sync
      // only; system_admin can correct it per-student for transfers/import
      // discrepancies. Preserved across repeat syncs — see comment above.
      programStartDate: role === 'student' ? (existingProgramStartDate ?? Timestamp.now()) : null,

      isActive:        true,
      profileComplete: true,
      hasActiveProject:false,
      language:        'he',
      expoPushToken:   null,
      totp_enabled: false,
      totp_last_verified: null,
      hasSeenOnboardingTour: false,

      ...(role === 'examiner' ? { dates: [] } : {}),
      isEligibleForProcess,
      updatedAt: new Date().toISOString(),
      // Student thesis/project track — see config/studentTrack.ts. Bachelors
      // students get no track fields at all (trackPolicy stays null above),
      // since the thesis concept doesn't apply to them.
      ...(trackPolicy === 'signup_choice' ? {
        trackPolicy,
        track: chosenTrack,
        trackLocked: true,
        trackLockedReason: 'signup_choice',
        trackLockedAt: Timestamp.now(),
      } : trackPolicy === 'coordinator_gated' ? {
        trackPolicy,
        track: null,
        trackLocked: false,
        thesisEligibility: null,
      } : trackPolicy === 'project_only' ? {
        trackPolicy,
        track: 'project',
        trackLocked: true,
        trackLockedReason: 'project_only',
      } : {}),
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

// ─── POST /api/users/complete-onboarding-tour ─────────────────────────────────
// Called once by either client when a user finishes or dismisses their
// first-login onboarding tour (web: OnboardingTour, mobile:
// OnboardingTourOverlay) — permanently hides it from then on. No body; uid
// comes only from the verified token, same pattern as updatePushToken above.
export const completeOnboardingTour = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    await db.collection('users').doc(uid).update({ hasSeenOnboardingTour: true });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('completeOnboardingTour error:', error);
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

// ─── POST /api/users/photo ─────────────────────────────────────────────────────
// Uploads (or replaces) the caller's own profile photo — used by the
// research-proposal form's auto-filled "תמונת סטודנט/ית" field (see
// ResearchProposalFormModal.tsx). Stored via studentPhoto.ts as a Cloudinary
// `authenticated` asset, never a public one — see that file's header for why.
export const uploadUserPhoto = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: 'Unauthorized.' });

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ error: 'A PNG or JPEG photo is required.' });

  try {
    const { publicId } = await uploadStudentPhoto(uid, file);
    await db.collection('users').doc(uid).update({ photoPublicId: publicId });
    return res.status(200).json({ success: true, photoUrl: resolveStudentPhotoUrl(publicId) });
  } catch (error: any) {
    console.error('uploadUserPhoto error:', error);
    return res.status(500).json({ error: error.message || 'Photo upload failed.' });
  }
};

// ─── GET /api/users/:uid/photo-url ─────────────────────────────────────────────
// Resolves another user's (e.g. a teammate's, or a project's supervisor's)
// photo into a fresh signed URL — needed because the research-proposal form
// shows every enrolled student's photo, not just the viewer's own (see
// studentPhoto.ts — an authenticated-type asset's plain URL never renders, so
// this is the only way any OTHER user's photo actually displays). Gated only
// by verifyToken, matching this app's existing bar for reading another user's
// displayName/major/etc. elsewhere (rosters, project cards) — no extra
// per-viewer restriction, since a face photo isn't more sensitive than the
// profile fields already exposed that way.
export const getUserPhotoUrl = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user?.uid) return res.status(401).json({ error: 'Unauthorized.' });
  const { uid } = req.params;
  if (!uid || typeof uid !== 'string') return res.status(400).json({ error: 'Invalid uid.' });

  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found.' });
    const photoUrl = resolveStudentPhotoUrl(userDoc.data()?.photoPublicId ?? null);
    return res.status(200).json({ photoUrl });
  } catch (error: any) {
    console.error('getUserPhotoUrl error:', error);
    return res.status(500).json({ error: error.message || 'Failed to resolve photo URL.' });
  }
};

