// src/services/defenseScheduleChangeSignal.ts
//
// Lets every screen showing defense scheduling — assigned examiners/panel,
// date matching rounds/conflicts, the agreed date, defense status, logistics
// (time, building, room, Zoom/in-person/hybrid) — refresh live, without a page
// reload: student dashboard + milestones, examiner dashboard, supervisor
// project card, coordinator / administrative-coordinator screens (web +
// mobile). Staff and examiner views come from scoped REST endpoints, so the
// server watches the relevant docs and bumps config/defenseScheduleChangeSignal,
// which clients listen to (see web/mobile hooks/useDefenseScheduleLiveRefresh.ts).
// Mechanism shared with usersChangeSignal — see changeSignal.ts.
//
// Watched rather than bumped from each write path: defense fields are written
// from defenseScheduling.ts, coordinatorController (assignExaminers,
// assignDefense), gradSchoolHeadController, examinerEscalation, examiner
// access flows and test scripts — a watcher catches all of them.
//
// Only scheduling fields count — an examiner's evaluation-form autosave on
// the same milestone doc must not make every open dashboard re-fetch.

import { db } from '../config/firebase.js';
import { pickFields, readChangeSignal, startChangeSignalWatcher } from './changeSignal.js';
import type { Request, Response } from 'express';

const LOGISTICS_FIELDS = [
  'defenseMode',
  'defenseTime',
  'defenseRoom',
  'defenseBuilding',
  'onlineDefenseLink',
  'zoomMeeting',
  'defenseDurationMinutes',
  'defenseSchedulingState',
] as const;

// The `type: 'defense'` milestone — where panel, date matching, agreed date
// (dueDate, once isDefenseDateConfirmed(status)) and logistics all live.
const DEFENSE_MILESTONE_FIELDS = [
  ...LOGISTICS_FIELDS,
  'status',
  'examinerIds',
  'examinerNames',
  'defensePanel',
  'dateMatching',
  'dueDate',
  'defenseDate',
] as const;

// Other examiner-graded milestones (e.g. a poster session) — assignExaminers
// propagates the panel onto them.
const EXAMINER_MILESTONE_FIELDS = ['examinerIds', 'examinerNames'] as const;

// The project doc carries its own copy of the panel and logistics.
const PROJECT_FIELDS = [...LOGISTICS_FIELDS, 'examinerIds', 'examinerNames', 'defenseExaminerIds', 'defenseDate'] as const;

const SIGNAL_DOC_ID = 'defenseScheduleChangeSignal';

export function startDefenseScheduleChangeWatcher(): void {
  startChangeSignalWatcher(SIGNAL_DOC_ID, [
    {
      name: 'defense milestones',
      query: db.collection('milestones').where('type', '==', 'defense'),
      relevant: pickFields(DEFENSE_MILESTONE_FIELDS),
    },
    {
      name: 'examiner milestones',
      query: db.collection('milestones').where('requiresExaminers', '==', true),
      relevant: pickFields(EXAMINER_MILESTONE_FIELDS),
    },
    { name: 'projects', query: db.collection('projects'), relevant: pickFields(PROJECT_FIELDS) },
  ]);
}

// GET /api/change-signals/defense-schedule — unauthenticated by design: the
// external examiner pages (examiner-access, defense-access) have no Firebase
// account, and their own token endpoints sit behind a 20-per-15-min limiter,
// far too tight to poll. This returns only a timestamp — no data, nothing
// scoped — so the pages poll it and re-fetch their real endpoint only when it
// moves (see web/mobile hooks/usePolledDefenseScheduleRefresh.ts).
export async function getDefenseScheduleSignal(_req: Request, res: Response) {
  try {
    res.json({ changedAt: await readChangeSignal(SIGNAL_DOC_ID) });
  } catch (err) {
    console.error('getDefenseScheduleSignal failed:', err);
    res.status(500).json({ message: 'Failed to read signal.' });
  }
}
