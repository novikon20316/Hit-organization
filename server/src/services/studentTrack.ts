// src/services/studentTrack.ts
//
// Assigns a student's initial thesis/project track — DISTINCT from
// services/trackChange.ts, which switches an already-enrolled PROJECT's
// track (closing the old one, opening a new one). This file is about the
// student's own track before/independent of any project enrollment: which
// track policy applies to them (config/studentTrack.ts), whether/when they
// get to choose, and the coordinator eligibility gate for computer_science
// masters students.

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { resolveTrackPolicy, THESIS_ELIGIBILITY_THRESHOLD, type StudentTrack } from '../config/studentTrack.js';
import { logAuditEvent } from './auditLog.js';
import { notifyUser } from './notify.js';

// "the system notifies the student to log in and see" — fired for both the
// manual (setThesisEligibility) and average-derived (setThesisEligibilityFromAverage)
// paths, since either one is the first time the student learns their fate.
// Not fired from adminOverrideStudentTrack — that's a data-correction escape
// hatch, not a real grade-entry event, so it shouldn't claim "your grade was
// just entered" when it wasn't. Best-effort: a notification failure must
// never fail the eligibility write that already committed.
async function notifyThesisEligibilityDecided(studentId: string): Promise<void> {
  try {
    await notifyUser({
      recipientId: studentId,
      type: 'general',
      titleHe: 'הוזן לך ממוצע ציונים',
      titleEn: 'Your grade average has been entered',
      bodyHe: 'הוזן לך ממוצע ציונים במערכת. היכנס/י כדי לראות כיצד התהליך שלך ממשיך.',
      bodyEn: "Your grade average has been entered into the system. Log in to see how your process continues.",
      emailData: {
        message: {
          he: 'הוזן לך ממוצע ציונים במערכת. היכנס/י כדי לראות כיצד התהליך שלך ממשיך.',
          en: "Your grade average has been entered into the system. Log in to see how your process continues.",
        },
      },
    });
  } catch (err) {
    console.error(`notifyThesisEligibilityDecided: failed to notify student ${studentId}:`, err);
  }
}

export class StudentTrackError extends Error {
  // status defaults to 400 (the pre-existing behavior for every caller that
  // doesn't pass one) — 409 is used specifically for setThesisEligibilityFromAverage's
  // already-graded race below, so the controller can tell "bad input" apart
  // from "someone else just graded this student" and the frontend can react
  // differently (a friendly notice + list refresh, not a generic form error).
  constructor(public messageEn: string, public messageHe: string, public status: number = 400, public code?: string) {
    super(messageEn);
    this.name = 'StudentTrackError';
  }
}

function isValidTrack(value: unknown): value is StudentTrack {
  return value === 'thesis' || value === 'project';
}

/** Self-service: a student choosing their own track. Used both inline during
 *  signup (signup_choice majors) and by a computer_science masters student
 *  who was just marked thesis-eligible by their coordinator. */
