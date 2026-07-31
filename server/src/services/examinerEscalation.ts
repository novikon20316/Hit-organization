// src/services/examinerEscalation.ts
//
// P1 backlog item #6 — reacts to an external examiner declining or timing
// out instead of just flagging it passively in examinerTrackingReport
// (services/reports.ts). Two things happen, best-effort:
//   1. auto-suggest/promote the next examiner — an internal examiner in the
//      same faculty, not already on this panel, with the lightest current
//      load — onto the milestone in the declined/overdue examiner's place.
//   2. notify the faculty's coordinators either way (who was promoted, or
//      that no internal candidate was found and a human needs to pick one).
// No automatic *external* replacement is attempted — inviting a new outside
// examiner needs a name/email/institution the system doesn't have on file,
// so that always stays a coordinator decision.

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { logAuditEvent } from './auditLog.js';
import { sendNotificationEmail } from './emailService.js';
import { resolveStaffForScope } from './scopeAuthorization.js';
import { examinerKeyOf, replaceExaminerInOpenRound, type DefensePanelMember } from './defenseScheduling.js';

const ACTIVE_MILESTONE_STATUSES = new Set([
  'examiners_assigned', 'examiner_graded', 'both_examiners_graded',
  'awaiting_defense_date', 'date_conflict', 'defense_date_set', 'scheduled',
]);

export interface ExaminerCandidate {
  uid: string;
  displayName: string;
  activeLoad: number;
}

/** Internal examiners in `facultyId`, excluding `excludeUids`, sorted by
 *  current active-review load (ascending) — see ACTIVE_MILESTONE_STATUSES. */
export async function findNextExaminerCandidate(
  facultyId: string,
  excludeUids: string[],
): Promise<ExaminerCandidate | null> {
  const usersSnap = await db.collection('users')
    .where('facultyId', '==', facultyId)
    .where('roles', 'array-contains', 'internal_examiner')
    .get();

  const candidates = usersSnap.docs
    .filter((d) => !excludeUids.includes(d.id))
    .map((d) => ({ uid: d.id, displayName: d.data().displayName ?? 'Unknown' }));

  if (candidates.length === 0) return null;

  const milestonesSnap = await db.collection('milestones')
    .where('facultyId', '==', facultyId)
    .where('examinerIds', 'array-contains-any', candidates.map((c) => c.uid).slice(0, 30))
    .get();

  const loadByUid: Record<string, number> = {};
  candidates.forEach((c) => { loadByUid[c.uid] = 0; });
  milestonesSnap.docs.forEach((doc) => {
    const data = doc.data();
    if (!ACTIVE_MILESTONE_STATUSES.has(data.status)) return;
    (data.examinerIds ?? []).forEach((uid: string) => {
      if (uid in loadByUid) loadByUid[uid]!++;
    });
  });

  const ranked = candidates
    .map((c) => ({ ...c, activeLoad: loadByUid[c.uid] ?? 0 }))
    .sort((a, b) => a.activeLoad - b.activeLoad);

  return ranked[0] ?? null;
}

