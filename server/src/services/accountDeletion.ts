// src/services/accountDeletion.ts
//
// Backs three entry points into the same account-deletion machinery:
//   1. Self-requested deletion (userController.ts's requestAccountDeletion/cancelAccountDeletion)
//   2. system_admin manual erase (adminController.ts's eraseUserBySystemAdmin) — immediate, no grace period
//   3. Automatic graduation-based flagging (flagGraduatedStudents, run on a schedule) — same
//      grace-period/cancel machinery as (1), just a different trigger and deletionReason.
//
// See the plan file for the full design rationale (Apple/Google store account-
// deletion requirement; why blocking beats orphaning; why the graduation date
// formula is deliberately conservative).

import { db, auth } from '../config/firebase.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { DEGREE_LENGTHS } from '../config/degreeLengths.js';
import { getAcademicCalendar } from './academicCalendar.js';

// Provisional — neither store mandates a specific number.
const GRACE_PERIOD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

function getEffectiveRoles(userData: FirebaseFirestore.DocumentData): string[] {
  const set = new Set<string>();
  if (userData.role) set.add(userData.role);
  (userData.additionalRoles ?? []).forEach((r: string) => set.add(r));
  (userData.roles ?? []).forEach((r: string) => set.add(r));
  return [...set];
}

/**
 * Blocks deletion when the account has an active dependency this codebase
 * has no reassignment mechanism for yet (a supervisor's active students, a
 * student's own active project, an internal examiner's pending/ungraded
 * defense assignment, or the last system_admin). Used by both self-requested
 * deletion and system_admin's manual erase — an admin can't bypass this
 * either, to avoid the same orphaning risk the block exists to prevent.
 */
export async function checkDeletionEligibility(uid: string): Promise<EligibilityResult> {
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) return { eligible: false, reason: 'User not found.' };
  const userData = userSnap.data()!;
  const roles = getEffectiveRoles(userData);

  if (roles.includes('student') && userData.hasActiveProject) {
    return {
      eligible: false,
      reason: 'You have an active project. Ask your coordinator or faculty admin to resolve this before deleting your account.',
    };
  }

  if (roles.includes('supervisor') || roles.includes('secondary_supervisor')) {
    const activeSnap = await db.collection('projects')
      .where('supervisorId', '==', uid)
      .where('status', 'in', ['active', 'in_progress'])
      .get();
    if (!activeSnap.empty) {
      return {
        eligible: false,
        reason: `You are supervising ${activeSnap.size} active student project${activeSnap.size === 1 ? '' : 's'}. Ask your faculty admin to reassign them before deleting your account.`,
      };
    }
  }

  if (roles.includes('internal_examiner')) {
    const defenseSnap = await db.collection('milestones')
      .where('type', '==', 'defense')
      .where('examinerIds', 'array-contains', uid)
      .get();
    const ungraded = defenseSnap.docs.filter((d) => !d.data().examinerGrading?.[uid]?.gradedAt);
    if (ungraded.length > 0) {
      return {
        eligible: false,
        reason: `You have ${ungraded.length} pending defense grading assignment${ungraded.length === 1 ? '' : 's'}. Ask your coordinator to reassign it before deleting your account.`,
      };
    }
  }

  if (roles.includes('system_admin')) {
    const [byRole, byRolesArray] = await Promise.all([
      db.collection('users').where('role', '==', 'system_admin').get(),
      db.collection('users').where('roles', 'array-contains', 'system_admin').get(),
    ]);
    const others = new Map<string, FirebaseFirestore.DocumentData>();
    [...byRole.docs, ...byRolesArray.docs].forEach((d) => {
      if (d.id === uid) return;
      const data = d.data();
      if (data.isActive === false || data.pendingDeletion) return;
      others.set(d.id, data);
    });
    if (others.size === 0) {
      return { eligible: false, reason: 'You are the last active system_admin — promote another account to system_admin first.' };
    }
  }

  return { eligible: true };
}

/** Starts the grace period. Does NOT touch `isActive` — that flag already
 * 403s every request in verifyToken, which would make the account
 * impossible to log back into to cancel. `pendingDeletion` is a separate
 * flag specifically so the account stays loginable during the grace period. */
export async function requestDeletion(uid: string, reason: 'self_requested' | 'graduated'): Promise<void> {
  await auth.revokeRefreshTokens(uid);
  await db.collection('users').doc(uid).update({
    pendingDeletion: true,
    deletionReason: reason,
    deletionRequestedAt: FieldValue.serverTimestamp(),
    deletionScheduledFor: Timestamp.fromMillis(Date.now() + GRACE_PERIOD_MS),
  });
}

/** Always allowed, regardless of deletionReason — no eligibility check. */
export async function cancelDeletion(uid: string): Promise<void> {
  await db.collection('users').doc(uid).update({
    pendingDeletion: FieldValue.delete(),
    deletionReason: FieldValue.delete(),
    deletionRequestedAt: FieldValue.delete(),
    deletionScheduledFor: FieldValue.delete(),
  });
}

/**
 * The actual deletion. Unlike the notification-write pattern fixed earlier
 * this session, this IS the primary action — failures here must surface
 * loudly for manual follow-up, not be swallowed.
 */
