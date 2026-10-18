// src/routes/users.ts

import { Request, Response } from 'express';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { db, auth } from '../config/firebase.js';
import { AuthenticatedRequest, verifyToken, forgetTokensValidAfter } from '../middleware/auth.js';
import { DEGREE_LENGTHS } from '../config/degreeLengths.js';
import { VALID_MAJORS, MAJORS_BY_FACULTY } from '../config/majors.js';
import { checkDeletionEligibility, requestDeletion, cancelDeletion } from '../services/accountDeletion.js';
import { checkStudentEligibility, markRosterEntryUsed } from '../services/studentRoster.js';
import { isAllowedStudentEmailDomain, STUDENT_ALLOWED_EMAIL_DOMAINS } from '../services/emailValidation.js';
import { hashPassword, getTempPasswordHash, clearTempPasswordHash } from '../services/userImportExport.js';
import { logAuditEvent } from '../services/auditLog.js';
import { writePrivateContact } from '../services/privateContact.js';
import { resolveTrackPolicy } from '../config/studentTrack.js';
import { specializationsFor } from '../config/specialization.js';
import { uploadStudentPhoto, resolveStudentPhotoUrl } from '../services/studentPhoto.js';
import { isTwoFactorSetupRequired } from '../services/twoFactorEnforcement.js';
import { resolvePlatform } from '../services/maintenanceStatus.js';
import { isValidDocId } from '../services/idValidation.js';
import { L } from '../utils/localize.js';
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
    // Masters: eligible in both year 1 and year 2
    return yearOfStudy === 1 || yearOfStudy === 2;
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
    if (!uid) return res.status(401).json({ error: L(req, 'Missing uid.', 'חסר מזהה משתמש.') });

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: L(req, 'User not found.', 'המשתמש לא נמצא.') });

    const data = userDoc.data()!;
    const twoFactorSetupRequired = await isTwoFactorSetupRequired(data.totp_enabled ?? false, data.twoFactorExempt === true, data.role, data.roles ?? []);
    return res.status(200).json({ ...withRecomputedEligibility(data), twoFactorSetupRequired });
  } catch (error: any) {
    console.error('GET /me error:', error);
    return res.status(500).json({ error: L(req, 'Failed to load profile.', 'טעינת הפרופיל נכשלה.') });
  }
};

