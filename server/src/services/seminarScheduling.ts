// src/services/seminarScheduling.ts
//
// A "seminar" milestone (WorkflowMilestoneSpec.seminarScheduling — first on
// Computer Science's "הרצאת סמינר") has no committee: once the supervisor's
// chain finishes, the milestone isn't done — the student still has to give
// the talk. It goes to the administrative coordinator instead:
//
//   chain done → seminar_awaiting_date → (she books a date) → seminar_scheduled
//     → performed:     coordinator_approved, the next milestone opens
//     → not performed: seminar_awaiting_date again, she must book a new date
//
// Same dual-model as a defense's status + logistics, but the date lives in
// its own `seminarSchedule` field rather than being mirrored into `dueDate`
// (see isDefenseDateConfirmed for what mirroring it cost the defense flow).
// Every attempt that reached a yes/no answer is kept on `seminarAttempts`.
//
// HTTP layer: controllers/seminarController.ts.

import admin from 'firebase-admin';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { db } from '../config/firebase.js';
import { notifyUser, type NotifyParams } from './notify.js';
import { resolveMilestoneScope, resolveStaffForScope, type ResourceScope } from './scopeAuthorization.js';
import type { ChainStage } from './workflowTemplates.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Jerusalem';

export const SEMINAR_AWAITING_DATE = 'seminar_awaiting_date';
export const SEMINAR_SCHEDULED = 'seminar_scheduled';

export function isSeminarInProgress(status: string | null | undefined): boolean {
  return status === SEMINAR_AWAITING_DATE || status === SEMINAR_SCHEDULED;
}

/** The currently-booked slot. `date` is a plain Israel-calendar day
 *  (YYYY-MM-DD), like a defense's candidate dates — never a Timestamp, so it
 *  can't drift across midnight between the server and a client's timezone. */
export interface SeminarSlot {
  date: string;
  time: string;
  location: string;
  note: string;
  setById: string;
  setByName: string;
  setAt: FirebaseFirestore.Timestamp;
}

export interface SeminarAttempt {
  date: string;
  time: string;
  location: string;
  outcome: 'performed' | 'not_performed';
  note: string;
  decidedById: string;
  decidedByName: string;
  decidedAt: FirebaseFirestore.Timestamp;
}

export interface SeminarContactRequest {
  id: string;
  studentId: string;
  studentName: string;
  message: string;
  createdAt: FirebaseFirestore.Timestamp;
  /** Set once she books/changes the date or records an outcome. */
  resolvedAt: FirebaseFirestore.Timestamp | null;
}

export function todayInIsrael(): string {
  return dayjs().tz(TZ).format('YYYY-MM-DD');
}

/** When the booked talk starts, Israel time. The yes/no on whether it took
 *  place opens from this moment, not from midnight of that day. */
export function seminarStartsAt(slot: { date: string; time: string }): dayjs.Dayjs {
  return dayjs.tz(`${slot.date}T${slot.time}`, TZ);
}

export function seminarHasStarted(slot: { date: string; time: string }): boolean {
  return !seminarStartsAt(slot).isAfter(dayjs());
}

export function isValidIsoDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dayjs(value).format('YYYY-MM-DD') === value;
}

export function isValidClockTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function formatSeminarDay(date: string): string {
  return dayjs(date).format('DD/MM/YYYY');
}

/** Everything a transaction writes when the supervisor's chain finishes on a
 *  seminar milestone. currentStageIndex moves past the last stage so the
 *  chain's own approve/reject/grade endpoints all answer "not awaiting
 *  that" — a repeat click can't re-enter the chain and wipe a booked date. */
export function seminarHandoffFields(routing: ChainStage[]): Record<string, unknown> {
  return {
    status: SEMINAR_AWAITING_DATE,
    currentStageIndex: routing.length,
    seminarAwaitingDateSince: admin.firestore.FieldValue.serverTimestamp(),
  };
}

/** Who runs the seminar calendar for this milestone — the administrative
 *  coordinator, with the plain coordinator as a fallback so a major with
 *  nobody in that role doesn't strand the student silently. */