export async function chooseStudentTrack(
  studentId: string,
  chosenTrack: StudentTrack,
  initiatedBy: string,
  initiatedByRole: string,
): Promise<void> {
  if (!isValidTrack(chosenTrack)) {
    throw new StudentTrackError('track must be "thesis" or "project".', 'המסלול חייב להיות "תזה" או "פרויקט".');
  }

  const studentRef = db.collection('users').doc(studentId);
  const studentSnap = await studentRef.get();
  if (!studentSnap.exists) throw new StudentTrackError('Student not found.', 'הסטודנט לא נמצא.');
  const student = studentSnap.data()!;

  const policy = resolveTrackPolicy(student.degreeType, student.major);

  if (student.trackLocked) {
    throw new StudentTrackError('Your track is already locked and cannot be changed.', 'המסלול שלך כבר ננעל ולא ניתן לשנותו.');
  }
  if (policy === 'project_only') {
    throw new StudentTrackError('Your program does not offer a thesis track.', 'התוכנית שלך אינה כוללת מסלול תזה.');
  }
  if (policy === 'coordinator_gated' && student.thesisEligibility?.eligible !== true) {
    throw new StudentTrackError('You have not yet been approved for the thesis track.', 'טרם אושרת למסלול התזה.');
  }

  await studentRef.update({
    track: chosenTrack,
    trackLocked: true,
    trackLockedReason: policy === 'signup_choice' ? 'signup_choice' : 'coordinator_gated_default',
    trackLockedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await logAuditEvent({
    userId: initiatedBy,
    userRole: initiatedByRole,
    action: 'student_track_chosen',
    entityType: 'user',
    entityId: studentId,
    oldValue: { track: student.track ?? null },
    newValue: { track: chosenTrack },
  });
}

/** Coordinator (scoped) or system_admin decides whether a computer_science
 *  masters student may choose the thesis track — the caller (controller)
 *  must already have checked withinCoordinatorScope before calling this. */
export async function setThesisEligibility(
  studentId: string,
  eligible: boolean,
  reason: string | undefined,
  coordinatorUid: string,
  coordinatorRole: string,
): Promise<void> {
  const studentRef = db.collection('users').doc(studentId);
  const studentSnap = await studentRef.get();
  if (!studentSnap.exists) throw new StudentTrackError('Student not found.', 'הסטודנט לא נמצא.');
  const student = studentSnap.data()!;

  const policy = resolveTrackPolicy(student.degreeType, student.major);
  if (policy !== 'coordinator_gated') {
    throw new StudentTrackError(
      "This student's program does not use coordinator-gated thesis eligibility.",
      'תוכנית הלימודים של סטודנט זה אינה משתמשת בזכאות לתזה המאושרת ע"י רכז.'
    );
  }

  const thesisEligibility = {
    method: 'manual' as const,
    eligible,
    decidedBy: coordinatorUid,
    decidedAt: admin.firestore.FieldValue.serverTimestamp(),
    reason: reason?.trim() || null,
    threshold: null,
    computedScore: null,
  };

  const update: Record<string, unknown> = { thesisEligibility };
  // Reversing a prior eligible decision resets any track choice the student
  // already made under it — they're back to fixed-project, matching "others
  // who can't do thesis should be fixed on projects only".
  if (!eligible) {
    update.track = null;
    update.trackLocked = false;
    update.trackLockedReason = admin.firestore.FieldValue.delete();
    update.trackLockedAt = admin.firestore.FieldValue.delete();
  }

  await studentRef.update(update);

  await logAuditEvent({
    userId: coordinatorUid,
    userRole: coordinatorRole,
    action: 'student_thesis_eligibility_set',
    entityType: 'user',
    entityId: studentId,
    oldValue: { eligible: student.thesisEligibility?.eligible ?? null },
    newValue: { eligible },
    explanation: reason,
  });

  await notifyThesisEligibilityDecided(studentId);
}

/** Sets thesis eligibility FROM a grade average instead of a direct manual
 *  boolean — same coordinator_gated-policy check and track-reset-when-
 *  ineligible behavior as setThesisEligibility above, just derives `eligible`
 *  from THESIS_ELIGIBILITY_THRESHOLD instead of trusting the caller's own
 *  judgment. Entered manually today (see config/studentTrack.ts's doc
 *  comment) — a manual "Mark eligible"/"Mark not eligible" call can still
 *  override the result afterward, same as it could override any other
 *  eligible value; both paths just write the same `thesisEligibility` field.
 *
 *  One-time by business rule (see the "students without an average" tab in
 *  the grad_school_head/administrative_coordinator dashboards — a student
 *  leaves that list for good the instant this succeeds, and must never come
 *  back). Enforced here, not just in that tab's own client-side filtering,
 *  by reading and writing inside a single Firestore transaction: if two
 *  staff members (e.g. the grad-school head and the administrative
 *  coordinator) submit an average for the same student at nearly the same
 *  moment, only the transaction that commits first wins — the second sees
 *  thesisEligibility.average already set inside its own transaction read and
 *  throws ALREADY_GRADED instead of silently overwriting the first grade. */
export async function setThesisEligibilityFromAverage(
  studentId: string,
  average: number,
  coordinatorUid: string,
  coordinatorRole: string,
): Promise<void> {
  if (typeof average !== 'number' || !Number.isFinite(average) || average < 0 || average > 100) {
    throw new StudentTrackError('average must be a number between 0 and 100.', 'הממוצע חייב להיות מספר בין 0 ל-100.');
  }

  const studentRef = db.collection('users').doc(studentId);

  const { eligible, previousEligible } = await db.runTransaction(async (tx) => {
    const studentSnap = await tx.get(studentRef);
    if (!studentSnap.exists) throw new StudentTrackError('Student not found.', 'הסטודנט לא נמצא.');
    const student = studentSnap.data()!;

    const policy = resolveTrackPolicy(student.degreeType, student.major);
    if (policy !== 'coordinator_gated') {
      throw new StudentTrackError(
        "This student's program does not use coordinator-gated thesis eligibility.",
        'תוכנית הלימודים של סטודנט זה אינה משתמשת בזכאות לתזה המאושרת ע"י רכז.'
      );
    }

    if (student.thesisEligibility?.average != null) {
      throw new StudentTrackError(
        "This student's grade average was already entered by someone else — it can only be entered once.",
        'ממוצע הציונים של סטודנט/ית זה כבר הוזן על ידי מישהו אחר — ניתן להזין אותו פעם אחת בלבד.',
        409,
        'ALREADY_GRADED',
      );
    }

    const eligible = average >= THESIS_ELIGIBILITY_THRESHOLD;

    const thesisEligibility = {
      method: 'average' as const,
      eligible,
      average,
      threshold: THESIS_ELIGIBILITY_THRESHOLD,
      computedScore: average,
      decidedBy: coordinatorUid,
      decidedAt: admin.firestore.FieldValue.serverTimestamp(),
      reason: null,
    };

    const update: Record<string, unknown> = { thesisEligibility };
    // Same "not eligible resets any track choice already made" rule as the
    // manual path — a lowered/corrected average that drops someone below the
    // threshold must not leave them stuck on a thesis track they no longer
    // qualify for.
    if (!eligible) {
      update.track = null;
      update.trackLocked = false;
      update.trackLockedReason = admin.firestore.FieldValue.delete();
      update.trackLockedAt = admin.firestore.FieldValue.delete();
    }

    tx.update(studentRef, update);

    return { eligible, previousEligible: student.thesisEligibility?.eligible ?? null };
  });

  await logAuditEvent({
    userId: coordinatorUid,
    userRole: coordinatorRole,
    action: 'student_thesis_eligibility_set',
    entityType: 'user',
    entityId: studentId,
    oldValue: { eligible: previousEligible },
    newValue: { eligible, average, threshold: THESIS_ELIGIBILITY_THRESHOLD },
  });

  await notifyThesisEligibilityDecided(studentId);
}

/** system_admin-only escape hatch — the caller (controller) must already
 *  have checked req.user.role === 'system_admin'. Free-form partial
 *  overwrite, no business-rule validation, for the rare case of an admin
 *  fixing a stuck/wrong state (e.g. undoing a coordinator's reversal, or
 *  correcting a track assigned before this feature existed). */
export async function adminOverrideStudentTrack(
  studentId: string,
  overrides: {
    track?: StudentTrack | null;
    trackLocked?: boolean;
    thesisEligible?: boolean | null;
  },
  adminUid: string,
): Promise<void> {
  const studentRef = db.collection('users').doc(studentId);
  const studentSnap = await studentRef.get();
  if (!studentSnap.exists) throw new StudentTrackError('Student not found.', 'הסטודנט לא נמצא.');
  const student = studentSnap.data()!;

  const update: Record<string, unknown> = {};
  if ('track' in overrides) update.track = overrides.track ?? null;
  if ('trackLocked' in overrides) {
    update.trackLocked = overrides.trackLocked;
    update.trackLockedReason = 'system_admin_override';
    update.trackLockedAt = admin.firestore.FieldValue.serverTimestamp();
  }
  if ('thesisEligible' in overrides && overrides.thesisEligible !== undefined) {
    update.thesisEligibility = overrides.thesisEligible === null ? null : {
      method: 'manual' as const,
      eligible: overrides.thesisEligible,
      decidedBy: adminUid,
      decidedAt: admin.firestore.FieldValue.serverTimestamp(),
      reason: 'system_admin override',
      threshold: null,
      computedScore: null,
    };
  }

  if (Object.keys(update).length === 0) {
    throw new StudentTrackError('No changes provided.', 'לא סופקו שינויים.');
  }

  await studentRef.update(update);

  await logAuditEvent({
    userId: adminUid,
    userRole: 'system_admin',
    action: 'student_track_overridden_by_admin',
    entityType: 'user',
    entityId: studentId,
    oldValue: {
      track: student.track ?? null,
      trackLocked: student.trackLocked ?? false,
      thesisEligibility: student.thesisEligibility ?? null,
    },
    newValue: overrides,
  });
}
