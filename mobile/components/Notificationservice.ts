// services/notificationService.ts
//
// The single source of truth for ALL notifications in the app.
// Import and call these functions from supervisor/home, student/home, etc.
// Never write notification docs directly from UI code.

import {
  collection, addDoc, serverTimestamp, query,
  where, getDocs, updateDoc, doc, writeBatch,
} from 'firebase/firestore';
import { db } from '../src/firebase/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────
export type NotifType =
  | 'project_published'
  | 'application_approved'
  | 'application_rejected'
  | 'meeting_requested'
  | 'milestone_graded'
  | 'milestone_deadline_7d'
  | 'milestone_deadline_1d';

export interface NotifPayload {
  type:               NotifType;
  recipientId:        string;
  titleHe:            string;
  titleEn:            string;
  bodyHe:             string;
  bodyEn:             string;
  relatedProjectId?:  string;
  relatedMilestoneId?:string;
  pushToken?:         string; // Expo push token of recipient
}

// ─── Notification content templates ──────────────────────────────────────────
export const NOTIF_TEMPLATES: Record<
  NotifType,
  (vars: Record<string, string>) => { titleHe: string; titleEn: string; bodyHe: string; bodyEn: string }
> = {
  project_published: (v) => ({
    titleHe: '📢 פרויקט חדש פורסם!',
    titleEn: '📢 New Project Published!',
    bodyHe:  `פרויקט חדש "${v.titleHe}" פורסם על ידי ${v.supervisorName}. הגש מועמדות עכשיו!`,
    bodyEn:  `New project "${v.titleEn}" was published by ${v.supervisorName}. Apply now!`,
  }),
  application_approved: (v) => ({
    titleHe: '✅ מועמדותך אושרה!',
    titleEn: '✅ Your Application Was Approved!',
    bodyHe:  `מועמדותך לפרויקט "${v.titleHe}" אושרה. ברוך הבא לפרויקט!`,
    bodyEn:  `Your application for "${v.titleEn}" was approved. Welcome to the project!`,
  }),
  application_rejected: (v) => ({
    titleHe: '❌ מועמדותך נדחתה',
    titleEn: '❌ Your Application Was Rejected',
    bodyHe:  `מועמדותך לפרויקט "${v.titleHe}" נדחתה. תוכל להגיש מועמדות לפרויקטים אחרים.`,
    bodyEn:  `Your application for "${v.titleEn}" was rejected. You can apply to other projects.`,
  }),
  meeting_requested: (v) => ({
    titleHe: '📅 נדרשת פגישה',
    titleEn: '📅 Meeting Requested',
    bodyHe:  `המנחה ${v.supervisorName} ביקש להיפגש איתך לפני אישור מועמדותך לפרויקט "${v.titleHe}".`,
    bodyEn:  `Supervisor ${v.supervisorName} requested a meeting before approving your application for "${v.titleEn}".`,
  }),
  milestone_graded: (v) => ({
    titleHe: '✏️ קיבלת ציון',
    titleEn: '✏️ You Received a Grade',
    bodyHe:  `${v.milestoneHe} בפרויקט "${v.titleHe}" קיבל ציון: ${v.score}.`,
    bodyEn:  `${v.milestoneEn} for "${v.titleEn}" was graded: ${v.score}.`,
  }),
  milestone_deadline_7d: (v) => ({
    titleHe: '⏰ תזכורת — 7 ימים להגשה',
    titleEn: '⏰ Reminder — 7 Days to Submit',
    bodyHe:  `${v.milestoneHe} בפרויקט "${v.titleHe}" צריך להיות מוגש תוך 7 ימים.`,
    bodyEn:  `${v.milestoneEn} for "${v.titleEn}" is due in 7 days.`,
  }),
  milestone_deadline_1d: (v) => ({
    titleHe: '🚨 מחר הוא יום האחרון להגשה!',
    titleEn: '🚨 Submission Due Tomorrow!',
    bodyHe:  `${v.milestoneHe} בפרויקט "${v.titleHe}" צריך להיות מוגש מחר!`,
    bodyEn:  `${v.milestoneEn} for "${v.titleEn}" is due tomorrow!`,
  }),
};

// ─── Core: write a notification to Firestore + send push ─────────────────────
async function sendNotification(payload: NotifPayload): Promise<void> {
  // 1. Write to Firestore (in-app notification)
  await addDoc(collection(db, 'notifications'), {
    recipientId:        payload.recipientId,
    type:               payload.type,
    titleHe:            payload.titleHe,
    titleEn:            payload.titleEn,
    bodyHe:             payload.bodyHe,
    bodyEn:             payload.bodyEn,
    relatedProjectId:   payload.relatedProjectId   ?? null,
    relatedMilestoneId: payload.relatedMilestoneId ?? null,
    isRead:             false,
    createdAt:          serverTimestamp(),
    emailSent:          false,
    emailSentAt:        null,
  });

  // 2. Send Expo push notification if token available
  if (payload.pushToken) {
    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:    payload.pushToken,
          title: payload.titleHe, // default to Hebrew; could be dynamic
          body:  payload.bodyHe,
          data:  {
            type:               payload.type,
            relatedProjectId:   payload.relatedProjectId,
            relatedMilestoneId: payload.relatedMilestoneId,
          },
          sound: 'default',
          badge: 1,
        }),
      });
    } catch (e) {
      // Push failing should not crash the app — Firestore notification still saved
      console.warn('Push notification failed:', e);
    }
  }
}

