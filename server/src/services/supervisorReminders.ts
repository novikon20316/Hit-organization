// src/services/supervisorReminders.ts
//
// Reminders a supervisor schedules for the students of their own project
// (rules agreed 2026-11-08): pick a not-yet-submitted milestone and how many
// days before its due date; the student gets a fixed system message plus
// an optional short note from the supervisor. At most MAX_PER_PROJECT
// waiting per project. A reminder whose milestone was already submitted
// (or no longer exists) when its time comes is dropped silently. Sent
// through notifyUser, so the student's own notification settings apply.
//
// Stored in scheduledReminders (server-only, no Firestore rule); a doc is
// deleted once sent or dropped, so the collection only ever holds what's
// still waiting.

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../config/firebase.js';
import { notifyUser } from './notify.js';

dayjs.extend(utc);
dayjs.extend(timezone);
const TZ = 'Asia/Jerusalem';
const COLLECTION = 'scheduledReminders';
/** Reminders go out at this local hour on their day. */
const SEND_HOUR = 9;

export const MAX_REMINDERS_PER_PROJECT = 5;
export const MAX_REMINDER_NOTE = 200;
export const REMINDER_DAY_OPTIONS = [0, 1, 2, 3, 5, 7, 14] as const;

export class ReminderError extends Error {
  constructor(public he: string, public en: string, public status = 400) {
    super(en);
  }
}

export interface ReminderView {
  id: string;
  milestoneId: string;
  milestoneNameHe: string;
  milestoneNameEn: string;
  daysBefore: number;
  sendAt: string;
  note: string | null;
}

function toView(id: string, d: FirebaseFirestore.DocumentData): ReminderView {
  return {
    id,
    milestoneId: d.milestoneId,
    milestoneNameHe: d.milestoneNameHe ?? '',
    milestoneNameEn: d.milestoneNameEn ?? '',
    daysBefore: d.daysBefore,
    sendAt: (d.sendAt as Timestamp).toDate().toISOString(),
    note: d.note ?? null,
  };
}

/** Throws unless `uid` is the project's primary or secondary supervisor. */
async function loadOwnProject(projectId: string, uid: string): Promise<FirebaseFirestore.DocumentData> {
  const snap = await db.collection('projects').doc(projectId).get();
  const p = snap.data();
  if (!p) throw new ReminderError('הפרויקט לא נמצא.', 'Project not found.', 404);
  if (p.supervisorId !== uid && p.secondarySupervisorId !== uid) {
    throw new ReminderError('אפשר לתזמן תזכורות רק לפרויקטים שבהנחייתך.', 'You can only schedule reminders for projects you supervise.', 403);
  }
  return p;
}

export async function listProjectReminders(projectId: string, uid: string): Promise<ReminderView[]> {
  await loadOwnProject(projectId, uid);
  const snap = await db.collection(COLLECTION).where('projectId', '==', projectId).get();
  return snap.docs.map((d) => toView(d.id, d.data())).sort((a, b) => a.sendAt.localeCompare(b.sendAt));
}

