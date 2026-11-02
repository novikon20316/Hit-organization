// src/controllers/seminarController.ts
//
// The administrative coordinator's seminar calendar — see
// services/seminarScheduling.ts for the flow. Only she (and system_admin)
// sets dates and records outcomes; the plain coordinator sees seminars on
// their defense calendar, read-only, straight off the dashboard payload.

import admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { logAuditEvent } from '../services/auditLog.js';
import { logProjectRecordEntry } from '../services/projectRecords.js';
import { clearStaleMilestoneNotifications } from '../services/notify.js';
import { targetScreenFor } from '../services/notificationTargets.js';
import { resolveMilestoneScope, withinCoordinatorScope, type ResourceScope } from '../services/scopeAuthorization.js';
import { isDefenseDateConfirmed } from '../services/workflowTemplates.js';
import {
  SEMINAR_AWAITING_DATE,
  SEMINAR_SCHEDULED,
  isSeminarInProgress,
  isValidClockTime,
  isValidIsoDay,
  notifySeminarContactRequest,
  notifySeminarDateSet,
  notifySeminarNotPerformed,
  todayInIsrael,
  type SeminarAttempt,
  type SeminarContactRequest,
  type SeminarSlot,
} from '../services/seminarScheduling.js';
import { notifyMilestoneApprovalComplete } from './coordinatorController.js';
import { L } from '../utils/localize.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const SEMINAR_ROLES = ['administrative_secretary', 'system_admin'];
const MAX_NOTE_LENGTH = 500;
const MAX_CONTACT_MESSAGE_LENGTH = 1000;
const MAX_OPEN_CONTACT_REQUESTS = 5;