async function notifyCoordinators(
  facultyId: string,
  titleHe: string, titleEn: string,
  bodyHe: string, bodyEn: string,
  relatedProjectId: string | null,
  relatedMilestoneId: string | null,
): Promise<void> {
  try {
    const coordinatorUids = await resolveStaffForScope('coordinator', { facultyId }, []);

    await Promise.all(coordinatorUids.map((uid) =>
      db.collection('notifications').add({
        recipientId: uid,
        type: 'general',
        titleHe, titleEn, bodyHe, bodyEn,
        isRead: false,
        relatedProjectId,
        relatedMilestoneId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    ));
  } catch (err) {
    console.error('examinerEscalation.notifyCoordinators failed:', err);
  }
}

/**
 * Called for a declined or overdue examinerTokens/{tokenId} doc — either
 * from the scheduled sweep (notificationScheduler.ts) or a coordinator's
 * manual "promote next examiner" action. Idempotent-ish: callers should only
 * invoke this once per decline/overdue event (the sweep tracks that via its
 * own dedup flags; the manual endpoint re-validates status server-side).
 */
export async function promoteNextExaminer(
  tokenId: string,
  triggeredBy: string,
  triggeredByRole: string,
): Promise<{ promoted: ExaminerCandidate | null }> {
  const tokenRef = db.collection('examinerTokens').doc(tokenId);

  // Atomically claim this token for promotion, exactly once. An external
  // examiner's decline never leaves a uid in examinerIds to remove (they're
  // never added there in the first place — only internal candidates are), so
  // a second promotion for the same already-superseded token would arrayUnion
  // in a second candidate on top of the first, growing the panel past 2 with
  // nothing to swap out. This guard makes a duplicate/racing invocation for
  // the same token a no-op instead.
  const claimResult = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(tokenRef);
    if (!snap.exists) throw new Error('Examiner token not found.');
    const data = snap.data()!;
    if (data.status === 'superseded') return null;
    transaction.update(tokenRef, {
      status: 'superseded',
      supersededAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // The doc's pre-claim status ('declined'/'expired') drives the
    // notification wording below — capture it now, since the doc itself
    // will read back as 'superseded' after this transaction commits.
    return { token: data, preClaimStatus: data.status as string };
  });
  if (!claimResult) return { promoted: null };
  const { token, preClaimStatus } = claimResult;

  if (!token.projectId) throw new Error('This token has no associated project.');
  const projectSnap = await db.collection('projects').doc(token.projectId).get();
  if (!projectSnap.exists) throw new Error('Project not found.');
  const project = projectSnap.data()!;
  const facultyId: string = project.facultyId ?? '';

  const existingInternalIds: string[] = project.examinerIds ?? [];
  const candidate = await findNextExaminerCandidate(facultyId, existingInternalIds);

  if (candidate && token.milestoneId) {
    const milestoneRef = db.collection('milestones').doc(token.milestoneId);
    const newMember: DefensePanelMember = { type: 'internal', ref: candidate.uid, displayName: candidate.displayName };
    // The declined/overdue examiner is always external (see file header) —
    // if date matching is already open, its panel still has that dead token
    // in a slot that will never submit. Swap it for the promoted candidate
    // rather than just growing examinerIds, or the round can never resolve.
    const declinedExaminerKey = examinerKeyOf({ type: 'external', ref: tokenId });
    const swappedIntoPanel = await replaceExaminerInOpenRound(token.milestoneId, declinedExaminerKey, newMember);

    if (!swappedIntoPanel) {
      await Promise.all([
        milestoneRef.update({ examinerIds: admin.firestore.FieldValue.arrayUnion(candidate.uid) }),
        db.collection('projects').doc(token.projectId).update({ examinerIds: admin.firestore.FieldValue.arrayUnion(candidate.uid) }),
      ]);
    }

    try {
      await db.collection('notifications').add({
        recipientId: candidate.uid,
        type: 'general',
        titleHe: '📋 מונית כבוחן חלופי',
        titleEn: '📋 Appointed as replacement examiner',
        bodyHe: `הוקצית לשפוט את "${token.thesisTitle ?? ''}" לאחר שהבוחן החיצוני הקודם ${preClaimStatus === 'declined' ? 'סירב' : 'לא הגיב בזמן'}.`,
        bodyEn: `You've been assigned to review "${token.thesisTitle ?? ''}" after the previous external examiner ${preClaimStatus === 'declined' ? 'declined' : 'did not respond in time'}.`,
        isRead: false,
        relatedProjectId: token.projectId,
        relatedMilestoneId: token.milestoneId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.error(`promoteNextExaminer: failed to notify candidate ${candidate.uid}:`, err);
    }
  }

  // status/supersededAt already claimed transactionally above — just record
  // who ended up promoted (informational only, nothing else reads it).
  await tokenRef.update({ supersededBy: candidate?.uid ?? null });

  await logAuditEvent({
    userId: triggeredBy,
    userRole: triggeredByRole,
    action: 'next_examiner_promoted',
    entityType: 'examinerToken',
    entityId: tokenId,
    newValue: { promotedUid: candidate?.uid ?? null },
  });

  await notifyCoordinators(
    facultyId,
    candidate ? '✅ בוחן חלופי מונה אוטומטית' : '⚠️ נדרש מינוי בוחן חלופי',
    candidate ? '✅ Replacement examiner auto-appointed' : '⚠️ A replacement examiner is needed',
    candidate
      ? `${candidate.displayName} מונה כבוחן חלופי עבור "${token.thesisTitle ?? ''}" לאחר ש${preClaimStatus === 'declined' ? 'הבוחן הקודם סירב' : 'הבוחן הקודם לא הגיב בזמן'}.`
      : `לא נמצא בוחן פנימי פנוי באופן אוטומטי עבור "${token.thesisTitle ?? ''}" — נדרשת הקצאה ידנית.`,
    candidate
      ? `${candidate.displayName} was auto-appointed as replacement examiner for "${token.thesisTitle ?? ''}" after the previous examiner ${preClaimStatus === 'declined' ? 'declined' : 'did not respond in time'}.`
      : `No available internal examiner could be found automatically for "${token.thesisTitle ?? ''}" — manual assignment is needed.`,
    token.projectId,
    token.milestoneId ?? null,
  );

  return { promoted: candidate };
}

/** Manual "send reminder now" — same email the scheduled sweep would send,
 *  but coordinator-triggered and not gated by the sweep's own dedup flag. */
export async function sendManualExaminerReminder(
  tokenId: string,
  triggeredBy: string,
  triggeredByRole: string,
): Promise<void> {
  const tokenRef = db.collection('examinerTokens').doc(tokenId);
  const tokenSnap = await tokenRef.get();
  if (!tokenSnap.exists) throw new Error('Examiner token not found.');
  const token = tokenSnap.data()!;

  if (token.status === 'submitted' || token.status === 'declined' || token.status === 'superseded') {
    throw new Error(`Cannot send a reminder — this token's status is "${token.status}".`);
  }

  const baseUrl = process.env.EXAMINER_ACCESS_BASE_URL || '';
  await sendNotificationEmail({
    toEmail: token.examinerEmail,
    type: 'examiner_access_link',
    lang: token.examinerLanguage ?? 'he',
    data: {
      name: token.examinerName ?? '',
      thesisTitle: token.thesisTitle ?? '',
      studentName: token.studentName ?? '',
      link: `${baseUrl}/examiner-access?token=${encodeURIComponent(tokenId)}`,
    },
  });

  await tokenRef.update({ manualReminderSentAt: admin.firestore.FieldValue.serverTimestamp() });

  await logAuditEvent({
    userId: triggeredBy,
    userRole: triggeredByRole,
    action: 'examiner_reminder_sent',
    entityType: 'examinerToken',
    entityId: tokenId,
  });
}
