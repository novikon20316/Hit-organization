// src/services/stuckMilestones.ts
//
// Stuck-milestone escalation. A system_admin sets, per milestone of each
// faculty's project/thesis workflow, how many days it may sit on any ONE
// link of its chain (student, supervisor, examiners, coordinator, a chain
// stage...). The clock restarts every time the milestone moves to the next
// link. Once a link exceeds its limit, the administrative coordinator,
// program head and grad school head in scope are alerted (in-app + email +
// push + SMS + WhatsApp), then reminded once a day until it moves on, and
// can nudge whoever it's waiting on from the /stuck-milestones page.
//
// Limits live in their own collection, keyed by faculty + process type +
// major — NOT on the workflow template itself, so changing a number doesn't
// need a new template version/approval, and survives template updates.
//
// Link detection is sweep-based (hourly, see index.ts): milestone status
// changes are written from dozens of controllers, most of which never stamp
// a "stage entered" time, so instead the sweep records the link it last saw
// (stuckWatch.linkKey) and restarts the clock when that changes. Accuracy is
// therefore within one sweep interval.
//
// The student's own link (milestone still 'pending') counts from the DUE
// DATE, not from enrollment — otherwise every milestone due months away
// would be "stuck" a few days after the student starts.

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { resolveStaffForScope, type ResourceScope } from './scopeAuthorization.js';
import { notifyUser } from './notify.js';
import { isChainDriven } from './milestoneRouting.js';
import { deriveProcessType, type ChainRole, type ChainStage, type ProcessType, type WorkflowMilestoneSpec } from './workflowTemplates.js';
import { stageEnteredAt, totalPausedMs, type ClockPause, type MilestoneDoc } from './studentProgress.js';
import { resolveEnrolledTrack } from './studentTrack.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const LIMITS_COLLECTION = 'stuckMilestoneLimits';
const DONE_STATUSES = ['coordinator_approved', 'completed'];
const MAX_LIMIT_DAYS = 365;

/** The roles alerted about a stuck milestone in their scope. */
export const STUCK_ALERT_ROLES: ChainRole[] = ['administrative_secretary', 'program_head', 'grad_school_head'];

export type WaitingRole = ChainRole | 'student';

export const WAITING_ROLE_LABEL: Record<WaitingRole, { he: string; en: string }> = {
  student: { he: 'הסטודנט/ית', en: 'the student' },
  supervisor: { he: 'המנחה', en: 'the supervisor' },
  examiner: { he: 'הבוחנים', en: 'the examiners' },
  coordinator: { he: 'הרכז/ת', en: 'the coordinator' },
  faculty_admin: { he: 'מנהל/ת הפקולטה', en: 'the faculty admin' },
  administrative_secretary: { he: 'הרכזת המנהלית', en: 'the administrative coordinator' },
  grad_school_head: { he: 'ראש בית הספר לתארים מתקדמים', en: 'the head of the graduate school' },
  school_head: { he: 'ראש בית הספר', en: 'the school head' },
  program_head: { he: 'ראש התוכנית', en: 'the program head' },
  division_head: { he: 'ראש המחלקה', en: 'the division head' },
  dean: { he: 'הדיקן', en: 'the dean' },
  committee: { he: 'הוועדה', en: 'the committee' },
};

// ─── Limits config ────────────────────────────────────────────────────────────

export function limitsDocId(facultyId: string, processType: ProcessType, major: string | null): string {
  return `${facultyId}__${processType}__${major ?? '_any'}`;
}

export interface StuckLimitsDoc {
  facultyId: string;
  processType: ProcessType;
  major: string | null;
  /** milestone type → max days on one link. Missing = never flagged. */
  limits: Record<string, number>;
}

/** Validates + normalizes a limits map from the client: positive whole
 *  days up to a year; null/''/0 removes that milestone's limit. */
export function sanitizeLimits(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [type, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof type !== 'string' || !/^[\w-]{1,80}$/.test(type)) return null;
    if (value === null || value === '' || value === 0) continue;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT_DAYS) return null;
    out[type] = n;
  }
  return out;
}