// ─── Batch send to multiple recipients ───────────────────────────────────────
async function sendToMany(payloads: NotifPayload[]): Promise<void> {
  await Promise.allSettled(payloads.map(sendNotification));
}

// ─── Helper: get Expo push token for a user ───────────────────────────────────
async function getPushToken(userId: string): Promise<string | undefined> {
  const snap = await getDocs(
    query(collection(db, 'users'), where('__name__', '==', userId))
  );
  if (snap.empty) return undefined;
  return snap.docs[0].data().expoPushToken ?? undefined;
}

// ─── Helper: get eligible students for a project ─────────────────────────────
//
// Rules from the spec:
//   bachelors project → students in year 3 OR 4, degreeType === 'bachelors'
//   masters project   → students in year 1, degreeType === 'masters'
//   both              → all of the above
//
// Major / faculty:
//   The project's facultyId must match the student's facultyId
//   UNLESS the project is cross-faculty (facultyId === 'all')
//
// Year logic by major (from your description):
//   computer_science  → 3-year degree → final years: 3
//   electrical        → 4-year degree → final years: 3, 4
//   software          → 3-year degree → final years: 3
//   industrial        → 4-year degree → final years: 3, 4
//   mechanical        → 4-year degree → final years: 3, 4
//   learning_technology → 3-year degree → final years: 3
//   (masters is always year 1 for all majors)
//
export const DEGREE_LENGTHS: Record<string, number> = {
  computer_science:    3,
  electrical:          4,
  software:            3,
  industrial:          4,
  mechanical:          4,
  learning_technology: 3,
  default:             4,
};

function getFinalYears(major: string, degreeType: 'bachelors' | 'masters'): number[] {
  if (degreeType === 'masters') return [1];
  const length = DEGREE_LENGTHS[major] ?? DEGREE_LENGTHS.default;
  // Final year(s): last year, and also the one before for 4-year degrees
  if (length === 4) return [3, 4];
  return [length]; // [3] for 3-year degrees
}

