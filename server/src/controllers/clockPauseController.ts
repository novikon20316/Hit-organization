// src/controllers/clockPauseController.ts
//
// HTTP surface for pausing/resuming a project's deadline clock (leave,
// reserve duty, maternity/paternity, illness) — see services/clockPause.ts
// for the actual read/write logic.

import { Response } from 'express';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { pauseProjectClock, resumeProjectClock, getProjectClockPauseState, isValidClockPauseReason } from '../services/clockPause.js';
import type { ClockPause } from '../services/studentProgress.js';

function serializePause(p: ClockPause) {
  return {
    ...p,
    pausedAt: p.pausedAt?.toDate?.().toISOString() ?? null,
    resumedAt: p.resumedAt?.toDate?.().toISOString() ?? null,
  };
}

// Mirrors the roles allowed to override milestone deadlines elsewhere
// (UPDATE_MILESTONE_ROLES in milestoneController.ts) plus program_head, who
// this backlog item explicitly names alongside coordinator.
const CLOCK_PAUSE_ROLES = ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'];

function hasClockPauseAccess(req: AuthenticatedRequest): boolean {
  return hasAnyRole(req.user, CLOCK_PAUSE_ROLES);
}

export const getClockPauseState = async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params;
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
  if (!hasClockPauseAccess(req)) return res.status(403).json({ message: 'Forbidden.' });
  if (!projectId || typeof projectId !== 'string') return res.status(400).json({ message: 'Missing projectId.' });

  try {
    const state = await getProjectClockPauseState(projectId);
    return res.status(200).json({
      activeClockPause: state.activeClockPause ? serializePause(state.activeClockPause) : null,
      clockPauseHistory: state.clockPauseHistory.map(serializePause),
    });
  } catch (error: any) {
    return res.status(404).json({ message: error.message || 'Failed to load clock-pause state.' });
  }
};

export const pauseClock = async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params;
  const { reason, note } = req.body;
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
  if (!hasClockPauseAccess(req)) return res.status(403).json({ message: 'Forbidden.' });
  if (!projectId || typeof projectId !== 'string') return res.status(400).json({ message: 'Missing projectId.' });
  if (!isValidClockPauseReason(reason)) {
    return res.status(400).json({ message: 'reason must be one of reserve_duty, illness, maternity_paternity, other.' });
  }

  try {
    const pause = await pauseProjectClock(projectId, reason, note, req.user.uid, req.user.role);
    return res.status(200).json({ success: true, pause: serializePause(pause) });
  } catch (error: any) {
    return res.status(400).json({ message: error.message || 'Failed to pause the deadline clock.' });
  }
};

export const resumeClock = async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params;
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
  if (!hasClockPauseAccess(req)) return res.status(403).json({ message: 'Forbidden.' });
  if (!projectId || typeof projectId !== 'string') return res.status(400).json({ message: 'Missing projectId.' });

  try {
    const pause = await resumeProjectClock(projectId, req.user.uid, req.user.role);
    return res.status(200).json({ success: true, pause: serializePause(pause) });
  } catch (error: any) {
    return res.status(400).json({ message: error.message || 'Failed to resume the deadline clock.' });
  }
};