async function seminarStaffIds(resource: ResourceScope): Promise<string[]> {
  const secretaries = await resolveStaffForScope('administrative_secretary', resource, [], [], false);
  return secretaries.length > 0 ? secretaries : resolveStaffForScope('coordinator', resource, [], [], false);
}

function milestoneTitle(m: FirebaseFirestore.DocumentData) {
  return { he: m.nameHe ?? m.type ?? '', en: m.nameEn ?? m.type ?? '' };
}

type StaffCopy = { titleHe: string; titleEn: string; bodyHe: string; bodyEn: string };

function seminarStaffNotice(uid: string, milestoneId: string, m: FirebaseFirestore.DocumentData, copy: StaffCopy): NotifyParams {
  return {
    recipientId: uid,
    type: 'general',
    inAppType: 'seminar_action_needed',
    ...copy,
    relatedProjectId: m.projectId ?? null,
    relatedMilestoneId: milestoneId,
    taskKind: 'seminar',
    taskRoleCandidates: ['administrative_secretary', 'coordinator'],
    emailData: { message: { he: copy.bodyHe, en: copy.bodyEn } },
    channels: { sms: false, whatsapp: false },
  };
}

async function notifySeminarStaff(milestoneId: string, m: FirebaseFirestore.DocumentData, copy: StaffCopy): Promise<void> {
  const resource = (await resolveMilestoneScope(milestoneId)) ?? { facultyId: m.facultyId ?? '' };
  const staffIds = await seminarStaffIds(resource);
  await Promise.all(staffIds.map((uid) =>
    notifyUser(seminarStaffNotice(uid, milestoneId, m, copy))
      .catch((err) => console.error(`notifySeminarStaff: failed for ${uid} on milestone ${milestoneId}:`, err))
  ));
}

function dateNeededCopy(m: FirebaseFirestore.DocumentData): StaffCopy {
  const title = milestoneTitle(m);
  return {
    titleHe: 'יש לקבוע מועד סמינר',
    titleEn: 'Seminar date needed',
    bodyHe: `המנחה אישר/ה את "${title.he}" — יש לקבוע לסטודנט/ית מועד להרצאת הסמינר.`,
    bodyEn: `The supervisor approved "${title.en}" — please set the student's seminar date.`,
  };
}

function outcomeNeededCopy(m: FirebaseFirestore.DocumentData, date: string): StaffCopy {
  const title = milestoneTitle(m);
  const day = formatSeminarDay(date);
  return {
    titleHe: 'האם הסמינר התקיים?',
    titleEn: 'Did the seminar take place?',
    bodyHe: `מועד "${title.he}" (${day}) עבר — יש לסמן אם הסטודנט/ית ביצע/ה את הסמינר.`,
    bodyEn: `The date of "${title.en}" (${day}) has passed — please record whether the student performed it.`,
  };
}

async function notifySeminarStudents(
  m: FirebaseFirestore.DocumentData,
  milestoneId: string,
  content: Omit<NotifyParams, 'recipientId' | 'relatedProjectId' | 'relatedMilestoneId'>,
): Promise<void> {
  await Promise.all(((m.studentIds ?? []) as string[]).map((studentId) =>
    notifyUser({
      recipientId: studentId,
      relatedProjectId: m.projectId ?? null,
      relatedMilestoneId: milestoneId,
      ...content,
    }).catch((err) => console.error(`notifySeminarStudents: failed for ${studentId} on milestone ${milestoneId}:`, err))
  ));
}

/** The supervisor just approved — tell her to book a date, and tell the
 *  student the milestone isn't stuck, it's waiting on that date. */