export async function getEligibleStudents(project: {
  facultyId:  string;
  degreeType: 'bachelors' | 'masters' | 'both';
}): Promise<Array<{ id: string; pushToken?: string }>> {
  const results: Array<{ id: string; pushToken?: string }> = [];

  // Build queries based on degreeType
  const degreeTypes: Array<'bachelors' | 'masters'> =
    project.degreeType === 'both'
      ? ['bachelors', 'masters']
      : [project.degreeType];

  for (const deg of degreeTypes) {
    // Query all students of this degree type in the right faculty
    let q = query(
      collection(db, 'users'),
      where('role', '==', 'student'),
      where('degreeType', '==', deg),
      where('isActive', '==', true),
    );

    // Faculty filter (unless cross-faculty)
    if (project.facultyId !== 'all') {
      q = query(
        collection(db, 'users'),
        where('role', '==', 'student'),
        where('degreeType', '==', deg),
        where('facultyId', '==', project.facultyId),
        where('isActive', '==', true),
      );
    }

    const snap = await getDocs(q);

    for (const d of snap.docs) {
      const data = d.data();
      const major      = data.major ?? 'default';
      const yearOfStudy= data.yearOfStudy ?? 0;
      const finalYears = getFinalYears(major, deg);

      // Only include students in their final year(s)
      if (!finalYears.includes(yearOfStudy)) continue;

      // Don't notify students who already have an active project
      if (data.hasActiveProject) continue;

      results.push({
        id:        d.id,
        pushToken: data.expoPushToken,
      });
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API — call these from your UI components
// ─────────────────────────────────────────────────────────────────────────────

// 1. Notify eligible students when a new project is published
export async function notifyProjectPublished(project: {
  id:           string;
  titleHe:      string;
  titleEn:      string;
  facultyId:    string;
  degreeType:   'bachelors' | 'masters' | 'both';
  supervisorName: string;
}): Promise<void> {
  const students = await getEligibleStudents(project);
  if (students.length === 0) return;

  const template = NOTIF_TEMPLATES.project_published({
    titleHe:        project.titleHe,
    titleEn:        project.titleEn,
    supervisorName: project.supervisorName,
  });

  await sendToMany(
    students.map((s) => ({
      type:              'project_published' as NotifType,
      recipientId:       s.id,
      ...template,
      relatedProjectId:  project.id,
      pushToken:         s.pushToken,
    }))
  );
}

// 2. Notify student of application decision
export async function notifyApplicationDecision(params: {
  studentId:      string;
  studentToken?:  string;
  projectId:      string;
  titleHe:        string;
  titleEn:        string;
  supervisorName: string;
  decision:       'approved' | 'rejected' | 'meeting_requested';
}): Promise<void> {
  const type = params.decision === 'approved'
    ? 'application_approved'
    : params.decision === 'rejected'
    ? 'application_rejected'
    : 'meeting_requested';

  const template = NOTIF_TEMPLATES[type]({
    titleHe:        params.titleHe,
    titleEn:        params.titleEn,
    supervisorName: params.supervisorName,
  });

  await sendNotification({
    type,
    recipientId:      params.studentId,
    ...template,
    relatedProjectId: params.projectId,
    pushToken:        params.studentToken,
  });
}

// 3. Notify student(s) when a milestone is graded
export async function notifyMilestoneGraded(params: {
  studentIds:    string[];
  projectId:     string;
  titleHe:       string;
  titleEn:       string;
  milestoneId:   string;
  milestoneHe:   string;
  milestoneEn:   string;
  score:         number;
}): Promise<void> {
  const template = NOTIF_TEMPLATES.milestone_graded({
    titleHe:     params.titleHe,
    titleEn:     params.titleEn,
    milestoneHe: params.milestoneHe,
    milestoneEn: params.milestoneEn,
    score:       String(params.score),
  });

  const payloads: NotifPayload[] = [];
  for (const sid of params.studentIds) {
    const token = await getPushToken(sid);
    payloads.push({
      type:               'milestone_graded',
      recipientId:        sid,
      ...template,
      relatedProjectId:   params.projectId,
      relatedMilestoneId: params.milestoneId,
      pushToken:          token,
    });
  }

  await sendToMany(payloads);
}

// 4. Deadline reminders — call this from a scheduled job or on app open
//    Checks ALL pending milestones and sends reminders for those due in 7d or 1d
export async function checkAndSendDeadlineReminders(): Promise<void> {
  const now        = new Date();
  const in7Days    = new Date(now.getTime() + 7  * 24 * 60 * 60 * 1000);
  const in1Day     = new Date(now.getTime() + 1  * 24 * 60 * 60 * 1000);
  const in7DaysEnd = new Date(now.getTime() + 7  * 24 * 60 * 60 * 1000 + 60 * 60 * 1000);
  const in1DayEnd  = new Date(now.getTime() + 1  * 24 * 60 * 60 * 1000 + 60 * 60 * 1000);

  // Fetch pending milestones
  const q = query(
    collection(db, 'milestones'),
    where('status', '==', 'pending'),
  );
  const snap = await getDocs(q);

  for (const d of snap.docs) {
    const data       = d.data();
    const dueDate    = data.dueDate?.toDate?.() as Date | undefined;
    if (!dueDate) continue;

    // Check if reminder already sent today (avoid duplicates)
    const alreadySent7 = data.reminder7dSent === true;
    const alreadySent1 = data.reminder1dSent === true;

    const is7Days = dueDate >= in7Days && dueDate < in7DaysEnd && !alreadySent7;
    const is1Day  = dueDate >= in1Day  && dueDate < in1DayEnd  && !alreadySent1;

    if (!is7Days && !is1Day) continue;

    // Get project info
    const { getDoc } = await import('firebase/firestore');
    const projSnap = await getDoc(doc(db, 'projects', data.projectId));
    if (!projSnap.exists()) continue;
    const proj = projSnap.data();

    const milestoneLabels: Record<string, { he: string; en: string }> = {
      research_proposal: { he: 'הצעת מחקר',    en: 'Research Proposal' },
      progress_report:   { he: 'דו"ח התקדמות', en: 'Progress Report' },
      final_report:      { he: 'דו"ח מסכם',    en: 'Final Report' },
      defense:           { he: 'הגנה',          en: 'Defense' },
    };
    const ml = milestoneLabels[data.type] ?? { he: data.type, en: data.type };

    const type: NotifType = is7Days ? 'milestone_deadline_7d' : 'milestone_deadline_1d';
    const template = NOTIF_TEMPLATES[type]({
      titleHe:     proj.titleHe,
      titleEn:     proj.titleEn,
      milestoneHe: ml.he,
      milestoneEn: ml.en,
    });

    // Send to each student
    const payloads: NotifPayload[] = [];
    for (const sid of (data.studentIds ?? [])) {
      const token = await getPushToken(sid);
      payloads.push({
        type,
        recipientId:        sid,
        ...template,
        relatedProjectId:   data.projectId,
        relatedMilestoneId: d.id,
        pushToken:          token,
      });
    }
    await sendToMany(payloads);

    // Mark reminder as sent on the milestone doc to avoid duplicates
    await updateDoc(doc(db, 'milestones', d.id), {
      ...(is7Days ? { reminder7dSent: true } : {}),
      ...(is1Day  ? { reminder1dSent: true  } : {}),
    });
  }
}

// ─── Mark a single notification as read ──────────────────────────────────────
export async function markNotificationRead(notifId: string): Promise<void> {
  await updateDoc(doc(db, 'notifications', notifId), { isRead: true });
}

// ─── Mark ALL notifications as read for a user ───────────────────────────────
export async function markAllNotificationsRead(userId: string): Promise<void> {
  const q    = query(
    collection(db, 'notifications'),
    where('recipientId', '==', userId),
    where('isRead', '==', false)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;

  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { isRead: true }));
  await batch.commit();
}