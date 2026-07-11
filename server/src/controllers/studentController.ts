import admin from 'firebase-admin'
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../config/firebase.js';

// Mirrors the taxonomy used elsewhere this session (firestore.rules'
// isStaffRole, projectController.ts's STAFF_ROLES) — kept in sync.
const STAFF_ROLES = [
  'supervisor', 'secondary_supervisor', 'coordinator', 'project_coordinator',
  'program_head', 'internal_examiner', 'faculty_admin', 'grad_school_head', 'system_admin',
];

export const getStudentProject = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const requester = req.user;
    if (!requester) return res.status(401).json({ message: 'Unauthorized.' });
    if (typeof id !== 'string' || !id) {
        return res.status(400).json({ message: 'Invalid or missing projectId' });
    }
    const projectDoc = await db.collection('projects').doc(id).get();

    if (!projectDoc.exists) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const data = projectDoc.data();
    const isOwnProject =
      data?.supervisorId === requester.uid ||
      (data?.enrolledStudentIds ?? []).includes(requester.uid);
    if (!isOwnProject && !STAFF_ROLES.includes(requester.role)) {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    return res.status(200).json({
      id: projectDoc.id,
      ...data,
      // Parse Firestore Timestamp to ISO string if needed by JSON client
      semesterStart: data?.semesterStart ? data.semesterStart.toDate().toISOString() : null,
    });
  } catch (error: any) {
    console.error('Error fetching student project:', error);
    return res.status(500).json({ error: error.message });
  }
};