function iso(value: any): string | null {
  return value?.toDate?.()?.toISOString?.() ?? null;
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/** Mutation guard — null when she may act, otherwise the error response. */
async function denySeminarAction(req: AuthenticatedRequest, res: Response, milestoneId: string): Promise<Response | null> {
  if (!req.user || !hasAnyRole(req.user, SEMINAR_ROLES)) {
    return res.status(403).json({ message: L(req, 'Access denied: administrative coordinator only.', 'הגישה נדחתה: רכזת אדמיניסטרטיבית בלבד.') });
  }
  const scope = await resolveMilestoneScope(milestoneId);
  if (!scope) return res.status(404).json({ message: L(req, 'Milestone not found.', 'אבן הדרך לא נמצאה.') });
  if (!withinCoordinatorScope(req.user, scope)) {
    return res.status(403).json({ message: L(req, 'This milestone is outside your assigned scope.', 'אבן דרך זו מחוץ לתחום האחריות שהוקצה לך.') });
  }
  return null;
}

function resolvedContactRequests(requests: SeminarContactRequest[] | undefined): SeminarContactRequest[] {
  const now = admin.firestore.Timestamp.now();
  return (requests ?? []).map((r) => (r.resolvedAt ? r : { ...r, resolvedAt: now }));
}

/**
 * GET /api/coordinator/seminars
 * Every seminar in her scope (in progress, or already given — the calendar
 * keeps past talks visible) plus the same scope's confirmed defense dates, so
 * one calendar shows both and a clash is visible before she books.
 */
export const getSeminars = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || !hasAnyRole(req.user, SEMINAR_ROLES)) {
    return res.status(403).json({ message: L(req, 'Access denied: administrative coordinator only.', 'הגישה נדחתה: רכזת אדמיניסטרטיבית בלבד.') });
  }
  try {
    const [seminarSnap, defenseSnap] = await Promise.all([
      db.collection('milestones').where('seminarScheduling', '==', true).get(),
      db.collection('milestones').where('type', '==', 'defense').get(),
    ]);
    const confirmedDefenses = defenseSnap.docs.filter((d) => isDefenseDateConfirmed(d.data().status) && d.data().dueDate);

    const projectIds = [...new Set([...seminarSnap.docs, ...confirmedDefenses].map((d) => d.data().projectId).filter(Boolean))] as string[];
    const projectSnaps = projectIds.length ? await db.getAll(...projectIds.map((id) => db.collection('projects').doc(id))) : [];
    const projects = new Map(projectSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()!]));

    const inScope = (m: FirebaseFirestore.DocumentData) => {
      const project = projects.get(m.projectId);
      if (!project || project.isArchived) return null;
      const resource: ResourceScope = {
        facultyId: project.facultyId ?? '',
        major: project.major || undefined,
        degreeLevel: project.degreeType || undefined,
        processType: project.projectType || undefined,
      };
      return withinCoordinatorScope(req.user, resource) ? project : null;
    };

    const seminarDocs = seminarSnap.docs.filter((d) => {
      const m = d.data();
      return !!inScope(m) && (isSeminarInProgress(m.status) || (m.seminarAttempts ?? []).length > 0);
    });

    const userIds = [...new Set(seminarDocs.flatMap((d) => [...(d.data().studentIds ?? []), d.data().supervisorId].filter(Boolean)))] as string[];
    const userSnaps = userIds.length ? await db.getAll(...userIds.map((id) => db.collection('users').doc(id))) : [];
    const names = new Map(userSnaps.map((s) => [s.id, (s.data()?.displayName as string | undefined) ?? '']));

    const seminars = seminarDocs.map((d) => {
      const m = d.data();
      const project = projects.get(m.projectId)!;
      const attempts = ((m.seminarAttempts ?? []) as SeminarAttempt[]).map((a) => ({
        date: a.date, time: a.time, location: a.location, outcome: a.outcome, note: a.note,
        decidedByName: a.decidedByName, decidedAt: iso(a.decidedAt),
      }));
      const contactRequests = ((m.seminarContactRequests ?? []) as SeminarContactRequest[])
        .filter((r) => !r.resolvedAt)
        .map((r) => ({ id: r.id, studentId: r.studentId, studentName: r.studentName, message: r.message, createdAt: iso(r.createdAt) }));
      return {
        milestoneId: d.id,
        projectId: m.projectId,
        projectTitleHe: project.titleHe ?? '',
        projectTitleEn: project.titleEn ?? '',
        facultyId: project.facultyId ?? '',
        major: project.major ?? '',
        nameHe: m.nameHe ?? '',
        nameEn: m.nameEn ?? '',
        status: m.status,
        students: ((m.studentIds ?? []) as string[]).map((id) => ({ id, name: names.get(id) ?? '' })),
        supervisorName: names.get(m.supervisorId) ?? '',
        schedule: isSeminarInProgress(m.status) && m.seminarSchedule
          ? { date: m.seminarSchedule.date, time: m.seminarSchedule.time, location: m.seminarSchedule.location ?? '', note: m.seminarSchedule.note ?? '' }
          : null,
        attempts,
        contactRequests,
      };
    });

    const defenses = confirmedDefenses.flatMap((d) => {
      const m = d.data();
      const project = inScope(m);
      if (!project) return [];
      return [{
        milestoneId: d.id,
        projectTitleHe: project.titleHe ?? '',
        projectTitleEn: project.titleEn ?? '',
        date: dayjs(m.dueDate.toDate()).tz('Asia/Jerusalem').format('YYYY-MM-DD'),
        time: m.defenseTime ?? '',
      }];
    });

    return res.status(200).json({ seminars, defenses, today: todayInIsrael() });
  } catch (error) {
    console.error('getSeminars error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load seminars.', 'טעינת הסמינרים נכשלה.') });
  }
};

/**
 * POST /api/coordinator/seminars/:milestoneId/schedule
 * Books a date, or moves one that hasn't happened yet (e.g. after the student
 * wrote that it doesn't work for them).
 */
