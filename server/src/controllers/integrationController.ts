// src/controllers/integrationController.ts
//
// Read-only bridge for administrative-coordinator (a separate HIT system,
// separate Firebase project) to pull a student's project milestones/grades
// into its own coordinator dashboard. Gated by middleware/integrationAuth.ts's
// shared secret, not verifyToken - the caller is a server, not one of this
// app's own users. Returns only what a coordinator dashboard needs to
// display, not the full milestone/grade documents.
//
// Mirrors gradeHistoryController.ts's grades-by-milestone grouping, scoped by
// student instead of by project.

import { Request, Response } from 'express';
import { db } from '../config/firebase.js';

function serializeTimestamp(value: any): string | null {
  return value?.toDate?.().toISOString?.() ?? null;
}

/**
 * GET /api/integrations/student-progress/:idNumber
 * :idNumber is the student's Israeli ID (ת"ז) - stored here as
 * users/{uid}.studentId (see supervisorController.ts's "Teudat zehut,
 * captured at signup" comment), the same value administrative-coordinator
 * keeps as Student.idNumber.
 */
export const getStudentProgressByIdNumber = async (req: Request, res: Response) => {
  const idNumber = String(req.params.idNumber ?? '');
  if (!idNumber || !/^\d{9}$/.test(idNumber)) {
    return res.status(400).json({ message: 'Invalid idNumber - expected a 9-digit ת"ז.' });
  }

  try {
    const usersSnap = await db.collection('users').where('studentId', '==', idNumber).limit(1).get();
    const userDoc = usersSnap.docs[0];
    if (!userDoc) {
      return res.status(200).json({ found: false });
    }
    const uid = userDoc.id;

    const projectsSnap = await db.collection('projects')
      .where('enrolledStudentIds', 'array-contains', uid)
      .get();

    // A student should only have one active project at a time in this
    // system; if more than one matches, the most recently created one is
    // the current one.
    const projectDoc = projectsSnap.docs
      .slice()
      .sort((a, b) => (b.data().createdAt?.toMillis?.() ?? 0) - (a.data().createdAt?.toMillis?.() ?? 0))[0];
    if (!projectDoc) {
      return res.status(200).json({ found: true, uid, project: null, milestones: [] });
    }
    const project = projectDoc.data();

    let supervisorName: string | null = project.supervisorName || null;
    if (!supervisorName && project.supervisorId) {
      const supDoc = await db.collection('users').doc(project.supervisorId).get();
      supervisorName = supDoc.data()?.displayName || null;
    }

    const [milestonesSnap, gradesSnap] = await Promise.all([
      db.collection('milestones').where('projectId', '==', projectDoc.id).get(),
      db.collection('grades').where('projectId', '==', projectDoc.id).get(),
    ]);

    const gradesByMilestone = new Map<string, any[]>();
    for (const doc of gradesSnap.docs) {
      const g = doc.data();
      const list = gradesByMilestone.get(g.milestoneId) ?? [];
      list.push({
        graderRole: g.graderRole ?? null,
        total: g.grading?.total ?? null,
        comments: g.comments ?? '',
        isFinalized: g.isFinalized ?? false,
        submittedAt: serializeTimestamp(g.submittedAt),
      });
      gradesByMilestone.set(g.milestoneId, list);
    }

    const milestones = milestonesSnap.docs.map((doc) => {
      const m = doc.data();
      return {
        id: doc.id,
        type: m.type ?? null,
        status: m.status ?? null,
        dueDate: serializeTimestamp(m.dueDate),
        finalGrade: m.finalGrade ?? null,
        gradeApproved: m.gradeApproved ?? false,
        gradeApprovedAt: serializeTimestamp(m.gradeApprovedAt),
        grades: (gradesByMilestone.get(doc.id) ?? [])
          .sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '')),
      };
    });

    return res.status(200).json({
      found: true,
      uid,
      project: {
        titleHe: project.titleHe ?? '',
        titleEn: project.titleEn ?? '',
        supervisorName,
      },
      milestones,
    });
  } catch (error) {
    console.error('getStudentProgressByIdNumber error:', error);
    return res.status(500).json({ message: 'Failed to load student progress.' });
  }
};
