// src/services/projectEnrollment.ts
//
// Canonical "add a student to a project" write. There are three surfaces
// that enroll a student (supervisor approving an application, admin manual
// assignment, faculty-admin manual assignment) — they must all leave the
// project/student/milestone documents in the same shape, or dashboards that
// read enrolledStudentIds/hasActiveProject/milestones drift out of sync
// depending on which flow was used.

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';

const MILESTONE_TEMPLATES = [
  { type: 'research_proposal', nameHe: 'הצעת מחקר',    nameEn: 'Research Proposal', days: 30  },
  { type: 'progress_report',   nameHe: 'דו"ח התקדמות', nameEn: 'Progress Report',   days: 120 },
  { type: 'final_report',      nameHe: 'דו"ח מסכם',    nameEn: 'Final Report',      days: 210 },
  { type: 'defense',           nameHe: 'בחינת הגנה',   nameEn: 'Defense Exam',      days: 240 },
];

export async function enrollStudentInProject(
  projectId: string,
  studentId: string,
  supervisorId: string,
  facultyId: string,
): Promise<void> {
  const studentRef = db.collection('users').doc(studentId);
  const projectRef = db.collection('projects').doc(projectId);

  // Wrapped in a transaction: the three callers (supervisor approving an
  // application, admin manual assignment, faculty-admin manual assignment)
  // each pre-check hasActiveProject with a plain read before calling this —
  // two concurrent approvals for the same student could both pass that
  // stale check and both reach here. The re-check + all writes below happen
  // atomically, so only the first to commit wins; the loser gets a thrown
  // error instead of silently double-enrolling the student.
  await db.runTransaction(async (transaction) => {
    const studentSnap = await transaction.get(studentRef);
    if (studentSnap.data()?.hasActiveProject) {
      throw new Error('Student already has an active project.');
    }

    // 'in_progress', not 'active' — an enrolled project must drop out of the
    // open-for-applications browse query/rule (both key on status=='active').
    transaction.update(projectRef, {
      status:             'in_progress',
      enrolledStudentIds: admin.firestore.FieldValue.arrayUnion(studentId),
      studentId:          admin.firestore.FieldValue.delete(),
      studentIds:         admin.firestore.FieldValue.delete(),
      updatedAt:          admin.firestore.FieldValue.serverTimestamp(),
    });

    transaction.update(studentRef, {
      hasActiveProject: true,
      activeProjectId:  projectId,
      supervisorId,
    });

    const baseDate = new Date();
    for (const t of MILESTONE_TEMPLATES) {
      const dueDate = new Date();
      dueDate.setDate(baseDate.getDate() + t.days);
      const milestoneRef = db.collection('milestones').doc();
      transaction.set(milestoneRef, {
        projectId, studentIds: [studentId], supervisorId, facultyId,
        type: t.type, nameHe: t.nameHe, nameEn: t.nameEn,
        status:          'pending',
        dueDate:         admin.firestore.Timestamp.fromDate(dueDate),
        createdAt:       admin.firestore.FieldValue.serverTimestamp(),
        finalGrade:      null, fileUrls: [],
        supervisorScore: null,
        // Examiner/defense-panel fields only ever make sense on the 'defense'
        // milestone — writing them onto research_proposal/progress_report/
        // final_report just leaves permanent dead clutter on those docs.
        ...(t.type === 'defense'
          ? { examinerIds: [], examiner1Score: null, examiner2Score: null }
          : {}),
      });
    }
  });
}
