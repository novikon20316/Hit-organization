// src/controllers/examinerEscalationController.ts
//
// Coordinator-facing manual triggers for P1 backlog item #6 — see
// services/examinerEscalation.ts for the actual logic (also invoked
// automatically by services/notificationScheduler.ts's scheduled sweep).

import { Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { promoteNextExaminer, sendManualExaminerReminder } from '../services/examinerEscalation.js';

const COORDINATOR_ROLES = ['coordinator', 'faculty_admin', 'administrative_secretary', 'grad_school_head', 'system_admin'];

function hasAccess(req: AuthenticatedRequest): boolean {
  return !!req.user?.role && COORDINATOR_ROLES.includes(req.user.role);
}

/**
 * GET /api/coordinator/examiner-escalations
 * External-examiner tokens needing coordinator attention: declined or
 * overdue and not yet resolved. Scoped to the caller's own facultyId unless
 * it's 'all' (grad_school_head/system_admin).
 */
export const getExaminerEscalations = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
  if (!hasAccess(req)) return res.status(403).json({ message: 'Forbidden.' });

  try {
    const snap = await db.collection('examinerTokens')
      .where('status', 'in', ['pending', 'accepted', 'declined'])
      .get();

    const now = Date.now();
    const rows = await Promise.all(snap.docs.map(async (doc) => {
      const t = doc.data();
      const expiresAt = t.expiresAt ? new Date(t.expiresAt).getTime() : null;
      const isOverdue = t.status !== 'declined' && expiresAt !== null && expiresAt < now;
      if (t.status !== 'declined' && !isOverdue) return null;

      let facultyId = '';
      if (t.projectId) {
        const projectSnap = await db.collection('projects').doc(t.projectId).get();
        facultyId = projectSnap.data()?.facultyId ?? '';
      }
      if (req.user!.facultyId !== 'all' && facultyId !== req.user!.facultyId) return null;

      return {
        tokenId: doc.id,
        examinerName: t.examinerName ?? '',
        studentName: t.studentName ?? '',
        thesisTitle: t.thesisTitle ?? '',
        status: t.status,
        isOverdue,
        projectId: t.projectId ?? null,
        facultyId,
      };
    }));

    return res.status(200).json({ escalations: rows.filter(Boolean) });
  } catch (error: any) {
    console.error('getExaminerEscalations error:', error);
    return res.status(500).json({ message: 'Failed to load examiner escalations.' });
  }
};

export const remindExaminer = async (req: AuthenticatedRequest, res: Response) => {
  const { tokenId } = req.params;
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
  if (!hasAccess(req)) return res.status(403).json({ message: 'Forbidden.' });
  if (!tokenId || typeof tokenId !== 'string') return res.status(400).json({ message: 'Missing tokenId.' });

  try {
    await sendManualExaminerReminder(tokenId, req.user.uid, req.user.role);
    return res.status(200).json({ success: true, message: 'Reminder sent.' });
  } catch (error: any) {
    return res.status(400).json({ message: error.message || 'Failed to send reminder.' });
  }
};

export const promoteNext = async (req: AuthenticatedRequest, res: Response) => {
  const { tokenId } = req.params;
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
  if (!hasAccess(req)) return res.status(403).json({ message: 'Forbidden.' });
  if (!tokenId || typeof tokenId !== 'string') return res.status(400).json({ message: 'Missing tokenId.' });

  try {
    const result = await promoteNextExaminer(tokenId, req.user.uid, req.user.role);
    return res.status(200).json({
      success: true,
      promoted: result.promoted,
      message: result.promoted
        ? `${result.promoted.displayName} appointed as replacement examiner.`
        : 'No available internal examiner was found — manual assignment is needed.',
    });
  } catch (error: any) {
    return res.status(400).json({ message: error.message || 'Failed to promote the next examiner.' });
  }
};
