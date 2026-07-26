// src/services/notificationScheduler.ts
//
// Activates two sets of notifications that already existed as data/templates
// but nothing ever triggered:
//   1. milestone_deadline_7d / milestone_deadline_1d — EMAIL_TEMPLATES has
//      carried these since emailTemplates.ts was written, but no code path
//      ever called sendNotificationEmail with them.
//   2. External-examiner review-window reminders + coordinator escalation —
//      examinerTrackingReport (services/reports.ts) computes a passive
//      'warning'/'overdue' exceptionLevel for display, but nothing acts on
//      it (no reminder sent, nobody alerted).
//
// Run on a schedule (see index.ts) — same in-process setInterval pattern as
// services/accountDeletion.ts's purgeDueAccounts/flagGraduatedStudents.
// Dedup flags on the milestone/examinerTokens docs keep repeated runs
// idempotent (no duplicate reminders on every sweep).

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { sendNotificationEmail } from './emailService.js';
import { promoteNextExaminer } from './examinerEscalation.js';
import { notifyUser } from './notify.js';

const DAY_MS = 24 * 60 * 60 * 1000;

async function notifyStudentOfDeadline(
  studentId: string,
  milestone: FirebaseFirestore.DocumentData,
  milestoneId: string,
  kind: '7d' | '1d',
): Promise<void> {
  const type = kind === '7d' ? 'milestone_deadline_7d' : 'milestone_deadline_1d';
  try {
    await notifyUser({
      recipientId: studentId,
      type,
      titleHe: kind === '7d' ? '⏰ תזכורת: 7 ימים לסיום אבן הדרך' : '🚨 מחר הוא המועד האחרון!',
      titleEn: kind === '7d' ? '⏰ Reminder: 7 Days Until Milestone Deadline' : '🚨 Tomorrow Is the Deadline!',
      bodyHe: `נותרו ${kind === '7d' ? '7 ימים' : 'פחות מ-24 שעות'} להגשת "${milestone.nameHe ?? milestone.type}".`,
      bodyEn: `${kind === '7d' ? '7 days' : 'Less than 24 hours'} left to submit "${milestone.nameEn ?? milestone.type}".`,
      relatedProjectId: milestone.projectId ?? null,
      relatedMilestoneId: milestoneId,
      emailData: {
        milestoneTitle: {
          he: milestone.nameHe ?? milestone.type ?? '',
          en: milestone.nameEn ?? milestone.type ?? '',
        },
      },
    });
  } catch (err) {
    console.error(`notifyStudentOfDeadline(${kind}): failed for student ${studentId} on milestone ${milestoneId}:`, err);
  }
}

async function notifyStudentOfOverdue(
  studentId: string,
  milestone: FirebaseFirestore.DocumentData,
  milestoneId: string,
  daysLate: number,
): Promise<void> {
  try {
    await notifyUser({
      recipientId: studentId,
      type: 'milestone_overdue',
      titleHe: '⏰ אבן הדרך שלך באיחור',
      titleEn: '⏰ Your Milestone Is Overdue',
      bodyHe: `אבן הדרך "${milestone.nameHe ?? milestone.type}" באיחור של ${daysLate} ${daysLate === 1 ? 'יום' : 'ימים'}. אנא הגש/י בהקדם האפשרי.`,
      bodyEn: `Your milestone "${milestone.nameEn ?? milestone.type}" is ${daysLate} day(s) overdue. Please submit as soon as possible.`,
      relatedProjectId: milestone.projectId ?? null,
      relatedMilestoneId: milestoneId,
      emailData: {
        milestoneTitle: {
          he: milestone.nameHe ?? milestone.type ?? '',
          en: milestone.nameEn ?? milestone.type ?? '',
        },
        daysLate: String(daysLate),
      },
    });
  } catch (err) {
    console.error(`notifyStudentOfOverdue: failed for student ${studentId} on milestone ${milestoneId}:`, err);
  }
}

/** Run on a schedule (see index.ts). */
export async function sendMilestoneDeadlineReminders(): Promise<void> {
  const now = Date.now();
  const snap = await db.collection('milestones').where('status', '==', 'pending').get();

  for (const doc of snap.docs) {
    const data = doc.data();
    const dueDate: Date | null = data.dueDate?.toDate?.() ?? null;
    if (!dueDate) continue;

    const studentIds: string[] = data.studentIds ?? [];
    if (studentIds.length === 0) continue;

    const daysLeft = (dueDate.getTime() - now) / DAY_MS;

    try {
      if (daysLeft <= 7 && daysLeft > 1 && !data.deadlineReminder7dSentAt) {
        await Promise.all(studentIds.map((sid) => notifyStudentOfDeadline(sid, data, doc.id, '7d')));
        await doc.ref.update({ deadlineReminder7dSentAt: admin.firestore.FieldValue.serverTimestamp() });
      } else if (daysLeft <= 1 && daysLeft > -1 && !data.deadlineReminder1dSentAt) {
        await Promise.all(studentIds.map((sid) => notifyStudentOfDeadline(sid, data, doc.id, '1d')));
        await doc.ref.update({ deadlineReminder1dSentAt: admin.firestore.FieldValue.serverTimestamp() });
      } else if (daysLeft <= -1) {
        // Overdue — fire once when it first crosses into "late", then once
        // per additional calendar day late (not once per hourly sweep),
        // gated by a UTC date-string compared against the last reminder.
        const today = new Date().toISOString().slice(0, 10);
        if (data.lastOverdueReminderDate !== today) {
          const daysLate = Math.floor(-daysLeft);
          await Promise.all(studentIds.map((sid) => notifyStudentOfOverdue(sid, data, doc.id, daysLate)));
          await doc.ref.update({ lastOverdueReminderDate: today });
        }
      }
    } catch (err) {
      console.error(`sendMilestoneDeadlineReminders: failed for milestone ${doc.id}:`, err);
    }
  }
}