export async function onSeminarChainComplete(milestoneId: string, m: FirebaseFirestore.DocumentData): Promise<void> {
  const title = milestoneTitle(m);
  await notifySeminarStaff(milestoneId, m, dateNeededCopy(m));
  const bodyHe = `"${title.he}" אושר/ה על ידי המנחה. הרכזת האדמיניסטרטיבית תקבע מועד להרצאה ותישלח אליך הודעה.`;
  const bodyEn = `"${title.en}" was approved by your supervisor. The administrative coordinator will set the date and you'll be notified.`;
  await notifySeminarStudents(m, milestoneId, {
    type: 'general',
    inAppType: 'seminar_supervisor_approved',
    titleHe: 'המנחה אישר/ה את הסמינר',
    titleEn: 'Your supervisor approved the seminar',
    bodyHe,
    bodyEn,
    emailData: { message: { he: bodyHe, en: bodyEn } },
  });
}

export async function notifySeminarDateSet(
  milestoneId: string,
  m: FirebaseFirestore.DocumentData,
  slot: Pick<SeminarSlot, 'date' | 'time' | 'location' | 'note'>,
  rescheduled: boolean,
): Promise<void> {
  const title = milestoneTitle(m);
  const day = formatSeminarDay(slot.date);
  const place = slot.location ? ` · ${slot.location}` : '';
  const copy = {
    titleHe: rescheduled ? 'מועד הסמינר עודכן' : 'נקבע מועד לסמינר',
    titleEn: rescheduled ? 'Seminar date changed' : 'Seminar date set',
    bodyHe: `מועד "${title.he}": ${day} בשעה ${slot.time}${place}.`,
    bodyEn: `"${title.en}" is on ${day} at ${slot.time}${place}.`,
  };
  await notifySeminarStudents(m, milestoneId, {
    type: 'seminar_date_set',
    ...copy,
    emailData: {
      milestoneTitle: title,
      date: day,
      time: slot.time,
      location: slot.location,
      note: slot.note,
      rescheduled: rescheduled ? '1' : '',
    },
  });
  const supervisorIds = [m.supervisorId, m.secondarySupervisorId].filter(Boolean) as string[];
  await Promise.all(supervisorIds.map((uid) =>
    notifyUser({
      recipientId: uid,
      type: 'general',
      inAppType: 'seminar_date_set',
      ...copy,
      relatedProjectId: m.projectId ?? null,
      relatedMilestoneId: milestoneId,
      emailData: { message: { he: copy.bodyHe, en: copy.bodyEn } },
      channels: { sms: false, whatsapp: false },
    }).catch((err) => console.error(`notifySeminarDateSet: supervisor notify failed for ${uid}:`, err))
  ));
}

/** The student didn't give the talk — they're told, and she gets the same
 *  "book a date" task she got the first time (the milestone can't move
 *  without it). */
export async function notifySeminarNotPerformed(
  milestoneId: string,
  m: FirebaseFirestore.DocumentData,
  date: string,
  note: string,
): Promise<void> {
  const title = milestoneTitle(m);
  const day = formatSeminarDay(date);
  await notifySeminarStudents(m, milestoneId, {
    type: 'seminar_not_performed',
    titleHe: 'הסמינר לא התקיים',
    titleEn: 'Seminar not performed',
    bodyHe: `"${title.he}" לא בוצע במועד ${day}. הרכזת האדמיניסטרטיבית תקבע מועד חדש.${note ? ` הערה: ${note}` : ''}`,
    bodyEn: `"${title.en}" wasn't performed on ${day}. The administrative coordinator will set a new date.${note ? ` Note: ${note}` : ''}`,
    emailData: { milestoneTitle: title, date: day, note },
  });
  await notifySeminarStaff(milestoneId, m, {
    titleHe: 'יש לקבוע מועד סמינר חדש',
    titleEn: 'New seminar date needed',
    bodyHe: `"${title.he}" לא בוצע במועד ${day} — יש לקבוע מועד חדש.`,
    bodyEn: `"${title.en}" wasn't performed on ${day} — please set a new date.`,
  });
}

