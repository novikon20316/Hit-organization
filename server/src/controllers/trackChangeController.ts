// src/controllers/trackChangeController.ts
//
// HTTP surface for switching a project's track between thesis and
// non-thesis project — see services/trackChange.ts for the actual
// close-old/spin-up-new logic.

import { Response } from 'express';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { changeProjectTrack, TrackChangeError, type ProjectTrack } from '../services/trackChange.js';
import { L } from '../utils/localize.js';

// Matches CLOCK_PAUSE_ROLES in clockPauseController.ts — this backlog item
// explicitly names coordinator/program-head as the initiators.
const TRACK_CHANGE_ROLES = ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'];

function isValidTrack(value: unknown): value is ProjectTrack {
  return value === 'thesis' || value === 'project';
}

export const changeTrack = async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params;
  const { newTrack, reason } = req.body;

  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized.', 'גישה לא מורשית.') });
  if (!hasAnyRole(req.user, TRACK_CHANGE_ROLES)) {
    return res.status(403).json({ message: L(req, 'Forbidden.', 'הפעולה אסורה.') });
  }
  if (!projectId || typeof projectId !== 'string') return res.status(400).json({ message: L(req, 'Missing projectId.', 'חסר מזהה פרויקט.') });
  if (!isValidTrack(newTrack)) return res.status(400).json({ message: L(req, 'newTrack must be "thesis" or "project".', 'השדה newTrack חייב להיות "thesis" או "project".') });

  try {
    const result = await changeProjectTrack(projectId, newTrack, req.user.uid, req.user.role, reason);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    if (error instanceof TrackChangeError) {
      return res.status(400).json({ message: error.messageEn, messageHe: error.messageHe, messageEn: error.messageEn });
    }
    const message = error instanceof Error ? error.message : L(req, 'Failed to change track.', 'שינוי מסלול הפרויקט נכשל.');
    return res.status(400).json({ message });
  }
};