async function escalateOverdueExaminerToCoordinators(
  tokenId: string,
  t: FirebaseFirestore.DocumentData,
): Promise<void> {
  let facultyId: string | null = null;
  if (t.projectId) {
    const projSnap = await db.collection('projects').doc(t.projectId).get();
    facultyId = projSnap.data()?.facultyId ?? null;
  }
  if (!facultyId) return;

  // array-contains + one equality clause is automatically indexed by
  // Firestore — no composite index needed for this combination.
  const coordinatorsSnap = await db.collection('users')
    .where('facultyId', '==', facultyId)
    .where('roles', 'array-contains', 'coordinator')
    .get();

  await Promise.all(coordinatorsSnap.docs.map((coordDoc) =>
    db.collection('notifications').add({
      recipientId: coordDoc.id,
      type: 'general',
      titleHe: '⚠️ בוחן חיצוני לא הגיב בזמן',
      titleEn: '⚠️ External examiner overdue',
      bodyHe: `הבוחן ${t.examinerName ?? ''} לא סיים את השיפוט עבור "${t.thesisTitle ?? ''}" בתוך פרק הזמן שנקבע. שקול/י לשלוח תזכורת ידנית או למנות בוחן נוסף.`,
      bodyEn: `Examiner ${t.examinerName ?? ''} has not completed the review for "${t.thesisTitle ?? ''}" within the allotted time. Consider a manual reminder or appointing another examiner.`,
      isRead: false,
      relatedProjectId: t.projectId ?? null,
      relatedMilestoneId: t.milestoneId ?? null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  ));

  console.log(`escalateOverdueExaminerToCoordinators: notified ${coordinatorsSnap.size} coordinator(s) of faculty ${facultyId} — overdue token ${tokenId}`);
}

/**
 * Run on a schedule (see index.ts). Reminds an external examiner whose
 * review window is closing; once genuinely overdue OR declined, escalates to
 * the faculty's coordinators AND best-effort auto-promotes the next examiner
 * (see services/examinerEscalation.ts, P1 backlog item #6) — an internal
 * examiner in the same faculty takes over automatically when one's
 * available, otherwise the escalation notification says a human needs to
 * pick one (no automatic *external* replacement — that always needs a
 * coordinator's name/email/institution input).
 */
export async function sendExaminerDeadlineReminders(): Promise<void> {
  const now = Date.now();
  const snap = await db.collection('examinerTokens').where('status', 'in', ['pending', 'accepted', 'declined']).get();

  for (const doc of snap.docs) {
    const t = doc.data();

    try {
      if (t.status === 'declined') {
        if (t.declineHandledAt) continue;
        await promoteNextExaminer(doc.id, 'system', 'system');
        await doc.ref.update({ declineHandledAt: admin.firestore.FieldValue.serverTimestamp() });
        continue;
      }

      const expiresAt: Date | null = t.expiresAt ? new Date(t.expiresAt) : null;
      if (!expiresAt) continue;
      const msLeft = expiresAt.getTime() - now;

      if (msLeft <= 7 * DAY_MS && msLeft > 0 && !t.warningReminderSentAt) {
        try {
          const baseUrl = process.env.EXAMINER_ACCESS_BASE_URL || '';
          await sendNotificationEmail({
            toEmail: t.examinerEmail,
            // Reuses the same link email the examiner already trusts — this
            // is a second nudge to it, not a new template.
            type: 'examiner_access_link',
            lang: t.examinerLanguage ?? 'he',
            data: {
              name: t.examinerName ?? '',
              thesisTitle: t.thesisTitle ?? '',
              studentName: t.studentName ?? '',
              link: `${baseUrl}/examiner-access?token=${encodeURIComponent(doc.id)}`,
            },
          });
        } catch (emailErr) {
          console.error(`sendExaminerDeadlineReminders: reminder email failed for token ${doc.id}:`, emailErr);
        }
        await doc.ref.update({ warningReminderSentAt: admin.firestore.FieldValue.serverTimestamp() });
      } else if (msLeft <= 0 && !t.overdueEscalatedAt) {
        await escalateOverdueExaminerToCoordinators(doc.id, t);
        await doc.ref.update({ overdueEscalatedAt: admin.firestore.FieldValue.serverTimestamp() });
        await promoteNextExaminer(doc.id, 'system', 'system').catch((err) =>
          console.error(`sendExaminerDeadlineReminders: auto-promote failed for overdue token ${doc.id}:`, err));
      }
    } catch (err) {
      console.error(`sendExaminerDeadlineReminders: failed for token ${doc.id}:`, err);
    }
  }
}