export const scheduleSeminar = async (req: AuthenticatedRequest, res: Response) => {
  const milestoneId = req.params.milestoneId as string;
  const denied = await denySeminarAction(req, res, milestoneId);
  if (denied) return denied;

  const { date, time } = req.body ?? {};
  const location = cleanText(req.body?.location, 200);
  const note = cleanText(req.body?.note, MAX_NOTE_LENGTH);
  if (!isValidIsoDay(date)) return res.status(400).json({ message: L(req, 'Please pick a valid date.', 'יש לבחור תאריך תקין.') });
  if (!isValidClockTime(time)) return res.status(400).json({ message: L(req, 'Please pick a valid time.', 'יש לבחור שעה תקינה.') });
  const today = todayInIsrael();
  if (date < today) return res.status(400).json({ message: L(req, 'The seminar date cannot be in the past.', 'מועד הסמינר לא יכול להיות בעבר.') });

  const milestoneRef = db.collection('milestones').doc(milestoneId);
  let rescheduled = false;
  let milestone: FirebaseFirestore.DocumentData | undefined;
  try {
    const outcome = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(milestoneRef);
      const fresh = snap.data();
      if (!fresh?.seminarScheduling || !isSeminarInProgress(fresh.status)) return 'wrong_status' as const;
      if (fresh.status === SEMINAR_SCHEDULED && fresh.seminarSchedule?.date < today) return 'outcome_first' as const;
      rescheduled = fresh.status === SEMINAR_SCHEDULED;
      milestone = fresh;
      const slot: SeminarSlot = {
        date, time, location, note,
        setById: req.user!.uid,
        setByName: req.user?.displayName ?? '',
        setAt: admin.firestore.Timestamp.now(),
      };
      transaction.update(milestoneRef, {
        status: SEMINAR_SCHEDULED,
        seminarSchedule: slot,
        seminarContactRequests: resolvedContactRequests(fresh.seminarContactRequests),
        stageEnteredAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return 'ok' as const;
    });
    if (outcome === 'wrong_status') {
      return res.status(400).json({ message: L(req, 'This seminar is not waiting for a date.', 'סמינר זה אינו ממתין לקביעת מועד.') });
    }
    if (outcome === 'outcome_first') {
      return res.status(400).json({ message: L(req, 'This date has passed — please record first whether the seminar took place.', 'המועד כבר עבר — יש לסמן תחילה אם הסמינר התקיים.') });
    }
  } catch (error) {
    console.error('scheduleSeminar error:', error);
    return res.status(500).json({ message: L(req, 'Failed to save the seminar date.', 'שמירת מועד הסמינר נכשלה.') });
  }

  await logAuditEvent({
    userId: req.user!.uid,
    userRole: req.user?.role ?? 'administrative_secretary',
    action: 'seminar_date_set',
    entityType: 'milestone',
    entityId: milestoneId,
    newValue: { date, time, location, rescheduled },
  });
  await logProjectRecordEntry({
    projectId: milestone!.projectId,
    type: 'seminar_date_set',
    actorId: req.user!.uid,
    actorRole: req.user?.role ?? 'administrative_secretary',
    actorDisplayName: req.user?.displayName,
    data: { milestoneId, date, time, location, rescheduled },
  });
  await notifySeminarDateSet(milestoneId, milestone!, { date, time, location, note }, rescheduled);
  return res.status(200).json({ success: true, message: 'Seminar date saved.' });
};

/**
 * POST /api/coordinator/seminars/:milestoneId/outcome
 * { performed: boolean, note? } — only once the booked day has arrived.
 * Performed closes the milestone (the next one opens); not performed puts it
 * back on her list for a new date.
 */
export const recordSeminarOutcome = async (req: AuthenticatedRequest, res: Response) => {
  const milestoneId = req.params.milestoneId as string;
  const denied = await denySeminarAction(req, res, milestoneId);
  if (denied) return denied;

  const performed = req.body?.performed;
  if (typeof performed !== 'boolean') return res.status(400).json({ message: L(req, 'Please choose whether the seminar took place.', 'יש לבחור אם הסמינר התקיים.') });
  const note = cleanText(req.body?.note, MAX_NOTE_LENGTH);

  const milestoneRef = db.collection('milestones').doc(milestoneId);
  let milestone: FirebaseFirestore.DocumentData | undefined;
  let attempt: SeminarAttempt | undefined;
  try {
    const outcome = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(milestoneRef);
      const fresh = snap.data();
      if (!fresh?.seminarScheduling || fresh.status !== SEMINAR_SCHEDULED || !fresh.seminarSchedule) return 'wrong_status' as const;
      const slot = fresh.seminarSchedule as SeminarSlot;
      if (slot.date > todayInIsrael()) return 'too_early' as const;

      attempt = {
        date: slot.date,
        time: slot.time,
        location: slot.location ?? '',
        outcome: performed ? 'performed' : 'not_performed',
        note,
        decidedById: req.user!.uid,
        decidedByName: req.user?.displayName ?? '',
        decidedAt: admin.firestore.Timestamp.now(),
      };
      const update: Record<string, unknown> = {
        seminarAttempts: admin.firestore.FieldValue.arrayUnion(attempt),
        seminarContactRequests: resolvedContactRequests(fresh.seminarContactRequests),
        stageEnteredAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (performed) {
        update.status = 'coordinator_approved';
        update.coordinatorApprovedAt = admin.firestore.FieldValue.serverTimestamp();
        update.coordinatorId = req.user!.uid;
      } else {
        update.status = SEMINAR_AWAITING_DATE;
        update.seminarSchedule = null;
        update.seminarAwaitingDateSince = admin.firestore.FieldValue.serverTimestamp();
      }
      transaction.update(milestoneRef, update);
      milestone = fresh;
      return 'ok' as const;
    });
    if (outcome === 'wrong_status') {
      return res.status(400).json({ message: L(req, 'This seminar has no booked date to confirm.', 'לסמינר זה אין מועד קבוע לאישור.') });
    }
    if (outcome === 'too_early') {
      return res.status(400).json({ message: L(req, "The seminar date hasn't arrived yet.", 'מועד הסמינר עדיין לא הגיע.') });
    }
  } catch (error) {
    console.error('recordSeminarOutcome error:', error);
    return res.status(500).json({ message: L(req, 'Failed to save the seminar outcome.', 'שמירת תוצאת הסמינר נכשלה.') });
  }

  await logAuditEvent({
    userId: req.user!.uid,
    userRole: req.user?.role ?? 'administrative_secretary',
    action: performed ? 'seminar_performed' : 'seminar_not_performed',
    entityType: 'milestone',
    entityId: milestoneId,
    newValue: { date: attempt!.date, note },
  });
  await logProjectRecordEntry({
    projectId: milestone!.projectId,
    type: performed ? 'seminar_performed' : 'seminar_not_performed',
    actorId: req.user!.uid,
    actorRole: req.user?.role ?? 'administrative_secretary',
    actorDisplayName: req.user?.displayName,
    data: { milestoneId, date: attempt!.date, note },
  });

  if (performed) {
    await clearStaleMilestoneNotifications(milestoneId, [targetScreenFor('administrative_secretary', 'seminar')]);
    await notifyMilestoneApprovalComplete(milestone!, milestoneId);
  } else {
    await notifySeminarNotPerformed(milestoneId, milestone!, attempt!.date, note);
  }
  return res.status(200).json({ success: true, message: 'Seminar outcome saved.' });
};