export async function createProjectReminder(projectId: string, uid: string, input: { milestoneId: unknown; daysBefore: unknown; note: unknown }): Promise<ReminderView> {
  const project = await loadOwnProject(projectId, uid);
  const daysBefore = Number(input.daysBefore);
  if (!(REMINDER_DAY_OPTIONS as readonly number[]).includes(daysBefore)) {
    throw new ReminderError('בחירת ימים לא תקינה.', 'Invalid number of days.');
  }
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > MAX_REMINDER_NOTE) {
    throw new ReminderError(`ההערה ארוכה מ-${MAX_REMINDER_NOTE} תווים.`, `The note is longer than ${MAX_REMINDER_NOTE} characters.`);
  }
  const milestoneId = typeof input.milestoneId === 'string' ? input.milestoneId : '';
  const milestone = milestoneId ? (await db.collection('milestones').doc(milestoneId).get()).data() : undefined;
  if (!milestone || milestone.projectId !== projectId) throw new ReminderError('אבן הדרך לא נמצאה בפרויקט.', 'Milestone not found in this project.', 404);
  if (milestone.status !== 'pending') throw new ReminderError('אבן הדרך כבר הוגשה.', 'This milestone was already submitted.');
  const due: Date | null = milestone.dueDate?.toDate?.() ?? null;
  if (!due) throw new ReminderError('לאבן הדרך אין מועד הגשה.', 'This milestone has no due date.');

  const sendAt = dayjs(due).tz(TZ).subtract(daysBefore, 'day').hour(SEND_HOUR).minute(0).second(0).millisecond(0);
  if (!sendAt.isAfter(dayjs())) throw new ReminderError('המועד הזה כבר עבר — בחרו פחות ימים.', 'That time has already passed — pick fewer days.');

  const existing = await db.collection(COLLECTION).where('projectId', '==', projectId).get();
  if (existing.size >= MAX_REMINDERS_PER_PROJECT) {
    throw new ReminderError(`אפשר עד ${MAX_REMINDERS_PER_PROJECT} תזכורות ממתינות לפרויקט.`, `Up to ${MAX_REMINDERS_PER_PROJECT} waiting reminders per project.`);
  }
  if (existing.docs.some((d) => d.data().milestoneId === milestoneId && d.data().daysBefore === daysBefore)) {
    throw new ReminderError('תזכורת זהה כבר מתוזמנת.', 'The same reminder is already scheduled.');
  }

  const ref = db.collection(COLLECTION).doc();
  const data = {
    projectId,
    milestoneId,
    milestoneNameHe: milestone.nameHe ?? milestone.type,
    milestoneNameEn: milestone.nameEn ?? milestone.type,
    studentIds: (project.enrolledStudentIds ?? []) as string[],
    createdBy: uid,
    daysBefore,
    note: note || null,
    sendAt: Timestamp.fromDate(sendAt.toDate()),
    createdAt: FieldValue.serverTimestamp(),
  };
  await ref.set(data);
  return toView(ref.id, { ...data, sendAt: data.sendAt });
}

export async function deleteReminder(reminderId: string, uid: string): Promise<void> {
  const ref = db.collection(COLLECTION).doc(reminderId);
  const data = (await ref.get()).data();
  if (!data) throw new ReminderError('התזכורת לא נמצאה.', 'Reminder not found.', 404);
  await loadOwnProject(data.projectId, uid);
  await ref.delete();
}

/** Hourly (index.ts, tracked in systemHealth.ts): sends every reminder whose
 *  time has come, dropping any whose milestone was already submitted. */
export async function sendScheduledReminders(): Promise<void> {
  // Single-field range query — no composite index needed.
  const due = await db.collection(COLLECTION).where('sendAt', '<=', Timestamp.now()).get();
  for (const doc of due.docs) {
    const r = doc.data();
    const milestone = (await db.collection('milestones').doc(r.milestoneId).get()).data();
    if (milestone && milestone.status === 'pending') {
      const dueDate: Date | null = milestone.dueDate?.toDate?.() ?? null;
      const dateHe = dueDate ? dayjs(dueDate).tz(TZ).format('DD/MM/YYYY') : '';
      const noteHe = r.note ? `\nהערת המנחה: ${r.note}` : '';
      const noteEn = r.note ? `\nSupervisor's note: ${r.note}` : '';
      for (const studentId of r.studentIds as string[]) {
        await notifyUser({
          recipientId: studentId,
          type: 'supervisor_reminder',
          titleHe: `⏰ תזכורת מהמנחה: ${r.milestoneNameHe}`,
          titleEn: `⏰ Reminder from your supervisor: ${r.milestoneNameEn}`,
          bodyHe: `מועד ההגשה של "${r.milestoneNameHe}" הוא ${dateHe}.${noteHe}`,
          bodyEn: `"${r.milestoneNameEn}" is due on ${dateHe}.${noteEn}`,
          relatedProjectId: r.projectId,
          relatedMilestoneId: r.milestoneId,
          emailData: {
            milestoneTitle: { he: r.milestoneNameHe, en: r.milestoneNameEn },
            dueDate: dateHe,
            note: r.note ?? '',
          },
        }).catch((err) => console.error(`sendScheduledReminders: notify ${studentId} failed:`, err));
      }
    }
    await doc.ref.delete();
  }
}