// ─── GET /api/users/profile ───────────────────────────────────────────────────
// Alias for /me — fixes the 404 in AdminLayout which calls /api/users/profile
export const getUserProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: L(req, 'Missing uid.', 'חסר מזהה משתמש.') });

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: L(req, 'User not found.', 'המשתמש לא נמצא.') });

    const data = userDoc.data()!;
    const twoFactorSetupRequired = await isTwoFactorSetupRequired(data.totp_enabled ?? false, data.twoFactorExempt === true, data.role, data.roles ?? []);
    return res.status(200).json({ ...withRecomputedEligibility(data), twoFactorSetupRequired });
  } catch (error: any) {
    console.error('GET /profile error:', error);
    return res.status(500).json({ error: L(req, 'Failed to load profile.', 'טעינת הפרופיל נכשלה.') });
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
    return res.status(400).json({ eligible: false, message: L(req, 'Missing studentId, facultyId, or degreeType.', 'חסרים פרטי מספר סטודנט, פקולטה או סוג תואר.') });
  }

  try {
    const result = await checkStudentEligibility(studentId, facultyId, degreeType, major);
    return res.status(200).json({ eligible: result.eligible, message: result.reason });
  } catch (error: any) {
    console.error('verifyStudentEligibility error:', error);
    return res.status(500).json({ eligible: false, message: L(req, 'Failed to verify eligibility.', 'בדיקת הזכאות נכשלה.') });
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
      return res.status(403).json({ error: L(req, 'Please verify your email before completing registration.', 'יש לאמת את כתובת האימייל לפני השלמת ההרשמה.') });
    }

    const {
      newUid, displayName, displayNameHe, displayNameEn,
      role, facultyId, degreeType, yearOfStudy, major, studentId, chosenTrack, specialization, phoneNumber,
    } = req.body;

    // MEDIUM FIX (M2, AUDIT_FULL_2026_10_13.md): the profile email used to
    // come from the request body and was never compared to the login —
    // anyone could register with one verified address and claim another
    // (bypassing the domain allowlist below, and redirecting notifications
    // such as the final-report link). Only the ID token's own, Firebase-
    // verified email is trusted now; a body `email` is ignored.
    const email = req.user?.email;

    // Mandatory: the name is matched against the approved-students list
    // (services/studentNameMatch.ts). Used to silently default to
    // 'משתמש חדש' when missing.
    const hasTypedName = [displayName, displayNameHe, displayNameEn].some((n) => typeof n === 'string' && n.trim().length >= 2);
    if (!hasTypedName) {
      return res.status(400).json({ error: L(req, 'Full name is required.', 'יש להזין שם מלא.') });
    }

    if (!newUid || !email || !role) {
      return res.status(400).json({ error: L(req, 'Missing required fields: newUid, email, role.', 'שדות חובה חסרים: newUid, email, role.') });
    }

    // Students may only self-register with an @gmail.com or @my.hit.ac.il
    // address — real deliverability is already proven above (emailVerified
    // requires clicking Firebase's confirmation link), this just restricts
    // WHICH domains are acceptable in the first place. Client-side signup
    // pages enforce this too (before creating the Firebase Auth account at
    // all), this is defense-in-depth for anyone hitting the API directly.
    if (!isAllowedStudentEmailDomain(email)) {
      return res.status(400).json({ error: L(req, `Email must be an @${STUDENT_ALLOWED_EMAIL_DOMAINS.join(' or @')} address.`, `כתובת האימייל חייבת להיות מהסוג @${STUDENT_ALLOWED_EMAIL_DOMAINS.join(' או @')}.`) });
    }

    if (newUid !== req.user?.uid) {
      return res.status(403).json({ error: L(req, 'newUid must match the authenticated user.', 'ה-newUid חייב להתאים למשתמש המאומת.') });
    }

    if (role !== 'student') {
      return res.status(403).json({ error: L(req, 'This endpoint may only provision student accounts.', 'נקודת קצה זו מיועדת ליצירת חשבונות סטודנטים בלבד.') });
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
      return res.status(400).json({ error: L(req, `Invalid facultyId: ${facultyId}`, `פקולטה לא תקינה: ${facultyId}`) });
    }
    if (!isCrossFaculty && !facultyId) {
      return res.status(400).json({ error: L(req, 'facultyId is required for this role.', 'שדה הפקולטה נדרש לתפקיד זה.') });
    }
    const resolvedFacultyId = isCrossFaculty ? 'all' : facultyId;

    // major must always be one of the canonical program slugs — never free
    // text or a silently-guessed default — since scope-matching (e.g.
    // coordinator assignment by major) depends on it being reliable.
    if (role === 'student' && !VALID_MAJORS.has(major)) {
      return res.status(400).json({ error: L(req, `Invalid major: "${major}"`, `חוג לא תקין: "${major}"`) });
    }

    // Student thesis/project track — see config/studentTrack.ts. Resolved
    // server-side from degreeType/major, never trusted from the client;
    // chosenTrack is only ever honored for a 'signup_choice' major, and only
    // 'thesis'/'project' are valid values there.
    const trackPolicy = role === 'student' ? resolveTrackPolicy(degreeType, major) : null;
    if (trackPolicy === 'signup_choice' && chosenTrack !== 'thesis' && chosenTrack !== 'project') {
      return res.status(400).json({ error: L(req, 'You must choose a track (thesis or project) to register for this program.', 'עליך לבחור מסלול (תזה או פרויקט) כדי להירשם לתוכנית זו.') });
    }
    if (trackPolicy && trackPolicy !== 'signup_choice' && (chosenTrack === 'thesis' || chosenTrack === 'project')) {
      return res.status(400).json({ error: L(req, 'This program does not allow choosing a track at signup.', 'תוכנית זו אינה מאפשרת בחירת מסלול בעת ההרשמה.') });
    }

    // Specialization (תחום) — see config/specialization.ts. Required for, and
    // only accepted from, a program that lists specializations.
    const allowedSpecializations = role === 'student' ? specializationsFor(degreeType, major, chosenTrack) : [];
    if (allowedSpecializations.length > 0 && !allowedSpecializations.includes(specialization)) {
      return res.status(400).json({ error: L(req, 'You must choose a specialization to register for this program.', 'עליך לבחור תחום התמחות כדי להירשם לתוכנית זו.') });
    }
    if (allowedSpecializations.length === 0 && specialization) {
      return res.status(400).json({ error: L(req, 'This program does not have specializations.', 'לתוכנית זו אין תחומי התמחות.') });
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
      specialization: allowedSpecializations.length > 0 ? specialization : null,
      studentId:    role === 'student' ? (studentId    || null) : null,
      // Anchor for the automatic graduation-based deletion sweep (see
      // services/accountDeletion.ts). Defaults to signup time on first sync
      // only; system_admin can correct it per-student for transfers/import
      // discrepancies. Never re-stamped: a repeat sync is a no-op (below).
      programStartDate: role === 'student' ? Timestamp.now() : null,

      isActive:        true,
      profileComplete: true,
      hasActiveProject:false,
      language:        'he',
      totp_enabled: false,
      totp_last_verified: null,
      hasSeenOnboardingTour: false,
      seenFieldGuides: [],

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

    // One transaction: profile-exists check, roster eligibility (the
    // authoritative gate — the public verify-eligibility endpoint is only a
    // fail-fast UX check), profile create, and roster claim.
    //
    // MEDIUM FIX (M1, AUDIT_FULL_2026_10_13.md): this used to merge-write
    // over an EXISTING profile, so re-calling it reset isActive (re-enabling
    // an account an admin had disabled), additionalRoles, track locks,
    // faculty/major, etc. Every client calls it only for a brand-new
    // account, so an existing profile is now left untouched and reported as
    // success (keeps a retried signup request idempotent).
    //
    // MEDIUM FIX (M2): the roster check and claim used to be separate,
    // non-atomic steps, so two concurrent signups with the same ID number
    // could both pass and both create accounts.
    const outcome = await db.runTransaction(async (tx) => {
      const existingSnap = await tx.get(userRef);
      if (existingSnap.exists) return { kind: 'exists' as const };
      const eligibility = await checkStudentEligibility(studentId, resolvedFacultyId, degreeType, major, tx, [displayName, displayNameHe, displayNameEn]);
      if (!eligibility.eligible) return { kind: 'ineligible' as const, reason: eligibility.reason, nameMismatch: !!eligibility.nameMismatch };
      tx.create(userRef, firestoreUserDoc);
      // Phone lives server-only in users/{uid}/private/contact
      // (services/privateContact.ts), never on the readable profile.
      writePrivateContact(newUid, { phoneNumber: phoneNumber || null, expoPushToken: null }, tx);
      markRosterEntryUsed(studentId, resolvedFacultyId, degreeType, newUid, tx);
      return { kind: 'created' as const };
    });

    if (outcome.kind === 'ineligible' && outcome.nameMismatch) {
      // Possible attempt to register with someone else's ID number. Logged
      // with what was typed (never the roster name) for staff to review.
      await logAuditEvent({
        userId: newUid,
        userRole: 'student',
        action: 'signup_name_mismatch',
        entityType: 'user',
        entityId: newUid,
        newValue: { typedName: displayName ?? null, typedNameHe: displayNameHe ?? null, typedNameEn: displayNameEn ?? null, facultyId: resolvedFacultyId, degreeType },
        explanation: 'Signup refused: the ID number is on the approved-students list, but the typed name did not match it.',
      });
      return res.status(403).json({ error: L(
        req,
        'The name you entered does not match the approved students list for this ID number. Please check it, or contact your faculty coordinator.',
        'השם שהזנת אינו תואם לשם ברשימת הסטודנטים המאושרים עבור מספר תעודת הזהות הזה. יש לבדוק אותו או לפנות לרכז/ת הפקולטה.',
      ) });
    }
    if (outcome.kind === 'ineligible') {
      return res.status(403).json({ error: outcome.reason || L(req, 'You are not on the approved students list for this faculty and degree.', 'את/ה לא מופיע/ה ברשימת הסטודנטים המאושרים לפקולטה ולתואר אלו.') });
    }
    if (outcome.kind === 'exists') {
      return res.status(200).json({ success: true, alreadyExists: true });
    }
    return res.status(200).json({ success: true, user: firestoreUserDoc });
  } catch (error: any) {
    console.error('POST /sync error:', error);
    return res.status(500).json({ error: L(req, 'Failed to create account profile.', 'יצירת פרופיל החשבון נכשלה.') });
  }
};