export async function saveStuckLimits(doc: StuckLimitsDoc, updatedBy: string): Promise<Record<string, number>> {
  const ref = db.collection(LIMITS_COLLECTION).doc(limitsDocId(doc.facultyId, doc.processType, doc.major));
  const before = (await ref.get()).data()?.limits ?? {};
  await ref.set({
    facultyId: doc.facultyId,
    processType: doc.processType,
    major: doc.major,
    limits: doc.limits,
    updatedBy,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return before;
}

/** Every approved workflow template (one per faculty+process type+major),
 *  with its milestones and whatever limits are set for it — the system_admin
 *  config screen's whole data set. */
export async function listTemplatesWithLimits(): Promise<Array<StuckLimitsDoc & {
  templateId: string;
  milestones: Array<{ type: string; nameHe: string; nameEn: string; order: number }>;
}>> {
  const [templatesSnap, limitsSnap] = await Promise.all([
    db.collection('workflowTemplates').where('status', '==', 'approved').get(),
    db.collection(LIMITS_COLLECTION).get(),
  ]);
  const limitsById = new Map(limitsSnap.docs.map((d) => [d.id, (d.data().limits ?? {}) as Record<string, number>]));
  return templatesSnap.docs
    .map((d) => {
      const t = d.data();
      const major: string | null = t.major ?? null;
      const milestones = ((t.milestones ?? []) as WorkflowMilestoneSpec[])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((m) => ({ type: m.type, nameHe: m.nameHe, nameEn: m.nameEn, order: m.order }));
      return {
        templateId: d.id,
        facultyId: t.facultyId as string,
        processType: t.processType as ProcessType,
        major,
        milestones,
        limits: limitsById.get(limitsDocId(t.facultyId, t.processType, major)) ?? {},
      };
    })
    .filter((t) => t.milestones.length > 0)
    .sort((a, b) => `${a.facultyId}${a.processType}${a.major ?? ''}`.localeCompare(`${b.facultyId}${b.processType}${b.major ?? ''}`));
}

// ─── Waiting-on resolution ────────────────────────────────────────────────────

/** Which link the milestone is sitting on right now. Chain position and
 *  committee are part of the key, so a chain moving supervisor → coordinator
 *  (same coarse status) still restarts the clock. */
export function linkKeyOf(m: FirebaseFirestore.DocumentData): string {
  const stage = isChainDriven(m) ? String(m.currentStageIndex ?? 0) : '';
  return `${m.status}|${stage}|${m.currentCommitteeId ?? ''}`;
}

/** Who the milestone is waiting on — the role (for display) and the actual
 *  people (for the "send reminder" action). */
export async function resolveWaitingOn(
  m: FirebaseFirestore.DocumentData,
  project: FirebaseFirestore.DocumentData,
  resource: ResourceScope,
): Promise<{ role: WaitingRole; uids: string[] }> {
  const studentIds: string[] = m.studentIds ?? [];
  const supervisorIds = [m.supervisorId ?? project.supervisorId, m.secondarySupervisorId ?? project.secondarySupervisorId].filter(Boolean) as string[];
  const examinerIds: string[] = m.examinerIds ?? [];
  const staff = async (role: ChainRole) => resolveStaffForScope(role, resource, supervisorIds, examinerIds, false);

  if (m.status === 'pending' || m.status === 'rejected') return { role: 'student', uids: studentIds };

  if (isChainDriven(m) && (m.status === 'submitted' || m.status === 'supervisor_graded')) {
    const stage: ChainStage | undefined = (m.routing ?? [])[m.currentStageIndex ?? 0];
    if (stage) {
      if (stage.role === 'committee') {
        if (!m.currentCommitteeId) return { role: 'committee', uids: [] };
        const c = await db.collection('committees').doc(m.currentCommitteeId).get();
        return { role: 'committee', uids: (c.data()?.memberIds ?? []) as string[] };
      }
      return { role: stage.role, uids: await staff(stage.role) };
    }
  }

  switch (m.status) {
    case 'submitted':
      return { role: 'supervisor', uids: supervisorIds };
    case 'examiners_assigned':
    case 'examiner_graded':
    case 'awaiting_defense_date':
    case 'defense_date_set':
    case 'scheduled': {
      // Examiners who already scored aren't the ones holding it up.
      const scored = new Set(Object.keys(m.examinerScores ?? {}));
      const remaining = examinerIds.filter((id) => !scored.has(id));
      return { role: 'examiner', uids: remaining.length > 0 ? remaining : examinerIds };
    }
    default:
      // supervisor_graded / graded / both_examiners_graded / date_conflict —
      // the coordinator's approval or decision.
      return { role: 'coordinator', uids: await staff('coordinator') };
  }
}

// ─── Sweep ────────────────────────────────────────────────────────────────────

export interface StuckWatch {
  linkKey: string;
  since: FirebaseFirestore.Timestamp;
  isStuck: boolean;
  limitDays: number | null;
  waitingRole: WaitingRole | null;
  waitingUids: string[];
  recipientUids: string[];
  lastAlertDate: string | null;
  firstAlertAt: FirebaseFirestore.Timestamp | null;
  lastManualReminderAt?: FirebaseFirestore.Timestamp | null;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function tsMs(v: any): number | null {
  const d = v?.toDate?.();
  return d instanceof Date && !isNaN(d.getTime()) ? d.getTime() : null;
}

export function daysOnLink(since: FirebaseFirestore.Timestamp, pauses: ClockPause[], now = Date.now()): number {
  const sinceMs = since.toDate().getTime();
  if (sinceMs >= now) return 0;
  return Math.floor((now - sinceMs - totalPausedMs(pauses, sinceMs, now)) / DAY_MS);
}

function pausesOf(project: FirebaseFirestore.DocumentData): ClockPause[] {
  return [...(project.clockPauseHistory ?? []), ...(project.activeClockPause ? [project.activeClockPause] : [])];
}

async function sendStuckAlert(
  recipientId: string,
  m: FirebaseFirestore.DocumentData,
  milestoneId: string,
  info: { studentName: string; projectTitleHe: string; projectTitleEn: string; days: number; limit: number; waitingRole: WaitingRole; repeat: boolean },
): Promise<void> {
  const who = WAITING_ROLE_LABEL[info.waitingRole];
  const nameHe = m.nameHe ?? m.type;
  const nameEn = m.nameEn ?? m.type;
  const bodyHe = `אבן הדרך "${nameHe}" של ${info.studentName} ("${info.projectTitleHe}") ממתינה ל${who.he} כבר ${info.days} ימים (המגבלה: ${info.limit}). נדרשת התערבות כדי שלא תיתקע.`;
  const bodyEn = `Milestone "${nameEn}" for ${info.studentName} ("${info.projectTitleEn}") has been waiting on ${who.en} for ${info.days} days (limit: ${info.limit}). Please step in so it doesn't stay stuck.`;
  await notifyUser({
    recipientId,
    type: 'milestone_stuck',
    titleHe: info.repeat ? '⏳ תזכורת: אבן דרך עדיין תקועה' : '⏳ אבן דרך תקועה',
    titleEn: info.repeat ? '⏳ Reminder: milestone still stuck' : '⏳ Milestone stuck',
    bodyHe,
    bodyEn,
    relatedProjectId: m.projectId ?? null,
    relatedMilestoneId: milestoneId,
    targetScreen: 'stuck_milestones',
    emailData: { message: { he: bodyHe, en: bodyEn } },
    channels: { inApp: true, email: true, push: true, sms: true, whatsapp: true },
  });
}

/** Hourly (see index.ts). Tracks every active milestone that has a limit,
 *  flags/unflags it as stuck, and alerts the scoped roles once when it
 *  crosses its limit and then once per calendar day while it stays stuck. */
export async function sweepStuckMilestones(): Promise<void> {
  const limitsSnap = await db.collection(LIMITS_COLLECTION).get();
  const limitsById = new Map(limitsSnap.docs.map((d) => [d.id, (d.data().limits ?? {}) as Record<string, number>]));

  const [activeSnap, flaggedSnap] = await Promise.all([
    limitsById.size > 0
      ? db.collection('milestones').where('status', 'not-in', DONE_STATUSES).get()
      : Promise.resolve(null),
    // Previously flagged ones too — a milestone that just finished (or whose
    // limit was removed) drops out of the query above but must be unflagged.
    db.collection('milestones').where('stuckWatch.isStuck', '==', true).get(),
  ]);
  const docs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  activeSnap?.docs.forEach((d) => docs.set(d.id, d));
  flaggedSnap.docs.forEach((d) => docs.set(d.id, d));
  if (docs.size === 0) return;

  const projectCache = new Map<string, FirebaseFirestore.DocumentData | null>();
  const userCache = new Map<string, FirebaseFirestore.DocumentData | null>();
  const getDoc = async (cache: Map<string, FirebaseFirestore.DocumentData | null>, col: string, id: string) => {
    if (!cache.has(id)) {
      const snap = await db.collection(col).doc(id).get();
      cache.set(id, snap.exists ? snap.data()! : null);
    }
    return cache.get(id)!;
  };
  const recipientCache = new Map<string, string[]>();

  const now = Date.now();
  const today = todayKey();

  for (const doc of docs.values()) {
    try {
      const m = doc.data();
      const watch = m.stuckWatch as StuckWatch | undefined;
      const clear = async () => {
        if (watch?.isStuck) await doc.ref.update({ 'stuckWatch.isStuck': false });
      };

      if (DONE_STATUSES.includes(m.status) || !m.projectId) { await clear(); continue; }
      const project = await getDoc(projectCache, 'projects', m.projectId);
      if (!project || project.isArchived) { await clear(); continue; }
      const studentId: string | undefined = (m.studentIds ?? [])[0];
      const student = studentId ? await getDoc(userCache, 'users', studentId) : null;
      if (!student) { await clear(); continue; }

      const track = resolveEnrolledTrack(project, student);
      const degreeType = student.degreeType ?? project.degreeType;
      const processType = deriveProcessType(degreeType, track);
      const facultyId: string = project.facultyId ?? m.facultyId;
      const major: string | null = project.major ?? student.major ?? null;
      const limits = limitsById.get(limitsDocId(facultyId, processType, major)) ?? limitsById.get(limitsDocId(facultyId, processType, null));
      const limit = limits?.[m.type] ?? null;
      if (!limit) { await clear(); continue; }

      const linkKey = linkKeyOf(m);
      // Student link: counts from the due date. Defense booked: counts from
      // the defense date. Otherwise: from when this sweep first saw the
      // link (or, the very first time a milestone is watched, the best
      // "entered this stage" timestamp the doc has).
      let since: FirebaseFirestore.Timestamp | null;
      if (m.status === 'pending') {
        since = m.dueDate ?? null;
      } else if (watch && watch.linkKey === linkKey) {
        since = watch.since;
      } else if (!watch) {
        since = stageEnteredAt(m as MilestoneDoc) ?? admin.firestore.Timestamp.fromMillis(now);
      } else {
        since = admin.firestore.Timestamp.fromMillis(now);
      }
      if ((m.status === 'defense_date_set' || m.status === 'scheduled') && since) {
        const defenseMs = tsMs(m.defenseDate);
        if (defenseMs && defenseMs > since.toMillis()) since = admin.firestore.Timestamp.fromMillis(defenseMs);
      }
      if (!since) { await clear(); continue; }

      const linkChanged = !watch || watch.linkKey !== linkKey;
      const pauses = pausesOf(project);
      const days = daysOnLink(since, pauses, now);
      const isStuck = !project.activeClockPause && days > limit;

      if (!isStuck) {
        if (linkChanged || watch?.isStuck || watch?.since?.toMillis() !== since.toMillis()) {
          await doc.ref.set({
            stuckWatch: {
              linkKey, since, isStuck: false, limitDays: limit,
              waitingRole: null, waitingUids: [], recipientUids: [],
              lastAlertDate: null, firstAlertAt: null,
            },
          }, { merge: true });
        }
        continue;
      }

      const resource: ResourceScope = {
        facultyId,
        ...(major ? { major } : {}),
        ...(degreeType ? { degreeLevel: degreeType } : {}),
        processType: track,
      };
      const waiting = await resolveWaitingOn(m, project, resource);
      const recipientKey = JSON.stringify(resource);
      if (!recipientCache.has(recipientKey)) {
        const lists = await Promise.all(STUCK_ALERT_ROLES.map((role) => resolveStaffForScope(role, resource, [], [], false)));
        recipientCache.set(recipientKey, [...new Set(lists.flat())]);
      }
      const recipients = recipientCache.get(recipientKey)!;

      const alreadyAlertedToday = !linkChanged && watch?.lastAlertDate === today;
      const nextWatch: StuckWatch = {
        linkKey, since, isStuck: true, limitDays: limit,
        waitingRole: waiting.role, waitingUids: waiting.uids, recipientUids: recipients,
        lastAlertDate: alreadyAlertedToday ? today : watch?.lastAlertDate ?? null,
        firstAlertAt: !linkChanged ? watch?.firstAlertAt ?? null : null,
        lastManualReminderAt: !linkChanged ? watch?.lastManualReminderAt ?? null : null,
      };
      if (alreadyAlertedToday) {
        await doc.ref.set({ stuckWatch: nextWatch }, { merge: true });
        continue;
      }

      // Claim today's alert in a transaction first, so two server instances
      // running the same sweep can't both send it.
      const claimed = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        const freshWatch = fresh.data()?.stuckWatch as StuckWatch | undefined;
        if (freshWatch?.linkKey === linkKey && freshWatch.lastAlertDate === today) return false;
        tx.set(doc.ref, {
          stuckWatch: {
            ...nextWatch,
            lastAlertDate: today,
            firstAlertAt: nextWatch.firstAlertAt ?? admin.firestore.Timestamp.fromMillis(now),
          },
        }, { merge: true });
        return true;
      });
      if (!claimed) continue;

      const studentName = student.displayName ?? '';
      const info = {
        studentName,
        projectTitleHe: project.titleHe || project.titleEn || '',
        projectTitleEn: project.titleEn || project.titleHe || '',
        days, limit, waitingRole: waiting.role,
        repeat: !!nextWatch.firstAlertAt,
      };
      const results = await Promise.allSettled(recipients.map((uid) => sendStuckAlert(uid, m, doc.id, info)));
      results.forEach((r, i) => {
        if (r.status === 'rejected') console.error(`sweepStuckMilestones: alert to ${recipients[i]} failed for ${doc.id}:`, r.reason);
      });
    } catch (err) {
      console.error(`sweepStuckMilestones: failed for milestone ${doc.id}:`, err);
    }
  }
}

// ─── Manual reminder ──────────────────────────────────────────────────────────

/** Nudges whoever a stuck milestone is waiting on. Returns how many people
 *  were reminded. */
export async function remindWaitingParty(milestoneId: string, senderName: string): Promise<number> {
  const ref = db.collection('milestones').doc(milestoneId);
  const snap = await ref.get();
  const m = snap.data();
  const watch = m?.stuckWatch as StuckWatch | undefined;
  if (!m || !watch?.isStuck) return 0;

  const projectSnap = await db.collection('projects').doc(m.projectId).get();
  const project = projectSnap.data() ?? {};
  const days = daysOnLink(watch.since, pausesOf(project));
  const nameHe = m.nameHe ?? m.type;
  const nameEn = m.nameEn ?? m.type;
  const titleHe = project.titleHe || project.titleEn || '';
  const titleEn = project.titleEn || project.titleHe || '';
  const bodyHe = `אבן הדרך "${nameHe}" ("${titleHe}") ממתינה לטיפולך כבר ${days} ימים. ${senderName ? `${senderName} מבקש/ת` : 'נא'} לטפל בה בהקדם.`;
  const bodyEn = `Milestone "${nameEn}" ("${titleEn}") has been waiting on you for ${days} days. ${senderName ? `${senderName} is asking you` : 'Please'} to handle it as soon as possible.`;

  const uids = [...new Set(watch.waitingUids ?? [])];
  const isStudent = watch.waitingRole === 'student';
  await Promise.allSettled(uids.map((uid) => notifyUser({
    recipientId: uid,
    type: 'milestone_stuck_reminder',
    titleHe: '🔔 תזכורת: אבן דרך ממתינה לטיפולך',
    titleEn: '🔔 Reminder: a milestone is waiting on you',
    bodyHe,
    bodyEn,
    relatedProjectId: m.projectId ?? null,
    relatedMilestoneId: milestoneId,
    ...(isStudent ? {} : { taskKind: 'milestone_action' as const, taskRoleCandidates: [watch.waitingRole as string] }),
    emailData: { message: { he: bodyHe, en: bodyEn } },
    channels: { inApp: true, email: true, push: true, sms: true, whatsapp: true },
  })));
  await ref.update({ 'stuckWatch.lastManualReminderAt': admin.firestore.FieldValue.serverTimestamp() });
  return uids.length;
}
