// src/services/clockPause.ts
//
// Pause/resume the deadline clock for leave, reserve duty, maternity/paternity,
// or illness (P1 backlog item #7). Stored directly on the project doc:
//   activeClockPause: ClockPause | null   — the current, unresumed pause (if any)
//   clockPauseHistory: ClockPause[]        — completed (resumed) pauses
// computeMilestoneProgress() in studentProgress.ts is the actual consumer —
// it excludes the paused window from daysInStage and freezes isOverdue/isStuck
// while activeClockPause is set.

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { logAuditEvent } from './auditLog.js';
import type { ClockPause, ClockPauseReason } from './studentProgress.js';

const VALID_REASONS: ClockPauseReason[] = ['reserve_duty', 'illness', 'maternity_paternity', 'other'];

export function isValidClockPauseReason(reason: unknown): reason is ClockPauseReason {
  return typeof reason === 'string' && VALID_REASONS.includes(reason as ClockPauseReason);
}

export async function pauseProjectClock(
  projectId: string,
  reason: ClockPauseReason,
  note: string | undefined,
  pausedBy: string,
  pausedByRole: string,
): Promise<ClockPause> {
  const projectRef = db.collection('projects').doc(projectId);
  const snap = await projectRef.get();
  if (!snap.exists) throw new Error('Project not found.');
  const project = snap.data()!;

  if (project.activeClockPause) {
    throw new Error('The deadline clock is already paused for this project.');
  }

  const pause: ClockPause = {
    id: db.collection('_').doc().id,
    reason,
    note: note?.trim() || null,
    pausedBy,
    pausedAt: admin.firestore.Timestamp.now(),
    resumedBy: null,
    resumedAt: null,
  };

  await projectRef.update({ activeClockPause: pause });

  await logAuditEvent({
    userId: pausedBy,
    userRole: pausedByRole,
    action: 'clock_paused',
    entityType: 'project',
    entityId: projectId,
    newValue: { reason, note: pause.note },
  });

  return pause;
}

export async function resumeProjectClock(
  projectId: string,
  resumedBy: string,
  resumedByRole: string,
): Promise<ClockPause> {
  const projectRef = db.collection('projects').doc(projectId);
  const snap = await projectRef.get();
  if (!snap.exists) throw new Error('Project not found.');
  const project = snap.data()!;

  const active: ClockPause | undefined = project.activeClockPause ?? undefined;
  if (!active) throw new Error('The deadline clock is not currently paused for this project.');

  const resumed: ClockPause = {
    ...active,
    resumedBy,
    resumedAt: admin.firestore.Timestamp.now(),
  };

  await projectRef.update({
    activeClockPause: null,
    clockPauseHistory: admin.firestore.FieldValue.arrayUnion(resumed),
  });

  await logAuditEvent({
    userId: resumedBy,
    userRole: resumedByRole,
    action: 'clock_resumed',
    entityType: 'project',
    entityId: projectId,
    oldValue: { reason: active.reason, pausedAt: active.pausedAt },
  });

  return resumed;
}

export interface ClockPauseState {
  activeClockPause: ClockPause | null;
  clockPauseHistory: ClockPause[];
}

export async function getProjectClockPauseState(projectId: string): Promise<ClockPauseState> {
  const snap = await db.collection('projects').doc(projectId).get();
  if (!snap.exists) throw new Error('Project not found.');
  const project = snap.data()!;
  return {
    activeClockPause: project.activeClockPause ?? null,
    clockPauseHistory: project.clockPauseHistory ?? [],
  };
}