// ─── POST /api/users/update-push-token ───────────────────────────────────────
export const updatePushToken = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid   = req.user?.uid;
    const { token } = req.body;

    if (!uid)   return res.status(401).json({ error: L(req, 'Unauthorized', 'לא מורשה') });
    if (!token) return res.status(400).json({ error: L(req, 'Missing token', 'חסר טוקן') });

    await writePrivateContact(uid, { expoPushToken: token });
    await db.collection('users').doc(uid).update({ pushTokenUpdatedAt: new Date().toISOString() });

    console.log(`📲 Push token updated for ${uid}`);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('updatePushToken error:', error);
    return res.status(500).json({ error: L(req, 'Failed to update push token.', 'עדכון טוקן ההתראות נכשל.') });
  }
};

// ─── POST /api/users/block ─────────────────────────────────────────────────────
// ─── POST /api/users/complete-onboarding-tour ─────────────────────────────────
// Called once by either client when a user finishes or dismisses their
// first-login onboarding tour (web: OnboardingTour, mobile:
// OnboardingTourOverlay) — permanently hides it from then on. No body; uid
// comes only from the verified token, same pattern as updatePushToken above.
export const completeOnboardingTour = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: L(req, 'Unauthorized', 'לא מורשה') });

    await db.collection('users').doc(uid).update({ hasSeenOnboardingTour: true });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('completeOnboardingTour error:', error);
    return res.status(500).json({ error: L(req, 'Failed to update onboarding status.', 'עדכון סטטוס ההכרות עם המערכת נכשל.') });
  }
};