/**
 * POST /api/milestones/:milestoneId/seminar-contact
 * The student writes to the administrative coordinator about their seminar
 * date (students have no chat with her — see chatController.ts's
 * getEligiblePartnerIds). Kept on the milestone so it shows on her card next
 * to the date it's about, until she changes the date or records an outcome.
 */
export const contactSeminarCoordinator = async (req: AuthenticatedRequest, res: Response) => {
  const milestoneId = req.params.milestoneId as string;
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  const message = cleanText(req.body?.message, MAX_CONTACT_MESSAGE_LENGTH);
  if (!message) return res.status(400).json({ message: L(req, 'Please write a message.', 'יש לכתוב הודעה.') });

  const milestoneRef = db.collection('milestones').doc(milestoneId);
  const studentName = req.user?.displayName ?? '';
  let milestone: FirebaseFirestore.DocumentData | undefined;
  try {
    const outcome = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(milestoneRef);
      const fresh = snap.data();
      if (!fresh || !((fresh.studentIds ?? []) as string[]).includes(uid)) return 'forbidden' as const;
      if (!fresh.seminarScheduling || !isSeminarInProgress(fresh.status)) return 'wrong_status' as const;
      const requests = (fresh.seminarContactRequests ?? []) as SeminarContactRequest[];
      if (requests.filter((r) => !r.resolvedAt && r.studentId === uid).length >= MAX_OPEN_CONTACT_REQUESTS) return 'too_many' as const;
      const request: SeminarContactRequest = {
        id: randomUUID(), studentId: uid, studentName, message,
        createdAt: admin.firestore.Timestamp.now(),
        resolvedAt: null,
      };
      transaction.update(milestoneRef, {
        seminarContactRequests: [...requests, request],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      milestone = fresh;
      return 'ok' as const;
    });
    if (outcome === 'forbidden') return res.status(403).json({ message: L(req, 'This is not your milestone.', 'אבן דרך זו אינה שלך.') });
    if (outcome === 'wrong_status') {
      return res.status(400).json({ message: L(req, 'This seminar is not open for messages.', 'לא ניתן לשלוח הודעות לגבי סמינר זה.') });
    }
    if (outcome === 'too_many') {
      return res.status(429).json({ message: L(req, 'You already have several messages waiting — the coordinator will get back to you.', 'כבר נשלחו כמה הודעות הממתינות לטיפול — הרכזת תחזור אליך.') });
    }
  } catch (error) {
    console.error('contactSeminarCoordinator error:', error);
    return res.status(500).json({ message: L(req, 'Failed to send your message.', 'שליחת ההודעה נכשלה.') });
  }

  await notifySeminarContactRequest(milestoneId, milestone!, studentName, message);
  return res.status(200).json({ success: true, message: 'Message sent.' });
};