export async function notifySeminarContactRequest(
  milestoneId: string,
  m: FirebaseFirestore.DocumentData,
  studentName: string,
  message: string,
): Promise<void> {
  const title = milestoneTitle(m);
  const resource = (await resolveMilestoneScope(milestoneId)) ?? { facultyId: m.facultyId ?? '' };
  const staffIds = await seminarStaffIds(resource);
  await Promise.all(staffIds.map((uid) =>
    notifyUser({
      recipientId: uid,
      type: 'seminar_contact_request',
      inAppType: 'seminar_contact_request',
      titleHe: 'פנייה מסטודנט/ית בנוגע לסמינר',
      titleEn: 'Student message about a seminar',
      bodyHe: `${studentName} בנוגע ל"${title.he}": ${message}`,
      bodyEn: `${studentName} about "${title.en}": ${message}`,
      // The student's own words stay off the lock screen.
      pushBodyHe: `${studentName} פנה/תה בנוגע ל"${title.he}".`,
      pushBodyEn: `${studentName} sent a message about "${title.en}".`,
      relatedProjectId: m.projectId ?? null,
      relatedMilestoneId: milestoneId,
      taskKind: 'seminar',
      taskRoleCandidates: ['administrative_secretary', 'coordinator'],
      emailData: { studentName, milestoneTitle: title, message },
      channels: { sms: false, whatsapp: false },
    }).catch((err) => console.error(`notifySeminarContactRequest: failed for ${uid}:`, err))
  ));
}

/** Hourly sweep: a booked talk's start time has passed with no yes/no
 *  recorded — asks her for the answer once per date (the milestone blocks the
 *  student until someone records it, and nothing else would raise it). */
export async function sendSeminarOutcomeReminders(): Promise<void> {
  const snap = await db.collection('milestones')
    .where('seminarScheduling', '==', true)
    .where('status', '==', SEMINAR_SCHEDULED)
    .get();
  for (const doc of snap.docs) {
    const m = doc.data();
    const date: string | undefined = m.seminarSchedule?.date;
    if (!date || !m.seminarSchedule?.time || !seminarHasStarted(m.seminarSchedule) || m.seminarOutcomeReminderFor === date) continue;
    await notifySeminarStaff(doc.id, m, outcomeNeededCopy(m, date));
    await doc.ref.update({ seminarOutcomeReminderFor: date });
  }
}

/** On app start (POST /api/notifications/reconcile-tasks): every seminar
 *  waiting on the calendar staff — no date yet, or its time passed with no
 *  yes/no — whose task never reached this user (they got the role or scope
 *  after the one-time alert went out) gets one now, in-app only. That task is
 *  what lights the Seminars tab badge until the work is done. */
export async function catchUpSeminarTasks(uid: string): Promise<number> {
  const snap = await db.collection('milestones').where('seminarScheduling', '==', true).get();
  const needing = snap.docs.filter((d) => {
    const m = d.data();
    if (m.status === SEMINAR_AWAITING_DATE) return true;
    return m.status === SEMINAR_SCHEDULED && !!m.seminarSchedule?.date && !!m.seminarSchedule?.time && seminarHasStarted(m.seminarSchedule);
  });
  if (!needing.length) return 0;

  const open = await db.collection('notifications')
    .where('recipientId', '==', uid)
    .where('pendingTask', '==', true)
    .get();
  const covered = new Set(open.docs
    .filter((d) => d.data().type === 'seminar_action_needed')
    .map((d) => d.data().relatedMilestoneId));

  let created = 0;
  for (const doc of needing) {
    if (covered.has(doc.id)) continue;
    const m = doc.data();
    const resource = (await resolveMilestoneScope(doc.id)) ?? { facultyId: m.facultyId ?? '' };
    if (!(await seminarStaffIds(resource)).includes(uid)) continue;
    const copy = m.status === SEMINAR_AWAITING_DATE ? dateNeededCopy(m) : outcomeNeededCopy(m, m.seminarSchedule.date);
    const notice = seminarStaffNotice(uid, doc.id, m, copy);
    await notifyUser({ ...notice, channels: { email: false, push: false, sms: false, whatsapp: false } });
    created++;
  }
  return created;
}
