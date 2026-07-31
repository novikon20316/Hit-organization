// src/services/defenseScheduling.ts
//
// Defense date matching: each examiner on a project's defense panel (any
// size — the panel size is configured per faculty/degree via workflow
// templates, see workflowTemplates.ts's examinerCount) submits a list of
// candidate dates (within a window anchored to when the panel was assigned);
// once every panel member has submitted, a date common to ALL of them is
// locked in automatically — if none exists the coordinator resolves the
// conflict (see resolveKeepExaminers / resolveReplaceExaminer, which replaces
// exactly one member while keeping everyone else's already-submitted dates).
// All cross-examiner state lives on the project's `type: 'defense'` milestone
// doc under `dateMatching` — see the plan doc for the full shape.

import admin from 'firebase-admin';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { db } from '../config/firebase.js';
import { sendNotificationEmail } from './emailService.js';
import { resolveStaffForScope } from './scopeAuthorization.js';
import {
  assignExaminersAndNotify,
  createDefenseAccessGrant,
  type ExaminerAssignmentInput,
} from './examinerAccess.js';

dayjs.extend(utc);
dayjs.extend(timezone);

// Institution is in Israel — all window/expiry boundaries are computed in
// this fixed zone rather than server-local time, which may not be Israel.
const TZ = 'Asia/Jerusalem';

export type ExaminerKey = string; // `${'internal'|'external'}:${ref}`

export interface DefensePanelMember {
  type: 'internal' | 'external';
  ref: string; // uid for internal, examinerTokens doc id for external
  displayName: string;
  email?: string; // required for external
}

export function examinerKeyOf(member: Pick<DefensePanelMember, 'type' | 'ref'>): ExaminerKey {
  return `${member.type}:${member.ref}`;
}

// ── Israeli work-week (Sun–Thu) ──────────────────────────────────────────────
function isSunThu(d: dayjs.Dayjs): boolean {
  const dow = d.day(); // 0=Sun .. 6=Sat
  return dow >= 0 && dow <= 4;
}

// ── Date window: this month + the following month, anchored once ──────────
export function computeDefenseWindow(anchor: Date): { windowStart: Date; windowEnd: Date } {
  const a = dayjs.tz(anchor, TZ);
  return {
    windowStart: a.startOf('month').toDate(),
    windowEnd: a.add(1, 'month').endOf('month').toDate(),
  };
}

// ── Common-date matching: earliest date shared by EVERY list wins ──────────
export function computeCommonDateAcross(dateLists: string[][]): string | null {
  if (dateLists.length === 0) return null;
  let common = new Set(dateLists[0]);
  for (const dates of dateLists.slice(1)) {
    if (common.size === 0) break;
    const next = new Set(dates);
    common = new Set([...common].filter((d) => next.has(d)));
  }
  return [...common].sort()[0] ?? null;
}

// ── Auto-pick fallback: nearest Sun-Thu to day 32, clamped to [+25,+40] ─────
export function autoPickDate(decisionDate: Date): string {
  const lower = dayjs.tz(decisionDate, TZ).add(25, 'day').startOf('day');
  const upper = dayjs.tz(decisionDate, TZ).add(40, 'day').startOf('day');
  const target = dayjs.tz(decisionDate, TZ).add(32, 'day').startOf('day');

  const offsets: number[] = [0];
  for (let i = 1; i <= 8; i++) offsets.push(i, -i);

  for (const offset of offsets) {
    const candidate = target.add(offset, 'day');
    if (candidate.isBefore(lower) || candidate.isAfter(upper)) continue;
    if (isSunThu(candidate)) return candidate.format('YYYY-MM-DD');
  }
  // [25,40] always spans more than 2 full weeks, so a Sun-Thu day always
  // exists in range — this is a defensive fallback only.
  return lower.format('YYYY-MM-DD');
}