// ─── POST /api/users/mark-field-guide-seen ────────────────────────────────────
// Called once by either client when a user finishes or dismisses the
// first-visit field-explanation walkthrough for a specific tab/form (web:
// FieldGuideOverlay, mobile: components/guidance/FieldGuideOverlay) —
// permanently hides that one walkthrough from then on, without affecting any
// other guideKey. arrayUnion keeps this idempotent under a repeat/racing
// call, unlike a read-then-write append.
export const markFieldGuideSeen = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    const { guideKey } = req.body;
    if (!uid) return res.status(401).json({ error: L(req, 'Unauthorized', 'לא מורשה') });
    if (!guideKey || typeof guideKey !== 'string') return res.status(400).json({ error: L(req, 'Missing guideKey', 'חסר מזהה מדריך') });

    await db.collection('users').doc(uid).update({ seenFieldGuides: FieldValue.arrayUnion(guideKey) });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('markFieldGuideSeen error:', error);
    return res.status(500).json({ error: L(req, 'Failed to update field guide status.', 'עדכון סטטוס מדריך השדה נכשל.') });
  }
};

// ─── POST /api/users/log-login ────────────────────────────────────────────────
// Called once by both clients right after a successful Firebase sign-in
// (there's no other server touchpoint for login — it happens entirely via
// the client Firebase SDK). Feeds the "Live Transportation" admin table.
export const logLogin = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: L(req, 'Unauthorized', 'לא מורשה') });

    await logAuditEvent({
      userId: uid,
      userRole: req.user?.role ?? 'student',
      action: 'login',
      entityType: 'session',
      entityId: uid,
      userDisplayName: req.user?.displayName,
    });

    // Feeds system_admin's Users panel + the scoped student/supervisor
    // "last login" views (studentsListController.ts, projectRecordsController.ts's
    // getScopedSupervisors) — the audit-log event above already recorded the
    // event itself, but nothing before this read it back into a queryable
    // field on the user doc, same gap lastLogoutAt below fills for logout.
    await db.collection('users').doc(uid).update({
      lastLoginAt: new Date().toISOString(),
      lastLoginPlatform: resolvePlatform(req.headers['x-client-platform']),
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('logLogin error:', error);
    return res.status(500).json({ error: L(req, 'Failed to log login', 'תיעוד הכניסה נכשל') });
  }
};