export async function purgeAccount(uid: string): Promise<void> {
  try {
    await auth.deleteUser(uid);
  } catch (err: any) {
    if (err?.code !== 'auth/user-not-found') {
      console.error(`purgeAccount: failed to delete Auth user ${uid}:`, err);
      throw err;
    }
  }

  const [notifsSnap, appsSnap] = await Promise.all([
    db.collection('notifications').where('recipientId', '==', uid).get(),
    db.collection('applications').where('studentId', '==', uid).get(),
  ]);

  const batch = db.batch();
  batch.delete(db.collection('users').doc(uid));
  notifsSnap.docs.forEach((d) => batch.delete(d.ref));
  appsSnap.docs.forEach((d) => batch.delete(d.ref));
  // Deliberately left untouched: chats.participants/messages,
  // milestones.studentIds/examinerIds/supervisorId, projects.supervisorId,
  // examinerRecommendations, and audit fields (coordinatorId/decidedBy/
  // approvedBy). By the time an account reaches purge, checkDeletionEligibility
  // already guarantees no *active* dependency remains — what's left is
  // historical/completed-record references, which this codebase already
  // renders as "Unknown" everywhere (the usersById[x] ?? 'Unknown' pattern).
  await batch.commit();
}

/** Run on a schedule (see index.ts). Per-account errors are logged and
 * skipped so one bad account can't block the rest of the sweep. */
export async function purgeDueAccounts(): Promise<void> {
  const now = Timestamp.now();
  const snap = await db.collection('users')
    .where('pendingDeletion', '==', true)
    .where('deletionScheduledFor', '<=', now)
    .get();

  for (const doc of snap.docs) {
    try {
      await purgeAccount(doc.id);
      console.log(`purgeDueAccounts: purged ${doc.id}`);
    } catch (err) {
      console.error(`purgeDueAccounts: failed to purge ${doc.id} — needs manual follow-up:`, err);
    }
  }
}

// ── Automatic graduation-based flagging ─────────────────────────────────────

function programLengthYearsFor(degreeType: string | null, major: string | null): number {
  if (degreeType === 'masters') return 2; // matches computeIsEligible's masters year-1/year-2 rule
  return DEGREE_LENGTHS[major ?? 'default'] ?? DEGREE_LENGTHS.default ?? 4;
}

/**
 * Deliberately conservative — per the user's own stated priority ("cannot
 * erase a student if technically didn't graduate"). This system has no
 * per-semester enrollment record (whether a given student actually used a
 * summer term in a particular year), so rather than trying to detect which
 * track a student was on, this always assumes the SLOWER track and adds a
 * full extra buffer year on top. A graduated student's dead account just
 * sits longer before being flagged; an active student is never flagged early.
 * Uses the configured fall-semester start as a once-a-year safe cutoff (the
 * configured spring date isn't consumed here — reserved for future features).
 */
export function computeGraduationEligibleDate(
  programStartDate: Date,
  programLengthYears: number,
  calendar: { fallSemesterStartMonth: number; fallSemesterStartDay: number },
): Date {
  const targetYear = programStartDate.getFullYear() + programLengthYears + 1;
  return new Date(targetYear, calendar.fallSemesterStartMonth - 1, calendar.fallSemesterStartDay);
}

/** Run on a schedule (see index.ts). Flags via the same requestDeletion() path
 * as self-service — reuses the identical grace-period/cancel/purge machinery. */
export async function flagGraduatedStudents(): Promise<void> {
  const calendar = await getAcademicCalendar();
  const now = new Date();

  const snap = await db.collection('users').where('role', '==', 'student').get();

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.pendingDeletion) continue;

    const programStartDate: Date | null = data.programStartDate?.toDate?.() ?? data.createdAt?.toDate?.() ?? null;
    if (!programStartDate) continue; // no anchor date at all — skip rather than guess

    const years = programLengthYearsFor(data.degreeType ?? null, data.major ?? null);
    const eligibleDate = computeGraduationEligibleDate(programStartDate, years, calendar);
    if (now < eligibleDate) continue;

    try {
      await requestDeletion(doc.id, 'graduated');
      try {
        await db.collection('notifications').add({
          recipientId: doc.id,
          type: 'account_graduation_flagged',
          titleHe: 'החשבון שלך מיועד למחיקה',
          titleEn: 'Your account is scheduled for deletion',
          bodyHe: 'לפי הרישומים שלנו סיימת את משך הלימודים הצפוי. החשבון שלך יימחק בקרוב, אלא אם תבטל.',
          bodyEn: "Our records show you've completed your program's expected duration. Your account will be deleted soon unless you cancel.",
          isRead: false,
          relatedProjectId: null,
          relatedMilestoneId: null,
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (notifyErr) {
        console.error(`flagGraduatedStudents: failed to notify ${doc.id}:`, notifyErr);
      }
      console.log(`flagGraduatedStudents: flagged ${doc.id} (eligible ${eligibleDate.toISOString()})`);
    } catch (err) {
      console.error(`flagGraduatedStudents: failed to flag ${doc.id}:`, err);
    }
  }
}