export function validateCandidateDates(dates: string[], windowStart: Date, windowEnd: Date): string | null {
  if (!Array.isArray(dates) || dates.length === 0) return 'At least one candidate date is required.';
  const start = dayjs.tz(windowStart, TZ).startOf('day');
  const end = dayjs.tz(windowEnd, TZ).endOf('day');
  // The window's lower bound is "1st of the assignment month," but the panel
  // can be assigned any day within that month — days before today are inside
  // the nominal window yet already unusable for scheduling a future defense.
  const today = dayjs().tz(TZ).startOf('day');
  const lowerBound = start.isAfter(today) ? start : today;
  for (const raw of dates) {
    const parsed = dayjs.tz(raw, TZ);
    if (!parsed.isValid() || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `Invalid date: ${raw}`;
    if (parsed.isBefore(lowerBound) || parsed.isAfter(end)) return `Date ${raw} is outside the allowed window.`;
    if (!isSunThu(parsed)) return `Date ${raw} falls on a weekend (Fri/Sat) — defenses run Sun-Thu only.`;
  }
  return null;
}

export async function findDefenseMilestoneRef(projectId: string) {
  const snap = await db.collection('milestones')
    .where('projectId', '==', projectId)
    .where('type', '==', 'defense')
    .limit(1)
    .get();
  if (snap.empty) throw new Error('No defense milestone found for this project.');
  return snap.docs[0]!.ref;
}

/**
 * Builds the defense panel from an assignExaminersAndNotify() result and
 * opens the defense date-matching window for it. Only fires once at least 1
 * examiner was assigned — a re-assignment that ends up with 0 (shouldn't
 * normally happen) doesn't start scheduling since there's no one to gather
 * dates from.
 *
 * Shared between coordinatorController.ts's single-tier approval path and
 * gradSchoolHeadController.ts's msc_thesis second-tier approval (P1 #5) —
 * moved here from coordinatorController.ts so both can call it without a
 * cross-controller import.
 */
export async function openDefenseSchedulingIfPanelReady(
  projectId: string,
  result: { internalUids: string[]; externalNotified: Array<{ name: string; email: string; token: string }> },
): Promise<void> {
  const internalMembers: DefensePanelMember[] = await Promise.all(
    result.internalUids.map(async (uid) => {
      const userSnap = await db.collection('users').doc(uid).get();
      return { type: 'internal' as const, ref: uid, displayName: userSnap.data()?.displayName ?? 'Unknown' };
    }),
  );
  const externalMembers: DefensePanelMember[] = result.externalNotified.map((e) => ({
    type: 'external' as const, ref: e.token, displayName: e.name, email: e.email,
  }));
  const panel = [...internalMembers, ...externalMembers];

  if (panel.length === 0) return;

  try {
    await initDefenseScheduling(projectId, panel);
  } catch (error) {
    // Most commonly: no 'defense' milestone exists yet for this project.
    // Don't fail the examiner-assignment request over it — log for follow-up.
    console.error(`Failed to open defense scheduling for project ${projectId}:`, error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Opening the window — called once a defense panel of any size is confirmed.
// ─────────────────────────────────────────────────────────────────────────────

export async function initDefenseScheduling(projectId: string, panel: DefensePanelMember[]): Promise<void> {
  if (panel.length === 0) throw new Error('A defense panel must have at least 1 examiner.');

  const milestoneRef = await findDefenseMilestoneRef(projectId);
  const { windowStart, windowEnd } = computeDefenseWindow(new Date());
  const panelKeys = panel.map(examinerKeyOf);
  // Internal examiners' dashboards are found via an `examinerIds
  // array-contains uid` query — set it now (not only once assignDefense
  // runs at the very end) so they see this milestone from round 0 onward.
  const internalIds = panel.filter((m) => m.type === 'internal').map((m) => m.ref);

  await milestoneRef.update({
    defensePanel: panel,
    examinerIds: internalIds,
    dateMatching: {
      windowStart: admin.firestore.Timestamp.fromDate(windowStart),
      windowEnd: admin.firestore.Timestamp.fromDate(windowEnd),
      windowAnchoredAt: admin.firestore.FieldValue.serverTimestamp(),
      currentRound: 0,
      finalDate: null,
      submissions: {},
      rounds: [{
        roundIndex: 0,
        panel: panelKeys,
        startedAt: admin.firestore.Timestamp.now(),
        outcome: 'pending',
        matchedDate: null,
        resolvedBy: null,
      }],
    },
    status: 'awaiting_defense_date',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection('projects').doc(projectId).update({
    defensePanel: panel,
    defenseSchedulingState: 'awaiting_defense_date',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await notifyPanelToSubmitDates(panel, projectId);
}

async function notifyPanelToSubmitDates(panel: DefensePanelMember[], projectId: string): Promise<void> {
  for (const member of panel) {
    if (member.type === 'internal') {
      await db.collection('notifications').add({
        recipientId: member.ref,
        type: 'defense_dates_requested',
        priority: 'normal',
        titleHe: 'נדרשת בחירת תאריכים להגנה',
        titleEn: 'Defense date selection required',
        bodyHe: 'שובצת כבוחן/ת בהגנה. יש לבחור תאריכים אפשריים באפליקציה.',
        bodyEn: 'You have been assigned as a defense examiner. Please submit your available dates in the app.',
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        relatedProjectId: projectId,
        relatedMilestoneId: null,
        chatId: null,
      });
    } else if (member.email) {
      await sendNotificationEmail({
        toEmail: member.email,
        type: 'defense_dates_requested',
        lang: 'he',
        data: { name: member.displayName },
      }).catch((err) => console.error(`Failed to email defense-dates request to ${member.email}:`, err));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidate date submission — shared by both the internal (verifyToken) and
// external (token-authenticated) endpoints, so the two-writer race is only
// ever resolved in one place.
// ─────────────────────────────────────────────────────────────────────────────

export interface SubmitDatesResult {
  matched: boolean;
  matchedDate?: string;
  conflict?: boolean;
  /** Examiner keys in the current round who haven't submitted their
   *  candidate dates yet — empty/absent once everyone has (that's exactly
   *  when matched/conflict gets decided). Replaces the old singular
   *  waitingOnOtherExaminer, which assumed exactly one other panelist. */
  waitingOn?: ExaminerKey[];
}

export async function submitCandidateDatesAndResolve(
  milestoneId: string,
  examinerKey: ExaminerKey,
  candidateDates: string[],
): Promise<SubmitDatesResult> {
  const milestoneRef = db.collection('milestones').doc(milestoneId);

  const txResult = await db.runTransaction(async (transaction) => {
    // ── reads ──
    const milestoneSnap = await transaction.get(milestoneRef);
    if (!milestoneSnap.exists) throw new Error('Milestone not found.');
    const milestone = milestoneSnap.data()!;
    if (milestone.type !== 'defense') throw new Error('Milestone is not a defense milestone.');

    const dateMatching = milestone.dateMatching;
    if (!dateMatching) throw new Error('Defense date matching has not been opened for this milestone yet.');

    const currentRound: number = dateMatching.currentRound;
    const rounds: any[] = [...dateMatching.rounds];
    const round = rounds[currentRound];
    if (!round || !round.panel.includes(examinerKey)) {
      throw new Error('You are not an active examiner for the current scheduling round.');
    }
    if (round.outcome !== 'pending') {
      throw new Error('This scheduling round has already been resolved.');
    }

    const validationError = validateCandidateDates(
      candidateDates,
      dateMatching.windowStart.toDate(),
      dateMatching.windowEnd.toDate(),
    );
    if (validationError) throw new Error(validationError);

    const projectRef = db.collection('projects').doc(milestone.projectId);
    const projectSnap = await transaction.get(projectRef);
    if (!projectSnap.exists) throw new Error('Project not found.');
    const project = projectSnap.data()!;

    const studentIds: string[] = project.enrolledStudentIds ?? [];
    const studentSnaps = await Promise.all(
      studentIds.map((sid) => transaction.get(db.collection('users').doc(sid))),
    );
    const studentNames = studentSnaps.map((s) => s.data()?.displayName).filter(Boolean).join(', ');

    // ── compute ──
    const submissions = { ...(dateMatching.submissions ?? {}) };
    submissions[examinerKey] = {
      examinerKey,
      type: examinerKey.split(':')[0],
      ref: examinerKey.slice(examinerKey.indexOf(':') + 1),
      roundIndex: currentRound,
      candidateDates,
      submittedAt: admin.firestore.Timestamp.now(),
    };

    const waitingOn: ExaminerKey[] = round.panel.filter((k: string) => {
      const s = submissions[k];
      return !(s && s.roundIndex === currentRound);
    });

    // ── writes ──
    if (waitingOn.length > 0) {
      transaction.update(milestoneRef, { 'dateMatching.submissions': submissions });
      return { matched: false, waitingOn } as SubmitDatesResult;
    }

    const matchedDate = computeCommonDateAcross(round.panel.map((k: string) => submissions[k].candidateDates));
    const panel: DefensePanelMember[] = milestone.defensePanel ?? [];

    if (matchedDate) {
      rounds[currentRound] = { ...round, outcome: 'matched', matchedDate };
      finalizeMatchedDate(transaction, {
        milestoneRef, projectRef, milestone, submissions, rounds,
        matchedDate, studentIds, studentNames, supervisorId: project.supervisorId ?? null,
        facultyId: project.facultyId, panel, resolutionNote: null,
      });
    } else {
      rounds[currentRound] = { ...round, outcome: 'no_common_date' };
      await flagConflict(transaction, {
        milestoneRef, projectRef, submissions, rounds,
        projectId: milestone.projectId, studentNames, facultyId: project.facultyId,
      });
    }

    return {
      matched: !!matchedDate,
      matchedDate: matchedDate ?? undefined,
      conflict: !matchedDate,
    } as SubmitDatesResult;
  });

  // Post-commit side effects that can't run inside a Firestore transaction
  // (sending email, creating a second doc keyed off the first's result).
  if (txResult.matched && txResult.matchedDate) {
    await afterDateFinalized(milestoneId, txResult.matchedDate);
  }

  return txResult;
}

// ── Shared finalize/conflict helpers (used by submit + coordinator resolution) ──

function finalizeMatchedDate(
  transaction: FirebaseFirestore.Transaction,
  params: {
    milestoneRef: FirebaseFirestore.DocumentReference;
    projectRef: FirebaseFirestore.DocumentReference;
    milestone: FirebaseFirestore.DocumentData;
    submissions: Record<string, any>;
    rounds: any[];
    matchedDate: string;
    studentIds: string[];
    studentNames: string;
    supervisorId: string | null;
    facultyId: string;
    panel: DefensePanelMember[];
    resolutionNote: string | null;
  },
): void {
  const { milestoneRef, projectRef, submissions, rounds, matchedDate, studentIds, supervisorId, panel, resolutionNote } = params;
  const matchedTimestamp = admin.firestore.Timestamp.fromDate(dayjs.tz(matchedDate, TZ).startOf('day').toDate());

  transaction.update(milestoneRef, {
    'dateMatching.submissions': submissions,
    'dateMatching.rounds': rounds,
    'dateMatching.finalDate': matchedTimestamp,
    dueDate: matchedTimestamp,
    status: 'defense_date_set',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  transaction.update(projectRef, {
    defenseDate: matchedTimestamp,
    defenseSchedulingState: 'defense_date_set',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const dateLabel = dayjs.tz(matchedDate, TZ).format('DD/MM/YYYY');
  const noteHe = resolutionNote ? ` ${resolutionNote}` : '';

  studentIds.forEach((studentId) => {
    transaction.set(db.collection('notifications').doc(), {
      recipientId: studentId,
      type: 'defense_date_matched',
      priority: 'normal',
      titleHe: 'נקבע מועד הגנה',
      titleEn: 'Defense date set',
      bodyHe: `ההגנה שלך נקבעה לתאריך ${dateLabel}.${noteHe} השעה, החדר והבניין ייקבעו בהמשך על ידי הרכז.`,
      bodyEn: `Your defense is set for ${dateLabel}.${resolutionNote ? ' ' + resolutionNote : ''} Time, room, and building will follow from the coordinator.`,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      relatedProjectId: projectRef.id,
      relatedMilestoneId: milestoneRef.id,
      chatId: null,
    });
  });

  if (supervisorId) {
    transaction.set(db.collection('notifications').doc(), {
      recipientId: supervisorId,
      type: 'defense_date_matched',
      priority: 'normal',
      titleHe: 'נקבע מועד הגנה לפרויקט',
      titleEn: 'Defense date set for project',
      bodyHe: `נקבע מועד הגנה בתאריך ${dateLabel}.`,
      bodyEn: `A defense date has been set for ${dateLabel}.`,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      relatedProjectId: projectRef.id,
      relatedMilestoneId: milestoneRef.id,
      chatId: null,
    });
  }

  panel.filter((m) => m.type === 'internal').forEach((member) => {
    transaction.set(db.collection('notifications').doc(), {
      recipientId: member.ref,
      type: 'defense_date_matched',
      priority: 'normal',
      titleHe: 'נקבע מועד הגנה',
      titleEn: 'Defense date set',
      bodyHe: `ההגנה נקבעה לתאריך ${dateLabel}.`,
      bodyEn: `The defense is set for ${dateLabel}.`,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      relatedProjectId: projectRef.id,
      relatedMilestoneId: milestoneRef.id,
      chatId: null,
    });
  });
}

async function flagConflict(
  transaction: FirebaseFirestore.Transaction,
  params: {
    milestoneRef: FirebaseFirestore.DocumentReference;
    projectRef: FirebaseFirestore.DocumentReference;
    submissions: Record<string, any>;
    rounds: any[];
    projectId: string;
    studentNames: string;
    facultyId: string;
  },
): Promise<void> {
  const { milestoneRef, projectRef, submissions, rounds, projectId, studentNames, facultyId } = params;

  transaction.update(milestoneRef, {
    'dateMatching.submissions': submissions,
    'dateMatching.rounds': rounds,
    status: 'date_conflict',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  transaction.update(projectRef, {
    defenseSchedulingState: 'date_conflict',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Resolving "the coordinator(s) of this faculty" is a plain read, done
  // ahead of the write below — coordinator rosters don't change fast enough
  // for this to need transactional consistency.
  const coordinatorUids = await resolveStaffForScope('coordinator', { facultyId }, []);

  coordinatorUids.forEach((uid) => {
    transaction.set(db.collection('notifications').doc(), {
      recipientId: uid,
      type: 'defense_date_conflict_urgent',
      priority: 'urgent',
      titleHe: '⚠️ דחוף: לא נמצא מועד הגנה משותף',
      titleEn: '⚠️ Urgent: No common defense date found',
      bodyHe: `הבוחנים לא מצאו תאריך משותף עבור הגנת ${studentNames || 'הסטודנט/ים'}. נדרשת החלטתך.`,
      bodyEn: `Examiners could not find a common defense date for ${studentNames || "the student's"} defense. Your decision is required.`,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      relatedProjectId: projectId,
      relatedMilestoneId: milestoneRef.id,
      chatId: null,
    });
  });
}

async function afterDateFinalized(milestoneId: string, matchedDate: string): Promise<void> {
  const milestoneSnap = await db.collection('milestones').doc(milestoneId).get();
  const milestone = milestoneSnap.data();
  if (!milestone) return;
  const panel: DefensePanelMember[] = milestone.defensePanel ?? [];
  const externalMembers = panel.filter((m) => m.type === 'external' && m.email);

  for (const member of externalMembers) {
    await sendNotificationEmail({
      toEmail: member.email!,
      type: 'defense_date_matched',
      lang: 'he',
      data: { name: member.displayName, date: dayjs.tz(matchedDate, TZ).format('DD/MM/YYYY') },
    }).catch((err) => console.error(`Failed to email defense date to ${member.email}:`, err));

    await createDefenseAccessGrant({
      originExaminerTokenCode: member.ref,
      projectId: milestone.projectId,
      milestoneId,
      examinerName: member.displayName,
      examinerEmail: member.email!,
      examinerLanguage: 'he',
      defenseDateISO: matchedDate,
    }).catch((err) => console.error(`Failed to create defense-day access grant for ${member.email}:`, err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Coordinator conflict resolution.
// ─────────────────────────────────────────────────────────────────────────────

export async function resolveKeepExaminers(milestoneId: string, coordinatorId: string): Promise<{ date: string }> {
  const milestoneRef = db.collection('milestones').doc(milestoneId);
  const decisionDate = new Date();
  const pickedDate = autoPickDate(decisionDate);

  await db.runTransaction(async (transaction) => {
    const milestoneSnap = await transaction.get(milestoneRef);
    if (!milestoneSnap.exists) throw new Error('Milestone not found.');
    const milestone = milestoneSnap.data()!;
    if (milestone.status !== 'date_conflict') throw new Error('Milestone is not in a date-conflict state.');

    const projectRef = db.collection('projects').doc(milestone.projectId);
    const projectSnap = await transaction.get(projectRef);
    if (!projectSnap.exists) throw new Error('Project not found.');
    const project = projectSnap.data()!;

    const studentIds: string[] = project.enrolledStudentIds ?? [];
    const studentSnaps = await Promise.all(
      studentIds.map((sid) => transaction.get(db.collection('users').doc(sid))),
    );
    const studentNames = studentSnaps.map((s) => s.data()?.displayName).filter(Boolean).join(', ');

    const dateMatching = milestone.dateMatching;
    const currentRound: number = dateMatching.currentRound;
    const rounds: any[] = [...dateMatching.rounds];
    rounds[currentRound] = {
      ...rounds[currentRound],
      resolvedBy: { coordinatorId, decidedAt: admin.firestore.Timestamp.now(), action: 'keep_examiners', autoPickedDate: pickedDate },
    };

    finalizeMatchedDate(transaction, {
      milestoneRef, projectRef, milestone,
      submissions: dateMatching.submissions ?? {}, rounds,
      matchedDate: pickedDate, studentIds, studentNames,
      supervisorId: project.supervisorId ?? null, facultyId: project.facultyId,
      panel: milestone.defensePanel ?? [],
      resolutionNote: 'לא נמצא תאריך משותף, לכן הרכז/ת קבע/ה מועד זה.',
    });
  });

  await afterDateFinalized(milestoneId, pickedDate);
  return { date: pickedDate };
}

export async function resolveReplaceExaminer(
  milestoneId: string,
  coordinatorId: string,
  replacedExaminerKey: ExaminerKey,
  newExaminer: ExaminerAssignmentInput,
): Promise<void> {
  const milestoneRef = db.collection('milestones').doc(milestoneId);
  const milestoneSnap = await milestoneRef.get();
  if (!milestoneSnap.exists) throw new Error('Milestone not found.');
  const milestone = milestoneSnap.data()!;
  if (milestone.status !== 'date_conflict') throw new Error('Milestone is not in a date-conflict state.');

  const dateMatching = milestone.dateMatching;
  const currentRound: number = dateMatching.currentRound;
  const rounds: any[] = [...dateMatching.rounds];
  const round = rounds[currentRound];
  if (!round.panel.includes(replacedExaminerKey)) {
    throw new Error('The examiner to replace is not part of the current round.');
  }
  // Every OTHER panel member — not just a single one — carries their
  // already-submitted dates forward into the new round unchanged; only the
  // replaced slot needs fresh submission.
  const retainedKeys: string[] = round.panel.filter((k: string) => k !== replacedExaminerKey);

  const projectSnap = await db.collection('projects').doc(milestone.projectId).get();
  const project = projectSnap.data()!;
  const studentSnaps = await Promise.all(
    (project.enrolledStudentIds ?? []).map((sid: string) => db.collection('users').doc(sid).get()),
  );
  const studentName = studentSnaps.map((s) => s.data()?.displayName).filter(Boolean).join(', ');

  // Reuse the existing onboarding logic — unchanged for internal vs. external.
  const onboardResult = await assignExaminersAndNotify([newExaminer], {
    projectId: milestone.projectId,
    milestoneId,
    thesisTitle: project.titleHe || project.titleEn || '',
    studentName,
    lang: 'he',
  });
  const newMember: DefensePanelMember = newExaminer.type === 'internal'
    ? { type: 'internal', ref: onboardResult.internalUids[0]!, displayName: '' /* filled below */ }
    : { type: 'external', ref: onboardResult.externalNotified[0]!.token, displayName: onboardResult.externalNotified[0]!.name, email: onboardResult.externalNotified[0]!.email };

  if (newMember.type === 'internal') {
    const userSnap = await db.collection('users').doc(newMember.ref).get();
    newMember.displayName = userSnap.data()?.displayName ?? 'Unknown';
  }

  const retainedMembers = (milestone.defensePanel as DefensePanelMember[]).filter(
    (m) => retainedKeys.includes(examinerKeyOf(m)),
  );
  const newPanel = [...retainedMembers, newMember];
  const newRoundIndex = currentRound + 1;
  const newKey = examinerKeyOf(newMember);

  rounds[currentRound] = {
    ...round,
    resolvedBy: {
      coordinatorId, decidedAt: admin.firestore.Timestamp.now(), action: 'replace_examiner',
      replacedExaminerKey, newExaminerKey: newKey,
    },
  };
  // Same window carried forward on purpose — see plan: recomputing it would
  // make the retained examiners' already-submitted dates incomparable.
  rounds.push({
    roundIndex: newRoundIndex,
    panel: [...retainedKeys, newKey],
    startedAt: admin.firestore.Timestamp.now(),
    outcome: 'pending',
    matchedDate: null,
    resolvedBy: null,
  });

  const submissions = { ...(dateMatching.submissions ?? {}) };
  for (const retainedKey of retainedKeys) {
    const retainedSubmission = (dateMatching.submissions ?? {})[retainedKey];
    if (retainedSubmission) {
      submissions[retainedKey] = { ...retainedSubmission, roundIndex: newRoundIndex };
    }
  }

  await milestoneRef.update({
    defensePanel: newPanel,
    examinerIds: newPanel.filter((m) => m.type === 'internal').map((m) => m.ref),
    'dateMatching.currentRound': newRoundIndex,
    'dateMatching.rounds': rounds,
    'dateMatching.submissions': submissions,
    status: 'awaiting_defense_date',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection('projects').doc(milestone.projectId).update({
    defensePanel: newPanel,
    defenseSchedulingState: 'awaiting_defense_date',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await notifyPanelToSubmitDates([newMember], milestone.projectId);
}