export const logout = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid      = req.user?.uid;
    const role     = req.user?.role;
    const facultyId = req.user?.facultyId;

    if (!uid) {
      return res.status(401).json({ error: L(req, 'Unauthorized', 'לא מורשה') });
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
    await writePrivateContact(uid, { expoPushToken: null });
    await userRef.update({
      lastLogoutAt:  now,
      lastLogoutPlatform: resolvePlatform(req.headers['x-client-platform']),
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
    return res.status(500).json({ error: L(req, 'Failed to logout', 'תהליך ההתנתקות נכשל') });
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
    if (!uid) return res.status(401).json({ error: L(req, 'Unauthorized.', 'לא מורשה.') });
    if (!authTime || (Date.now() / 1000 - authTime) > PASSWORD_CHANGE_REAUTH_MAX_AGE_SECONDS) {
      return res.status(403).json({ error: L(req, 'Please log in again before changing your password.', 'יש להתחבר מחדש לפני שינוי הסיסמה.') });
    }

    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({ error: L(req, 'A new password is required.', 'יש להזין סיסמה חדשה.') });
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
      return res.status(400).json({ error: L(req, 'Your new password cannot be the same as the temporary password you were issued.', 'הסיסמה החדשה לא יכולה להיות זהה לסיסמה הזמנית שהונפקה לך.') });
    }

    // Revokes every existing session, this one included (see
    // middleware/auth.ts's tokensValidAfterMs) — the client signs in again
    // with the new password right after this succeeds.
    await auth.updateUser(uid, { password: newPassword });
    forgetTokensValidAfter(uid);
    await db.collection('users').doc(uid).update({
      mustChangePassword: false,
      updatedAt: new Date().toISOString(),
    });
    await clearTempPasswordHash(uid);

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('changePassword error:', error);
    return res.status(500).json({ error: L(req, 'Failed to change password.', 'שינוי הסיסמה נכשל.') });
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
  if (!uid) return res.status(401).json({ error: L(req, 'Unauthorized.', 'אין הרשאה.') });

  if (!authTime || (Date.now() / 1000 - authTime) > REAUTH_MAX_AGE_SECONDS) {
    return res.status(401).json({ error: L(req, 'Please re-authenticate before deleting your account.', 'יש להתחבר מחדש לפני מחיקת החשבון שלך.') });
  }

  try {
    const result = await checkDeletionEligibility(uid, 'self', req.lang);
    if (!result.eligible) {
      return res.status(409).json({ error: result.reason });
    }

    await requestDeletion(uid, 'self_requested');
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('requestAccountDeletion error:', error);
    return res.status(500).json({ error: L(req, 'Failed to request account deletion.', 'בקשת מחיקת החשבון נכשלה.') });
  }
};

// ─── POST /api/users/delete-account/cancel ───────────────────────────────────
export const cancelAccountDeletion = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: L(req, 'Unauthorized.', 'לא מורשה.') });

  try {
    await cancelDeletion(uid);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('cancelAccountDeletion error:', error);
    return res.status(500).json({ error: L(req, 'Failed to cancel account deletion.', 'ביטול מחיקת החשבון נכשל.') });
  }
};

// ─── POST /api/users/photo ─────────────────────────────────────────────────────
// Uploads (or replaces) the caller's own profile photo — used by the
// research-proposal form's auto-filled "תמונת סטודנט/ית" field (see
// ResearchProposalFormModal.tsx). Stored via studentPhoto.ts as a Cloudinary
// `authenticated` asset, never a public one — see that file's header for why.
export const uploadUserPhoto = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: L(req, 'Unauthorized.', 'לא מורשה.') });

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ error: L(req, 'A PNG or JPEG photo is required.', 'יש להעלות תמונה בפורמט PNG או JPEG.') });

  try {
    const { publicId } = await uploadStudentPhoto(uid, file);
    await db.collection('users').doc(uid).update({ photoPublicId: publicId });
    return res.status(200).json({ success: true, photoUrl: resolveStudentPhotoUrl(publicId) });
  } catch (error: any) {
    console.error('uploadUserPhoto error:', error);
    return res.status(500).json({ error: L(req, 'Photo upload failed.', 'העלאת התמונה נכשלה.') });
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
  if (!req.user?.uid) return res.status(401).json({ error: L(req, 'Unauthorized.', 'לא מורשה.') });
  const { uid } = req.params;
  // Beyond "is a string" — a uid containing '/' resolves to a DIFFERENT
  // Firestore path (e.g. "<uid>/private/totp"), not a literal doc name. See
  // services/idValidation.ts.
  if (!isValidDocId(uid)) return res.status(400).json({ error: L(req, 'Invalid uid.', 'מזהה משתמש לא תקין.') });

  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: L(req, 'User not found.', 'המשתמש לא נמצא.') });
    const photoUrl = resolveStudentPhotoUrl(userDoc.data()?.photoPublicId ?? null);
    return res.status(200).json({ photoUrl });
  } catch (error: any) {
    console.error('getUserPhotoUrl error:', error);
    return res.status(500).json({ error: L(req, 'Failed to resolve photo URL.', 'אחזור כתובת התמונה נכשל.') });
  }
};

