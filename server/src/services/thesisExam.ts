// src/services/thesisExam.ts
//
// Computer Science M.Sc. thesis "בחינה" milestone (WorkflowMilestoneSpec.
// thesisExamFlow). The student submits nothing here — the milestone opens by
// itself once the previous one ("אישור תיזה") is approved, then:
//
//   exam_nomination          the supervisor nominates 2 examiners (each an
//                            existing staff member or an outside examiner)
//   exam_nomination_review   the grad school head approves → onboarding, or
//                            rejects (with a reason) → back to the supervisor
//   exam_availability        examiners are onboarded (outside ones get an
//                            emailed access code + the approved thesis file).
//                            The student(s), supervisor(s), committee members
//                            and examiners each pick 5 dates within 14 days of
//                            the round opening, with the hours they're free.
//                            When the last one submits, every date ALL of them
//                            picked is intersected by hours; each overlap of at
//                            least MIN_EXAM_MINUTES is a candidate slot,
//                            earliest first. None → exam_date_coordinator.
//   exam_date_coordinator    no common time (or the heads rejected every one):
//                            the administrative coordinator sets the date and
//                            hours herself, seeing everyone's picks
//   exam_date_review         the program head approves the proposed slot
//   exam_date_final_review   then the grad school head. A rejection at either
//                            moves to the next common slot (back to the program
//                            head); when none is left — or the rejected time was
//                            the coordinator's — back to the coordinator.
//   exam_scheduled           the exam takes place; from its start time the
//                            examiners fill the faculty's "טופס מבחן תיזה"
//                            (CS_THESIS_EXAM_FORM below)
//   exam_committee_review    every examiner submitted — the committee reviews
//                            the forms. WHAT THE COMMITTEE DOES WITH EACH
//                            ANSWER IS NOT DEFINED YET (the faculty will say);
//                            the flow stops here for now.
//
// STORAGE: the working state (nominations with outside examiners' emails,
// every participant's availability, the candidate slots, rejections) lives in
// `thesisExams/{milestoneId}` — server-only (no firestore.rules clause, so
// every client is denied). The milestone doc only mirrors what the student
// may see: `status`, `examSchedule` once both heads approved, and the panel
// panel (examinerIds for internal examiners, examinerNames). The examiners'
// forms live in `thesisExamForms` (server-only too).
//
// HTTP: controllers/thesisExamController.ts (staff + students) and the
// external-examiner token endpoints in examinerAccessController.ts.

import admin from 'firebase-admin';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { db } from '../config/firebase.js';
import { notifyUser } from './notify.js';
import { sendNotificationEmail } from './emailService.js';
import { resolveProjectScope, resolveStaffForScope, type ResourceScope } from './scopeAuthorization.js';
import { createExternalExaminerAccess } from './examinerAccess.js';
import { resolveCommitteeForMilestone } from '../controllers/committeeController.js';
import { resolveMilestoneOrder } from './workflowTemplates.js';
import { WEBSITE_URL } from '../config/links.js';
import { signEvaluation, type EvaluationSignature } from './evaluationSignature.js';
import { facultyName } from './studentProgress.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Jerusalem';
export const THESIS_EXAMS = 'thesisExams';

export const EXAM_NOMINATION = 'exam_nomination';
export const EXAM_NOMINATION_REVIEW = 'exam_nomination_review';
export const EXAM_AVAILABILITY = 'exam_availability';
export const EXAM_DATE_COORDINATOR = 'exam_date_coordinator';
export const EXAM_DATE_REVIEW = 'exam_date_review';
export const EXAM_DATE_FINAL_REVIEW = 'exam_date_final_review';
export const EXAM_SCHEDULED = 'exam_scheduled';
export const EXAM_COMMITTEE_REVIEW = 'exam_committee_review';

export const THESIS_EXAM_STATUSES = [
  EXAM_NOMINATION, EXAM_NOMINATION_REVIEW, EXAM_AVAILABILITY, EXAM_DATE_COORDINATOR,
  EXAM_DATE_REVIEW, EXAM_DATE_FINAL_REVIEW, EXAM_SCHEDULED, EXAM_COMMITTEE_REVIEW,
] as const;

export function isThesisExamStatus(status: string | null | undefined): boolean {
  return !!status && (THESIS_EXAM_STATUSES as readonly string[]).includes(status);
}

/** How many examiners the supervisor nominates (the faculty's answer). */
export const EXAMINER_COUNT = 2;
/** How many dates each participant picks. */
export const DATES_PER_PARTICIPANT = 5;
/** Days ahead of the round's opening day a date may be picked. */
export const AVAILABILITY_WINDOW_DAYS = 14;
/** PROVISIONAL — shortest common overlap that counts as an exam slot. Not
 *  set by the faculty yet; the user's own example (a 14:00–15:00 overlap)
 *  is exactly this long. */
export const MIN_EXAM_MINUTES = 60;
/** Exam hours: nothing at night (the faculty's "about 22:00–06:00"). Every
 *  pick and the coordinator's time must sit inside [EXAM_DAY_START,
 *  EXAM_DAY_END]. Mirrored in web/mobile AvailabilityPicker. */
export const EXAM_DAY_START = '06:00';
export const EXAM_DAY_END = '22:00';

/** Saturday (Shabbat) is never an exam day. */
export function isShabbat(date: string): boolean {
  return dayjs(date).day() === 6;
}

/** Israel daylight-saving rule (since 2013): summer time starts on the Friday
 *  before the last Sunday of March and ends on the last Sunday of October.
 *  Pure date math on purpose — web and mobile carry the identical function,
 *  so all three agree without depending on a device's time-zone database. */
function isIsraelSummerTime(date: string): boolean {
  const y = Number(date.slice(0, 4));
  const lastSunday = (month: number) => {
    const d = new Date(Date.UTC(y, month + 1, 0)); // last day of the month
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d;
  };
  const start = lastSunday(2);
  start.setUTCDate(start.getUTCDate() - 2);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return date >= iso(start) && date < iso(lastSunday(9));
}

/** Latest end time on a Friday (Shabbat comes in): 15:30 in winter, 16:30
 *  in summer. null on any other day. */
export function fridayLatestEnd(date: string): string | null {
  if (dayjs(date).day() !== 5) return null;
  return isIsraelSummerTime(date) ? '16:30' : '15:30';
}

function assertExamTime(date: string, from: string, to: string): void {
  if (isShabbat(date)) {
    throw new ThesisExamError(`${formatDay(date)} הוא יום שבת — לא ניתן לקבוע בו בחינה.`, `${formatDay(date)} is a Saturday — no exams on Shabbat.`);
  }
  if (minutesOf(to) - minutesOf(from) < MIN_EXAM_MINUTES) {
    throw new ThesisExamError(
      `בתאריך ${formatDay(date)}: יש לבחור טווח של ${MIN_EXAM_MINUTES} דקות לפחות — זה האורך המינימלי של בחינה.`,
      `On ${formatDay(date)}: pick at least ${MIN_EXAM_MINUTES} minutes — the shortest an exam can be.`,
    );
  }
  const fridayEnd = fridayLatestEnd(date);
  if (fridayEnd && to > fridayEnd) {
    throw new ThesisExamError(
      `${formatDay(date)} הוא יום שישי — ניתן לבחור שעות עד ${fridayEnd} בלבד (כניסת שבת).`,
      `${formatDay(date)} is a Friday — hours only until ${fridayEnd} (Shabbat begins).`,
    );
  }
  if (from < EXAM_DAY_START || to > EXAM_DAY_END) {
    throw new ThesisExamError(
      `בתאריך ${formatDay(date)}: ניתן לבחור רק שעות בין ${EXAM_DAY_START} ל-${EXAM_DAY_END}.`,
      `On ${formatDay(date)}: only hours between ${EXAM_DAY_START} and ${EXAM_DAY_END} can be picked.`,
    );
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export type NomineeInput =
  | { type: 'internal'; uid: string }
  | { type: 'external'; name: string; email: string; institution?: string };

export interface Nominee {
  type: 'internal' | 'external';
  uid?: string;
  name: string;
  email?: string;
  institution?: string;
}

export interface Nomination {
  round: number;
  examiners: Nominee[];
  submittedById: string;
  submittedByName: string;
  submittedAt: string;
  decision?: 'approved' | 'rejected';
  decidedById?: string;
  decidedByName?: string;
  decidedAt?: string;
  reason?: string;
}

export type ParticipantRole = 'student' | 'supervisor' | 'committee' | 'examiner';

export interface Participant {
  /** `u:<uid>` for an app user, `x:<access token>` for an outside examiner. */
  key: string;
  uid?: string;
  token?: string;
  email?: string;
  name: string;
  roles: ParticipantRole[];
}

export interface AvailabilityEntry { date: string; from: string; to: string }
export interface ExamSlot { date: string; from: string; to: string }

export interface SlotRejection {
  slot: ExamSlot;
  by: 'program_head' | 'grad_school_head';
  byId: string;
  byName: string;
  reason: string;
  at: string;
}

export interface ThesisExamDoc {
  milestoneId: string;
  projectId: string;
  facultyId: string;
  scope: ResourceScope;
  status: string;
  openedAt: string;
  nomination: Nomination | null;
  nominationHistory: Nomination[];
  examiners: Array<Nominee & { key: string; token?: string; emailSent?: boolean }>;
  participants: Participant[];
  committeeId: string | null;
  committeeMemberIds: string[];
  availabilityRound: number;
  window: { start: string; end: string } | null;
  availability: Record<string, { entries: AvailabilityEntry[]; submittedAt: string }>;
  commonSlots: ExamSlot[];
  slotIndex: number;
  rejectedSlots: SlotRejection[];
  schedule: (ExamSlot & { approvedAt: string }) | null;
  /** Where the slot under review came from: the system's match, or the
   *  administrative coordinator (who then gets it back on a rejection). */
  slotSource?: 'matched' | 'coordinator';
  /** Every time the coordinator set, newest last. */
  coordinatorSlots?: Array<ExamSlot & { note: string; setById: string; setByName: string; setAt: string }>;
  /** Set once the "the exam started — fill the form" reminder went out. */
  opinionReminderSentFor?: string | null;
  updatedAt: string;
}

export class ThesisExamError extends Error {
  constructor(public he: string, public en: string, public status = 400) { super(en); }
}

// ── Pure helpers (time + matching) ───────────────────────────────────────────

export function todayInIsrael(): string {
  return dayjs().tz(TZ).format('YYYY-MM-DD');
}

export function isValidIsoDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dayjs(value).format('YYYY-MM-DD') === value;
}

export function isValidClockTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h! * 60 + m!;
}

function clockOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function slotStartsAt(slot: { date: string; from: string }): dayjs.Dayjs {
  return dayjs.tz(`${slot.date}T${slot.from}`, TZ);
}

export function slotHasStarted(slot: { date: string; from: string }): boolean {
  return !slotStartsAt(slot).isAfter(dayjs());
}

export function formatDay(date: string): string {
  return dayjs(date).format('DD/MM/YYYY');
}

export function formatSlot(slot: ExamSlot): string {
  return `${formatDay(slot.date)} ${slot.from}–${slot.to}`;
}

export function windowFor(openDay: string): { start: string; end: string } {
  return { start: openDay, end: dayjs(openDay).add(AVAILABILITY_WINDOW_DAYS, 'day').format('YYYY-MM-DD') };
}

/** Validates one participant's 5 picks against the round's window. Returns
 *  the normalized entries (sorted by date) or throws. */
export function validateAvailability(raw: unknown, window: { start: string; end: string }): AvailabilityEntry[] {
  if (!Array.isArray(raw) || raw.length !== DATES_PER_PARTICIPANT) {
    throw new ThesisExamError(`יש לבחור בדיוק ${DATES_PER_PARTICIPANT} תאריכים.`, `Pick exactly ${DATES_PER_PARTICIPANT} dates.`);
  }
  const today = todayInIsrael();
  const lower = today > window.start ? today : window.start;
  const seen = new Set<string>();
  const out: AvailabilityEntry[] = [];
  for (const item of raw) {
    const date = (item as { date?: unknown })?.date;
    const from = (item as { from?: unknown })?.from;
    const to = (item as { to?: unknown })?.to;
    if (!isValidIsoDay(date)) throw new ThesisExamError('תאריך לא תקין.', 'Invalid date.');
    if (date < lower || date > window.end) {
      throw new ThesisExamError(
        `כל התאריכים חייבים להיות בין ${formatDay(lower)} ל-${formatDay(window.end)}.`,
        `Every date must be between ${formatDay(lower)} and ${formatDay(window.end)}.`,
      );
    }
    if (seen.has(date)) throw new ThesisExamError('כל תאריך יכול להופיע פעם אחת בלבד.', 'Each date may appear only once.');
    seen.add(date);
    if (!isValidClockTime(from) || !isValidClockTime(to)) throw new ThesisExamError('יש למלא שעת התחלה ושעת סיום.', 'Fill in a start and end time.');
    if (minutesOf(to) <= minutesOf(from)) {
      throw new ThesisExamError(`בתאריך ${formatDay(date)} שעת הסיום חייבת להיות אחרי שעת ההתחלה.`, `On ${formatDay(date)} the end time must be after the start time.`);
    }
    assertExamTime(date, from, to);
    if (date === today && slotHasStarted({ date, from: to })) {
      throw new ThesisExamError('השעות שנבחרו להיום כבר עברו.', "The hours picked for today have already passed.");
    }
    out.push({ date, from, to });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Every slot all participants share, earliest first: for each date every
 *  participant picked, the overlap of their hours, kept when at least
 *  MIN_EXAM_MINUTES long and still in the future. */
export function computeCommonSlots(lists: AvailabilityEntry[][], minMinutes = MIN_EXAM_MINUTES): ExamSlot[] {
  if (lists.length === 0) return [];
  const byDate = lists.map((list) => new Map(list.map((e) => [e.date, e])));
  const slots: ExamSlot[] = [];
  for (const date of byDate[0]!.keys()) {
    if (!byDate.every((m) => m.has(date))) continue;
    const from = Math.max(...byDate.map((m) => minutesOf(m.get(date)!.from)));
    const to = Math.min(...byDate.map((m) => minutesOf(m.get(date)!.to)));
    if (to - from < minMinutes) continue;
    const slot = { date, from: clockOf(from), to: clockOf(to) };
    if (slotHasStarted(slot)) continue;
    slots.push(slot);
  }
  return slots.sort((a, b) => (a.date === b.date ? a.from.localeCompare(b.from) : a.date.localeCompare(b.date)));
}

// ── Loading ──────────────────────────────────────────────────────────────────

function examRef(milestoneId: string) {
  return db.collection(THESIS_EXAMS).doc(milestoneId);
}

export async function loadExam(milestoneId: string): Promise<{ exam: ThesisExamDoc; milestone: FirebaseFirestore.DocumentData } | null> {
  const [examSnap, msSnap] = await Promise.all([examRef(milestoneId).get(), db.collection('milestones').doc(milestoneId).get()]);
  if (!examSnap.exists || !msSnap.exists) return null;
  return { exam: examSnap.data() as ThesisExamDoc, milestone: msSnap.data()! };
}

async function userName(uid: string): Promise<string> {
  const snap = await db.collection('users').doc(uid).get();
  const d = snap.data() ?? {};
  return d.displayName || d.displayNameHe || uid;
}

async function projectOf(projectId: string): Promise<FirebaseFirestore.DocumentData> {
  const snap = await db.collection('projects').doc(projectId).get();
  return snap.data() ?? {};
}

function projectTitle(project: FirebaseFirestore.DocumentData) {
  return { he: project.titleHe || project.titleEn || '', en: project.titleEn || project.titleHe || '' };
}

export async function gradSchoolHeadIds(scope: ResourceScope, forAuth = false): Promise<string[]> {
  return resolveStaffForScope('grad_school_head', scope, [], [], forAuth);
}

export async function programHeadIds(scope: ResourceScope, forAuth = false): Promise<string[]> {
  return resolveStaffForScope('program_head', scope, [], [], forAuth);
}

// ── Notifications ────────────────────────────────────────────────────────────

interface Copy { titleHe: string; titleEn: string; bodyHe: string; bodyEn: string }

async function notifyUsers(uids: string[], exam: Pick<ThesisExamDoc, 'milestoneId' | 'projectId'>, copy: Copy, opts: { pending?: boolean } = {}) {
  await Promise.all([...new Set(uids.filter(Boolean))].map((uid) =>
    notifyUser({
      recipientId: uid,
      type: 'thesis_exam_update',
      inAppType: opts.pending ? 'thesis_exam_action_needed' : 'thesis_exam_update',
      ...copy,
      relatedProjectId: exam.projectId,
      relatedMilestoneId: exam.milestoneId,
      targetScreen: 'thesis_exam',
      emailData: {
        subject: { he: copy.titleHe, en: copy.titleEn },
        message: { he: copy.bodyHe, en: copy.bodyEn },
      },
      channels: { sms: false, whatsapp: false },
    }).catch((err) => console.error(`thesisExam: notify ${uid} failed on ${exam.milestoneId}:`, err))
  ));
}

function externalLink(token: string): string {
  const base = process.env.EXAMINER_ACCESS_BASE_URL || WEBSITE_URL;
  return `${base}/examiner-access?token=${encodeURIComponent(token)}`;
}

async function emailExternal(p: { email: string; name: string; token: string }, copy: Copy): Promise<boolean> {
  try {
    await sendNotificationEmail({
      toEmail: p.email,
      type: 'thesis_exam_update',
      lang: 'he',
      data: {
        name: p.name,
        subject: copy.titleHe,
        message: copy.bodyHe,
        link: externalLink(p.token),
        linkLabel: 'כניסה לעמוד הבוחן',
      },
    });
    return true;
  } catch (err) {
    console.error(`thesisExam: email to outside examiner ${p.email} failed:`, err);
    return false;
  }
}

async function notifyParticipants(exam: ThesisExamDoc, copy: Copy, opts: { pending?: boolean; onlyKeys?: string[] } = {}) {
  const targets = exam.participants.filter((p) => !opts.onlyKeys || opts.onlyKeys.includes(p.key));
  await notifyUsers(targets.filter((p) => p.uid).map((p) => p.uid!), exam, copy, opts);
  await Promise.all(targets.filter((p) => p.token && p.email).map((p) => emailExternal({ email: p.email!, name: p.name, token: p.token! }, copy)));
}

// ── Opening ──────────────────────────────────────────────────────────────────

function isDone(status: string | undefined): boolean {
  return status === 'coordinator_approved' || status === 'completed';
}

/** Opens the exam flow on every thesisExamFlow milestone of the project that
 *  is still 'pending' and whose earlier milestones are all approved. Called
 *  right after any milestone is approved, and by the hourly sweep as a
 *  backstop. Idempotent. */
export async function maybeOpenThesisExamForProject(projectId: string | null | undefined): Promise<void> {
  if (!projectId) return;
  const snap = await db.collection('milestones').where('projectId', '==', projectId).get();
  const docs = snap.docs;
  for (const doc of docs) {
    const m = doc.data();
    if (!m.thesisExamFlow || m.status !== 'pending') continue;
    const order = resolveMilestoneOrder(m as never);
    const earlier = docs.filter((d) => d.id !== doc.id && resolveMilestoneOrder(d.data() as never) < order);
    if (!earlier.every((d) => isDone(d.data().status))) continue;
    await openThesisExam(doc.ref, m);
  }
}

async function openThesisExam(ref: FirebaseFirestore.DocumentReference, m: FirebaseFirestore.DocumentData): Promise<void> {
  const scope = (await resolveProjectScope(m.projectId)) ?? { facultyId: m.facultyId ?? '' };
  const now = new Date().toISOString();
  const doc: ThesisExamDoc = {
    milestoneId: ref.id,
    projectId: m.projectId,
    facultyId: m.facultyId ?? scope.facultyId,
    scope,
    status: EXAM_NOMINATION,
    openedAt: now,
    nomination: null,
    nominationHistory: [],
    examiners: [],
    participants: [],
    committeeId: null,
    committeeMemberIds: [],
    availabilityRound: 0,
    window: null,
    availability: {},
    commonSlots: [],
    slotIndex: 0,
    rejectedSlots: [],
    schedule: null,
    opinionReminderSentFor: null,
    updatedAt: now,
  };
  const opened = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    const existing = await tx.get(examRef(ref.id));
    if (fresh.data()?.status !== 'pending' || existing.exists) return false;
    const routing: unknown[] = fresh.data()?.routing ?? [];
    tx.set(examRef(ref.id), doc);
    tx.update(ref, {
      status: EXAM_NOMINATION,
      // Past the chain's last stage, so the generic approve/reject/grade
      // endpoints all answer "not awaiting that" — like a seminar handoff.
      currentStageIndex: routing.length,
      thesisExamOpenedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (!opened) return;
  const project = await projectOf(m.projectId);
  const title = projectTitle(project);
  const supervisors = [m.supervisorId, m.secondarySupervisorId].filter(Boolean) as string[];
  await notifyUsers(supervisors, doc, {
    titleHe: 'יש למנות בוחנים לבחינת התזה',
    titleEn: 'Nominate the thesis examiners',
    bodyHe: `התזה "${title.he}" אושרה. יש למנות ${EXAMINER_COUNT} בוחנים לבחינה — המינוי יועבר לאישור ראש בית הספר ללימודים מתקדמים.`,
    bodyEn: `The thesis "${title.en}" was approved. Please nominate ${EXAMINER_COUNT} examiners for the exam — the nomination goes to the head of the graduate school for approval.`,
  }, { pending: true });
  await notifyUsers(m.studentIds ?? [], doc, {
    titleHe: 'שלב הבחינה נפתח',
    titleEn: 'The exam stage has started',
    bodyHe: `המנחה ממנה כעת בוחנים לתזה "${title.he}". בהמשך תתבקש/י לבחור תאריכים ושעות שנוחים לך לבחינה.`,
    bodyEn: `Your supervisor is now nominating examiners for "${title.en}". Later you'll be asked to pick dates and hours that suit you for the exam.`,
  });
}

// ── Step 1: nomination ───────────────────────────────────────────────────────

const STAFF_ROLES_FOR_EXAMINER = ['internal_examiner', 'supervisor', 'secondary_supervisor', 'coordinator', 'program_head', 'faculty_admin', 'grad_school_head', 'division_head', 'dean', 'school_head'];

/** Staff the supervisor may nominate as an internal examiner: anyone holding
 *  internal_examiner, plus lecturers of the project's faculty — never the
 *  project's own supervisors or a student. */
export async function internalExaminerCandidates(milestone: FirebaseFirestore.DocumentData): Promise<Array<{ uid: string; name: string; facultyId: string | null }>> {
  const exclude = new Set([milestone.supervisorId, milestone.secondarySupervisorId, ...(milestone.studentIds ?? [])].filter(Boolean));
  const [byRole, byFaculty] = await Promise.all([
    db.collection('users').where('roles', 'array-contains', 'internal_examiner').get(),
    db.collection('users').where('facultyId', '==', milestone.facultyId ?? '').get(),
  ]);
  const out = new Map<string, { uid: string; name: string; facultyId: string | null }>();
  for (const d of [...byRole.docs, ...byFaculty.docs]) {
    const u = d.data();
    const roles: string[] = Array.isArray(u.roles) ? u.roles : [u.role].filter(Boolean);
    if (exclude.has(d.id) || u.isActive === false || roles.includes('student') || u.role === 'student') continue;
    if (!roles.some((r) => STAFF_ROLES_FOR_EXAMINER.includes(r))) continue;
    out.set(d.id, { uid: d.id, name: u.displayName || u.displayNameHe || u.email || d.id, facultyId: u.facultyId ?? null });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitNomination(milestoneId: string, actor: { uid: string; name: string }, raw: unknown): Promise<void> {
  const loaded = await loadExam(milestoneId);
  if (!loaded) throw new ThesisExamError('בחינת התזה לא נמצאה.', 'Thesis exam not found.', 404);
  const { milestone } = loaded;
  if (![milestone.supervisorId, milestone.secondarySupervisorId].includes(actor.uid)) {
    throw new ThesisExamError('רק מנחה הפרויקט רשאי/ת למנות בוחנים.', "Only the project's supervisor may nominate examiners.", 403);
  }
  if (!Array.isArray(raw) || raw.length !== EXAMINER_COUNT) {
    throw new ThesisExamError(`יש למנות בדיוק ${EXAMINER_COUNT} בוחנים.`, `Nominate exactly ${EXAMINER_COUNT} examiners.`);
  }
  const candidates = new Map((await internalExaminerCandidates(milestone)).map((c) => [c.uid, c]));
  const examiners: Nominee[] = [];
  for (const item of raw as NomineeInput[]) {
    if (item?.type === 'internal') {
      const c = typeof item.uid === 'string' ? candidates.get(item.uid) : undefined;
      if (!c) throw new ThesisExamError('אחד הבוחנים הפנימיים אינו זמין למינוי.', 'One of the internal examiners cannot be nominated.');
      examiners.push({ type: 'internal', uid: c.uid, name: c.name });
    } else if (item?.type === 'external') {
      const name = typeof item.name === 'string' ? item.name.trim().slice(0, 120) : '';
      const email = typeof item.email === 'string' ? item.email.trim().toLowerCase().slice(0, 200) : '';
      const institution = typeof item.institution === 'string' ? item.institution.trim().slice(0, 200) : '';
      if (!name) throw new ThesisExamError('יש למלא את שם הבוחן/ת החיצוני/ת.', "Fill in the outside examiner's name.");
      if (!EMAIL_RE.test(email)) throw new ThesisExamError(`כתובת הדוא"ל של ${name} אינה תקינה.`, `${name}'s email address is invalid.`);
      examiners.push({ type: 'external', name, email, ...(institution ? { institution } : {}) });
    } else {
      throw new ThesisExamError('סוג בוחן לא תקין.', 'Invalid examiner type.');
    }
  }
  const identities = examiners.map((e) => (e.type === 'internal' ? `u:${e.uid}` : `e:${e.email}`));
  if (new Set(identities).size !== identities.length) throw new ThesisExamError('לא ניתן למנות את אותו בוחן פעמיים.', 'The same examiner cannot be nominated twice.');

  const now = new Date().toISOString();
  let round = 1;
  await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(examRef(milestoneId))).data() as ThesisExamDoc | undefined;
    if (fresh?.status !== EXAM_NOMINATION) {
      throw new ThesisExamError('הבחינה אינה ממתינה כעת למינוי בוחנים.', 'The exam is not waiting for an examiner nomination.', 409);
    }
    round = fresh.nominationHistory.length + 1;
    const nomination: Nomination = { round, examiners, submittedById: actor.uid, submittedByName: actor.name, submittedAt: now };
    tx.update(examRef(milestoneId), { status: EXAM_NOMINATION_REVIEW, nomination, updatedAt: now });
    tx.update(db.collection('milestones').doc(milestoneId), { status: EXAM_NOMINATION_REVIEW, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });

  const project = await projectOf(milestone.projectId);
  const title = projectTitle(project);
  const names = examiners.map((e) => e.name).join(', ');
  await notifyUsers(await gradSchoolHeadIds(loaded.exam.scope), loaded.exam, {
    titleHe: 'מינוי בוחנים ממתין לאישורך',
    titleEn: 'Examiner nomination awaiting your approval',
    bodyHe: `${actor.name} מינה/תה בוחנים לתזה "${title.he}": ${names}.`,
    bodyEn: `${actor.name} nominated examiners for the thesis "${title.en}": ${names}.`,
  }, { pending: true });
}

/** The approved thesis file(s) — from the latest approved milestone before
 *  this one (the faculty's "אישור תיזה"). */
async function approvedThesisFiles(milestone: FirebaseFirestore.DocumentData): Promise<string[]> {
  const snap = await db.collection('milestones').where('projectId', '==', milestone.projectId).get();
  const order = resolveMilestoneOrder(milestone as never);
  const previous = snap.docs
    .map((d) => d.data())
    .filter((d) => resolveMilestoneOrder(d as never) < order && isDone(d.status) && Array.isArray(d.fileUrls) && d.fileUrls.length > 0)
    .sort((a, b) => resolveMilestoneOrder(b as never) - resolveMilestoneOrder(a as never));
  return (previous[0]?.fileUrls as string[] | undefined) ?? [];
}

export async function decideNomination(
  milestoneId: string,
  actor: { uid: string; name: string },
  decision: 'approve' | 'reject',
  reason: string,
): Promise<{ emailFailed: string[] }> {
  const loaded = await loadExam(milestoneId);
  if (!loaded) throw new ThesisExamError('בחינת התזה לא נמצאה.', 'Thesis exam not found.', 404);
  const { exam, milestone } = loaded;
  if (!(await gradSchoolHeadIds(exam.scope, true)).includes(actor.uid)) {
    throw new ThesisExamError('רק ראש בית הספר ללימודים מתקדמים רשאי/ת לאשר את מינוי הבוחנים.', 'Only the head of the graduate school may decide on the nomination.', 403);
  }
  const trimmed = reason.trim().slice(0, 2000);
  if (decision === 'reject' && !trimmed) throw new ThesisExamError('יש לכתוב את סיבת הדחייה.', 'Write the reason for rejecting.');
  const now = new Date().toISOString();
  const project = await projectOf(milestone.projectId);
  const title = projectTitle(project);
  const supervisors = [milestone.supervisorId, milestone.secondarySupervisorId].filter(Boolean) as string[];

  // Claim the decision first so two heads can't both act on one nomination.
  const nomination = await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(examRef(milestoneId))).data() as ThesisExamDoc | undefined;
    if (fresh?.status !== EXAM_NOMINATION_REVIEW || !fresh.nomination) {
      throw new ThesisExamError('המינוי כבר טופל.', 'This nomination was already decided.', 409);
    }
    const decided: Nomination = { ...fresh.nomination, decision: decision === 'approve' ? 'approved' : 'rejected', decidedById: actor.uid, decidedByName: actor.name, decidedAt: now, ...(trimmed ? { reason: trimmed } : {}) };
    const nextStatus = decision === 'approve' ? EXAM_AVAILABILITY : EXAM_NOMINATION;
    tx.update(examRef(milestoneId), {
      status: nextStatus,
      nomination: decision === 'approve' ? decided : null,
      nominationHistory: admin.firestore.FieldValue.arrayUnion(decided),
      updatedAt: now,
    });
    tx.update(db.collection('milestones').doc(milestoneId), { status: nextStatus, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return decided;
  });

  if (decision === 'reject') {
    await notifyUsers(supervisors, exam, {
      titleHe: 'מינוי הבוחנים נדחה — יש למנות מחדש',
      titleEn: 'Examiner nomination rejected — nominate again',
      bodyHe: `ראש בית הספר ללימודים מתקדמים דחה/תה את מינוי הבוחנים לתזה "${title.he}". הסיבה: ${trimmed}`,
      bodyEn: `The head of the graduate school rejected the examiner nomination for "${title.en}". Reason: ${trimmed}`,
    }, { pending: true });
    return { emailFailed: [] };
  }

  // Approved → onboard the examiners.
  const files = await approvedThesisFiles(milestone);
  const studentNames = (await Promise.all((milestone.studentIds ?? []).map(userName))).join(', ');
  const examiners: ThesisExamDoc['examiners'] = [];
  const emailFailed: string[] = [];
  try {
    for (const e of nomination.examiners) {
      if (e.type === 'internal') {
        examiners.push({ ...e, key: `u:${e.uid}` });
        continue;
      }
      const { token, emailSent } = await createExternalExaminerAccess({
        examinerName: e.name,
        examinerEmail: e.email!,
        examinerInstitution: e.institution ?? '',
        examinerLanguage: 'he',
        milestoneId,
        projectId: milestone.projectId,
        studentName: studentNames,
        thesisTitle: title.he,
        thesisUrl: files[0] ?? '',
        // Nomination → 14-day date picking → two approvals → the exam → the
        // form: well past the default 30 days.
        reviewDays: 120,
      });
      if (!emailSent) emailFailed.push(e.email!);
      examiners.push({ ...e, key: `x:${token}`, token, emailSent });
    }
  } catch (err) {
    console.error(`thesisExam: onboarding failed on ${milestoneId}, reverting to review:`, err);
    const { decision: _d, decidedById: _i, decidedByName: _n, decidedAt: _a, reason: _r, ...undecided } = nomination;
    await examRef(milestoneId).update({
      status: EXAM_NOMINATION_REVIEW,
      nomination: undecided,
      nominationHistory: admin.firestore.FieldValue.arrayRemove(nomination),
      updatedAt: new Date().toISOString(),
    });
    await db.collection('milestones').doc(milestoneId).update({ status: EXAM_NOMINATION_REVIEW });
    throw new ThesisExamError('שליחת הגישה לבוחנים נכשלה — נסו שוב.', 'Sending the examiners their access failed — please try again.', 502);
  }

  const internalIds = examiners.filter((e) => e.type === 'internal').map((e) => e.uid!);
  await db.collection('milestones').doc(milestoneId).update({
    examinerIds: internalIds,
    examinerNames: examiners.map((e) => e.name),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await examRef(milestoneId).update({ examiners, updatedAt: new Date().toISOString() });

  const fileLine = files.length > 0
    ? { he: ` קובץ התזה המאושר: ${files.join(' , ')}`, en: ` The approved thesis file: ${files.join(' , ')}` }
    : { he: '', en: '' };
  await notifyUsers(internalIds, exam, {
    titleHe: 'מונית לבוחן/ת בבחינת תזה',
    titleEn: "You've been appointed as a thesis examiner",
    bodyHe: `מונית לבוחן/ת של התזה "${title.he}" (${studentNames}).${fileLine.he} בקרוב תתבקש/י לבחור תאריכים לבחינה.`,
    bodyEn: `You've been appointed to examine the thesis "${title.en}" (${studentNames}).${fileLine.en} You'll shortly be asked to pick dates for the exam.`,
  });
  await notifyUsers(supervisors, exam, {
    titleHe: 'מינוי הבוחנים אושר',
    titleEn: 'Examiner nomination approved',
    bodyHe: `מינוי הבוחנים לתזה "${title.he}" אושר. כעת כל המשתתפים יבחרו תאריכים לבחינה.`,
    bodyEn: `The examiner nomination for "${title.en}" was approved. Everyone will now pick dates for the exam.`,
  });

  await openAvailabilityRound(milestoneId, { reason: 'first' });
  return { emailFailed };
}

// ── Step 2: availability ─────────────────────────────────────────────────────

async function buildParticipants(exam: ThesisExamDoc, milestone: FirebaseFirestore.DocumentData): Promise<{ participants: Participant[]; committeeId: string | null; committeeMemberIds: string[] }> {
  const project = await projectOf(milestone.projectId);
  const committee = await resolveCommitteeForMilestone(milestone, project).catch(() => null);
  const committeeMemberIds = committee ? [...new Set([...(committee.memberIds ?? []), committee.chairmanId].filter(Boolean) as string[])] : [];
  const byKey = new Map<string, Participant>();
  const addUser = async (uid: string, role: ParticipantRole) => {
    const key = `u:${uid}`;
    const existing = byKey.get(key);
    if (existing) { if (!existing.roles.includes(role)) existing.roles.push(role); return; }
    byKey.set(key, { key, uid, name: await userName(uid), roles: [role] });
  };
  for (const id of (milestone.studentIds ?? []) as string[]) await addUser(id, 'student');
  for (const id of [milestone.supervisorId, milestone.secondarySupervisorId].filter(Boolean) as string[]) await addUser(id, 'supervisor');
  for (const id of committeeMemberIds) await addUser(id, 'committee');
  for (const e of exam.examiners) {
    if (e.type === 'internal') await addUser(e.uid!, 'examiner');
    else byKey.set(e.key, { key: e.key, ...(e.token ? { token: e.token } : {}), ...(e.email ? { email: e.email } : {}), name: e.name, roles: ['examiner'] });
  }
  return { participants: [...byKey.values()], committeeId: committee?.id ?? null, committeeMemberIds };
}

/** Starts a fresh picking round: a new 14-day window from today, everyone's
 *  earlier picks cleared, and everyone asked to pick. */
export async function openAvailabilityRound(milestoneId: string, why: { reason: 'first' | 'no_common_slot' | 'slots_exhausted' | 'window_expired' }): Promise<void> {
  const loaded = await loadExam(milestoneId);
  if (!loaded) return;
  const { exam, milestone } = loaded;
  const { participants, committeeId, committeeMemberIds } = await buildParticipants(exam, milestone);
  const window = windowFor(todayInIsrael());
  const round = (exam.availabilityRound ?? 0) + 1;
  const now = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    tx.update(examRef(milestoneId), {
      status: EXAM_AVAILABILITY,
      participants,
      committeeId,
      committeeMemberIds,
      availabilityRound: round,
      window,
      availability: {},
      commonSlots: [],
      slotIndex: 0,
      updatedAt: now,
    });
    tx.update(db.collection('milestones').doc(milestoneId), {
      status: EXAM_AVAILABILITY,
      examSchedule: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  const updated: ThesisExamDoc = { ...exam, participants, availabilityRound: round, window };
  const title = projectTitle(await projectOf(milestone.projectId));
  const lead = {
    first: { he: '', en: '' },
    no_common_slot: { he: 'לא נמצא מועד משותף לכל המשתתפים בסבב הקודם. ', en: 'No time was common to every participant in the previous round. ' },
    slots_exhausted: { he: 'המועדים המשותפים שנמצאו לא אושרו. ', en: 'The common times found were not approved. ' },
    window_expired: { he: 'חלון בחירת התאריכים הקודם הסתיים לפני שכולם בחרו. ', en: 'The previous date-picking window ended before everyone picked. ' },
  }[why.reason];
  await notifyParticipants(updated, {
    titleHe: 'יש לבחור תאריכים לבחינת התזה',
    titleEn: 'Pick your dates for the thesis exam',
    bodyHe: `${lead.he}בחינת התזה "${title.he}": יש לבחור ${DATES_PER_PARTICIPANT} תאריכים בין ${formatDay(window.start)} ל-${formatDay(window.end)}, ובכל תאריך את השעות שבהן את/ה פנוי/ה. המערכת תקבע את המועד שמשותף לכולם.`,
    bodyEn: `${lead.en}Thesis exam "${title.en}": pick ${DATES_PER_PARTICIPANT} dates between ${formatDay(window.start)} and ${formatDay(window.end)}, and the hours you're free on each. The system sets the time everyone shares.`,
  }, { pending: true });
}

export async function submitAvailability(milestoneId: string, participantKey: string, raw: unknown): Promise<{ resolved: boolean }> {
  const loaded = await loadExam(milestoneId);
  if (!loaded) throw new ThesisExamError('בחינת התזה לא נמצאה.', 'Thesis exam not found.', 404);
  if (loaded.exam.status !== EXAM_AVAILABILITY || !loaded.exam.window) {
    throw new ThesisExamError('בחירת התאריכים אינה פתוחה כעת.', 'Date picking is not open right now.', 409);
  }
  if (!loaded.exam.participants.some((p) => p.key === participantKey)) {
    throw new ThesisExamError('אינך משתתף/ת בבחינה זו.', 'You are not a participant in this exam.', 403);
  }
  const entries = validateAvailability(raw, loaded.exam.window);
  const round = loaded.exam.availabilityRound;
  const now = new Date().toISOString();

  // Write + "was that the last one?" in one transaction, so two last
  // submissions can't both (or neither) resolve the round.
  const outcome = await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(examRef(milestoneId))).data() as ThesisExamDoc | undefined;
    if (!fresh || fresh.status !== EXAM_AVAILABILITY || fresh.availabilityRound !== round) {
      throw new ThesisExamError('סבב בחירת התאריכים השתנה — יש לרענן ולנסות שוב.', 'The date-picking round changed — refresh and try again.', 409);
    }
    const availability = { ...fresh.availability, [participantKey]: { entries, submittedAt: now } };
    const allIn = fresh.participants.every((p) => availability[p.key]);
    if (!allIn) {
      // The whole map, not a dotted field path: an outside examiner's key
      // embeds their access token, whose charset includes '*' (invalid in a path).
      tx.update(examRef(milestoneId), { availability, updatedAt: now });
      return { kind: 'waiting' as const };
    }
    const slots = computeCommonSlots(fresh.participants.map((p) => availability[p.key]!.entries));
    if (slots.length === 0) {
      tx.update(examRef(milestoneId), { availability, commonSlots: [], slotIndex: 0, status: EXAM_DATE_COORDINATOR, updatedAt: now });
      tx.update(db.collection('milestones').doc(milestoneId), { status: EXAM_DATE_COORDINATOR, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return { kind: 'none' as const };
    }
    tx.update(examRef(milestoneId), { availability, commonSlots: slots, slotIndex: 0, slotSource: 'matched', status: EXAM_DATE_REVIEW, updatedAt: now });
    tx.update(db.collection('milestones').doc(milestoneId), { status: EXAM_DATE_REVIEW, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { kind: 'matched' as const, slot: slots[0]! };
  });

  if (outcome.kind === 'waiting') return { resolved: false };
  if (outcome.kind === 'none') {
    await handToCoordinator(milestoneId, 'no_common_slot');
    return { resolved: true };
  }
  await notifyDateReviewer(milestoneId, 'program_head', outcome.slot);
  return { resolved: true };
}

// ── Step 3: date approvals ───────────────────────────────────────────────────

async function notifyDateReviewer(milestoneId: string, who: 'program_head' | 'grad_school_head', slot: ExamSlot): Promise<void> {
  const loaded = await loadExam(milestoneId);
  if (!loaded) return;
  const title = projectTitle(await projectOf(loaded.milestone.projectId));
  const ids = who === 'program_head' ? await programHeadIds(loaded.exam.scope) : await gradSchoolHeadIds(loaded.exam.scope);
  await notifyUsers(ids, loaded.exam, {
    titleHe: 'מועד בחינת תזה ממתין לאישורך',
    titleEn: 'Thesis exam date awaiting your approval',
    bodyHe: loaded.exam.slotSource === 'coordinator'
      ? `הרכזת האדמיניסטרטיבית קבעה מועד לבחינת התזה "${title.he}": ${formatSlot(slot)}.`
      : `המערכת מצאה מועד משותף לבחינת התזה "${title.he}": ${formatSlot(slot)}.`,
    bodyEn: loaded.exam.slotSource === 'coordinator'
      ? `The administrative coordinator set a time for the thesis exam "${title.en}": ${formatSlot(slot)}.`
      : `The system found a common time for the thesis exam "${title.en}": ${formatSlot(slot)}.`,
  }, { pending: true });
}

// ── Step 2b: the administrative coordinator sets the time ────────────────────

/** Who sets the time when nobody's picks overlap — the administrative
 *  coordinator in scope (system_admin too, for authorization only). */
export async function adminCoordinatorIds(scope: ResourceScope, forAuth = false): Promise<string[]> {
  return resolveStaffForScope('administrative_secretary', scope, [], [], forAuth);
}

/** No common time, or the heads rejected every one: the administrative
 *  coordinator is asked to set the date and hours; the student and
 *  supervisor are told why it's taking longer. */
async function handToCoordinator(milestoneId: string, why: 'no_common_slot' | 'slots_rejected'): Promise<void> {
  const now = new Date().toISOString();
  await examRef(milestoneId).update({ status: EXAM_DATE_COORDINATOR, updatedAt: now });
  await db.collection('milestones').doc(milestoneId).update({ status: EXAM_DATE_COORDINATOR, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  const loaded = await loadExam(milestoneId);
  if (!loaded) return;
  const title = projectTitle(await projectOf(loaded.milestone.projectId));
  const reason = why === 'no_common_slot'
    ? { he: 'לא נמצא מועד ושעות המשותפים לכל המשתתפים', en: 'No date and hours were common to every participant' }
    : { he: 'המועד שהוצע לא אושר', en: 'The proposed time was not approved' };
  await notifyUsers(await adminCoordinatorIds(loaded.exam.scope), loaded.exam, {
    titleHe: 'יש לקבוע מועד לבחינת תזה',
    titleEn: 'Set a thesis exam time',
    bodyHe: `${reason.he} בבחינת התזה "${title.he}". יש לקבוע תאריך ושעות — הם יועברו לאישור ראש התוכנית וראש בית הספר.`,
    bodyEn: `${reason.en} for the thesis exam "${title.en}". Please set a date and hours — they go to the program head and the grad school head for approval.`,
  }, { pending: true });
  const supervisors = [loaded.milestone.supervisorId, loaded.milestone.secondarySupervisorId].filter(Boolean) as string[];
  await notifyUsers([...supervisors, ...(loaded.milestone.studentIds ?? [])], loaded.exam, {
    titleHe: 'מועד הבחינה ייקבע על ידי הרכזת',
    titleEn: 'The coordinator will set the exam time',
    bodyHe: `${reason.he} בבחינת התזה "${title.he}". הרכזת האדמיניסטרטיבית תקבע את המועד ותישלח הודעה.`,
    bodyEn: `${reason.en} for the thesis exam "${title.en}". The administrative coordinator will set the time and you'll be notified.`,
  });
}

export async function setCoordinatorDate(
  milestoneId: string,
  actor: { uid: string; name: string },
  raw: { date?: unknown; from?: unknown; to?: unknown; note?: unknown },
): Promise<void> {
  const loaded = await loadExam(milestoneId);
  if (!loaded) throw new ThesisExamError('בחינת התזה לא נמצאה.', 'Thesis exam not found.', 404);
  if (!(await adminCoordinatorIds(loaded.exam.scope, true)).includes(actor.uid)) {
    throw new ThesisExamError('רק הרכזת האדמיניסטרטיבית רשאית לקבוע את המועד.', 'Only the administrative coordinator may set the time.', 403);
  }
  const { date, from, to } = raw;
  if (!isValidIsoDay(date)) throw new ThesisExamError('תאריך לא תקין.', 'Invalid date.');
  if (!isValidClockTime(from) || !isValidClockTime(to)) throw new ThesisExamError('יש למלא שעת התחלה ושעת סיום.', 'Fill in a start and end time.');
  if (minutesOf(to) <= minutesOf(from)) throw new ThesisExamError('שעת הסיום חייבת להיות אחרי שעת ההתחלה.', 'The end time must be after the start time.');
  assertExamTime(date, from, to);
  if (slotHasStarted({ date, from })) throw new ThesisExamError('המועד שנבחר כבר עבר.', 'That time has already passed.');
  const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, 1000) : '';
  const slot: ExamSlot = { date, from, to };
  const now = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(examRef(milestoneId))).data() as ThesisExamDoc | undefined;
    if (fresh?.status !== EXAM_DATE_COORDINATOR) throw new ThesisExamError('הבחינה אינה ממתינה כעת לקביעת מועד.', 'The exam is not waiting for a time right now.', 409);
    tx.update(examRef(milestoneId), {
      status: EXAM_DATE_REVIEW,
      commonSlots: [slot],
      slotIndex: 0,
      slotSource: 'coordinator',
      coordinatorSlots: admin.firestore.FieldValue.arrayUnion({ ...slot, note, setById: actor.uid, setByName: actor.name, setAt: now }),
      updatedAt: now,
    });
    tx.update(db.collection('milestones').doc(milestoneId), { status: EXAM_DATE_REVIEW, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  await notifyDateReviewer(milestoneId, 'program_head', slot);
}

/** The next still-future common slot after `fromIndex`, or -1. */
function nextFutureSlotIndex(slots: ExamSlot[], fromIndex: number): number {
  for (let i = fromIndex; i < slots.length; i++) if (!slotHasStarted(slots[i]!)) return i;
  return -1;
}

export async function decideDate(
  milestoneId: string,
  actor: { uid: string; name: string },
  decision: 'approve' | 'reject',
  reason: string,
): Promise<void> {
  const loaded = await loadExam(milestoneId);
  if (!loaded) throw new ThesisExamError('בחינת התזה לא נמצאה.', 'Thesis exam not found.', 404);
  const { exam } = loaded;
  const who = exam.status === EXAM_DATE_REVIEW ? 'program_head' : exam.status === EXAM_DATE_FINAL_REVIEW ? 'grad_school_head' : null;
  if (!who) throw new ThesisExamError('אין מועד שממתין לאישור.', 'No exam date is awaiting approval.', 409);
  const allowed = who === 'program_head' ? await programHeadIds(exam.scope, true) : await gradSchoolHeadIds(exam.scope, true);
  if (!allowed.includes(actor.uid)) {
    throw new ThesisExamError(
      who === 'program_head' ? 'המועד ממתין לאישור ראש התוכנית.' : 'המועד ממתין לאישור ראש בית הספר ללימודים מתקדמים.',
      who === 'program_head' ? 'The date is waiting for the program head.' : 'The date is waiting for the head of the graduate school.',
      403,
    );
  }
  const trimmed = reason.trim().slice(0, 2000);
  if (decision === 'reject' && !trimmed) throw new ThesisExamError('יש לכתוב את סיבת הדחייה.', 'Write the reason for rejecting.');
  const slot = exam.commonSlots[exam.slotIndex];
  if (!slot) throw new ThesisExamError('המועד המוצע לא נמצא.', 'The proposed time was not found.', 409);
  if (decision === 'approve' && slotHasStarted(slot)) {
    throw new ThesisExamError('המועד המוצע כבר עבר — יש לדחות אותו כדי לעבור למועד הבא.', 'The proposed time has already passed — reject it to move to the next one.', 409);
  }
  const now = new Date().toISOString();

  const result = await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(examRef(milestoneId))).data() as ThesisExamDoc | undefined;
    if (!fresh || fresh.status !== exam.status || fresh.slotIndex !== exam.slotIndex || fresh.availabilityRound !== exam.availabilityRound) {
      throw new ThesisExamError('המועד כבר טופל.', 'This time was already decided.', 409);
    }
    const msRef = db.collection('milestones').doc(milestoneId);
    if (decision === 'approve') {
      if (who === 'program_head') {
        tx.update(examRef(milestoneId), { status: EXAM_DATE_FINAL_REVIEW, updatedAt: now });
        tx.update(msRef, { status: EXAM_DATE_FINAL_REVIEW, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        return { kind: 'to_grad_head' as const };
      }
      const schedule = { ...slot, approvedAt: now };
      tx.update(examRef(milestoneId), { status: EXAM_SCHEDULED, schedule, updatedAt: now });
      tx.update(msRef, { status: EXAM_SCHEDULED, examSchedule: { date: slot.date, from: slot.from, to: slot.to }, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return { kind: 'scheduled' as const };
    }
    const rejection: SlotRejection = { slot, by: who, byId: actor.uid, byName: actor.name, reason: trimmed, at: now };
    const next = nextFutureSlotIndex(fresh.commonSlots, fresh.slotIndex + 1);
    if (next >= 0) {
      tx.update(examRef(milestoneId), { status: EXAM_DATE_REVIEW, slotIndex: next, rejectedSlots: admin.firestore.FieldValue.arrayUnion(rejection), updatedAt: now });
      tx.update(msRef, { status: EXAM_DATE_REVIEW, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return { kind: 'next_slot' as const, slot: fresh.commonSlots[next]! };
    }
    tx.update(examRef(milestoneId), { rejectedSlots: admin.firestore.FieldValue.arrayUnion(rejection), updatedAt: now });
    return { kind: 'exhausted' as const };
  });

  if (result.kind === 'to_grad_head') return notifyDateReviewer(milestoneId, 'grad_school_head', slot);
  if (result.kind === 'next_slot') return notifyDateReviewer(milestoneId, 'program_head', result.slot);
  if (result.kind === 'exhausted') return handToCoordinator(milestoneId, 'slots_rejected');

  const fresh = (await examRef(milestoneId).get()).data() as ThesisExamDoc;
  const title = projectTitle(await projectOf(loaded.milestone.projectId));
  await notifyParticipants(fresh, {
    titleHe: 'נקבע מועד לבחינת התזה',
    titleEn: 'The thesis exam date is set',
    bodyHe: `בחינת התזה "${title.he}" תתקיים ב-${formatSlot(slot)}.`,
    bodyEn: `The thesis exam "${title.en}" will take place on ${formatSlot(slot)}.`,
  });
}

// ── Step 4: the examiner's form, after the exam ──────────────────────────────
//
// The faculty's "טופס מבחן תיזה" (Sciences, M.Sc.), digitized. The system fills
// the header (student, ID, academic unit, supervisors, topic, exam date); each
// examiner fills the rest on their own: five 1–10 ratings, general comments,
// and a score for each of the three grade components (their weights give the
// final grade). Stored per examiner in `thesisExamForms` (server-only, like
// thesisExams) and digitally signed. The committee sees every form once all
// examiners submitted.

export const THESIS_EXAM_FORMS = 'thesisExamForms';

export const CS_THESIS_EXAM_FORM = {
  titleHe: 'טופס מבחן תיזה',
  titleEn: 'Thesis Exam Form',
  ratingScale: { min: 1, max: 10, minLabelHe: 'כלל לא', maxLabelHe: 'במידה רבה מאד', minLabelEn: 'Not at all', maxLabelEn: 'To a very great extent' },
  questions: [
    { key: 'q1', labelHe: 'האם הסטודנט/ית הציג/ה בצורה מדעית וברורה את העבודה?', labelEn: 'Did the student present the work clearly and scientifically?' },
    { key: 'q2', labelHe: 'האם הסטודנט/ית השיב/ה כראוי לשאלות הבוחנים? האם גילה/תה הבנה וחשיבה ביקורתית?', labelEn: "Did the student answer the examiners' questions properly? Did they show understanding and critical thinking?" },
    { key: 'q3', labelHe: 'האם הסטודנט/ית גילה/תה ידע בתחום מחקרו?', labelEn: 'Did the student show knowledge of their research field?' },
    { key: 'q4', labelHe: 'האם הסטודנט/ית גילה/תה שליטה בתחום הכללי של המחקר מעבר לנושא הממוקד של העבודה?', labelEn: "Did the student show command of the research's general field beyond the thesis's focused topic?" },
    { key: 'q5', labelHe: 'האם העבודה שנעשתה מהווה תרומה מדעית?', labelEn: 'Is the work a scientific contribution?' },
  ],
  gradeComponents: [
    { key: 'research', labelHe: 'מחקר על סמך חוות דעת המנחה', labelEn: "Research, based on the supervisor's opinion", weight: 40 },
    { key: 'writing', labelHe: 'כתיבת התזה', labelEn: 'Writing the thesis', weight: 40 },
    { key: 'defense', labelHe: 'מבחן ההגנה על התזה', labelEn: 'The thesis defense exam', weight: 20 },
  ],
  /** The form's reference table — shown, not filled. */
  gradeKey: [
    { range: '65-69', statusHe: 'עומד בדרישות באופן מינימלי', statusEn: 'Minimally meets the requirements', publicationHe: '', publicationEn: '' },
    { range: '70-79', statusHe: 'משביע רצון', statusEn: 'Satisfactory', publicationHe: '', publicationEn: '' },
    { range: '80-84', statusHe: 'ברמה סבירה', statusEn: 'Reasonable', publicationHe: '', publicationEn: '' },
    { range: '85-89', statusHe: 'ברמה טובה', statusEn: 'Good', publicationHe: 'נדרש לפחות ציון 85 לקבלה לתואר שלישי', publicationEn: 'A grade of at least 85 is required for Ph.D. admission' },
    { range: '90-94', statusHe: 'ברמה טובה מאד', statusEn: 'Very good', publicationHe: 'קיימת המלצה של שני השופטים שהמחקר ראוי לפרסום או המחקר הוצג בכנס מדעי או המחקר הוגש לפרסום בכתב עת מדעי', publicationEn: 'Both judges recommend publication, or the research was presented at a scientific conference or submitted to a scientific journal' },
    { range: '95-100', statusHe: 'ברמה מצוינת, מחקר פורץ דרך', statusEn: 'Excellent, groundbreaking research', publicationHe: 'התקבל או התפרסם מאמר בכתב עת מדעי בדירוג Q1-Q2', publicationEn: 'A paper was accepted or published in a Q1–Q2 scientific journal' },
  ],
} as const;

export interface StoredExamForm {
  milestoneId: string;
  key: string;
  examinerName: string;
  external: boolean;
  ratings: Record<string, number>;
  comments: string;
  components: Record<string, number>;
  finalGrade: number;
  submittedAt: string;
  signature: EvaluationSignature;
}

const formDocId = (milestoneId: string, key: string) => `${milestoneId}__${key}`;

export function computeExamFinalGrade(components: Record<string, number>): number {
  const total = CS_THESIS_EXAM_FORM.gradeComponents.reduce((sum, c) => sum + (components[c.key] ?? 0) * c.weight, 0) / 100;
  return Math.round(total * 10) / 10;
}

function maskIdNumber(id: unknown): string | null {
  if (typeof id !== 'string' || !id.trim()) return null;
  const digits = id.replace(/\D/g, '');
  return digits.length > 4 ? `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}` : '****';
}

const MAJOR_NAMES: Record<string, { he: string; en: string }> = {
  computer_science: { he: 'מדעי המחשב', en: 'Computer Science' },
};

/** The header lines the system fills — the "dry details". The student's ID
 *  is masked (last 4 digits), as on the final report: outside examiners see
 *  this form. */
export async function examFormHeader(milestone: FirebaseFirestore.DocumentData, exam: ThesisExamDoc) {
  const project = await projectOf(milestone.projectId);
  const studentSnaps = await Promise.all(((milestone.studentIds ?? []) as string[]).map((id) => db.collection('users').doc(id).get()));
  const students = studentSnaps.map((s) => s.data() ?? {});
  const supervisor = milestone.supervisorId ? await userName(milestone.supervisorId) : '';
  const secondary = milestone.secondarySupervisorId ? await userName(milestone.secondarySupervisorId) : '';
  const faculty = facultyName(exam.facultyId);
  const major = exam.scope.major ? (MAJOR_NAMES[exam.scope.major] ?? { he: exam.scope.major, en: exam.scope.major }) : null;
  const schedule = exam.schedule;
  const line = (key: string, labelHe: string, labelEn: string, value: string | null) => ({ key, labelHe, labelEn, value: value || null });
  return [
    line('studentName', 'שם הסטודנט/ית', 'Student name', students.map((s) => s.displayName || s.displayNameHe || '').filter(Boolean).join(', ')),
    line('idNumber', 'ת"ז', 'ID number', students.map((s) => maskIdNumber(s.studentId)).filter(Boolean).join(', ')),
    line('academicUnit', 'יחידה אקדמית', 'Academic unit', [faculty.he, major?.he].filter(Boolean).join(' — ')),
    line('supervisor', 'שם המנחה', 'Supervisor', supervisor),
    line('secondarySupervisor', 'שם המנחה הנוסף/ת', 'Additional supervisor', secondary),
    line('topic', 'נושא המחקר', 'Research topic', project.titleHe || project.titleEn || ''),
    line('examDate', 'תאריך המבחן', 'Exam date', schedule ? formatSlot(schedule) : null),
  ];
}

/** The form opens once the scheduled exam has started, and locks once every
 *  examiner submitted. */
export function examFormGate(exam: ThesisExamDoc): { open: true } | { open: false; he: string; en: string } {
  if (exam.status === EXAM_COMMITTEE_REVIEW) return { open: false, he: 'כל הבוחנים הגישו את הטופס — הטופס נעול.', en: 'Every examiner has submitted — the form is locked.' };
  if (exam.status !== EXAM_SCHEDULED || !exam.schedule) return { open: false, he: 'הטופס ייפתח לאחר שייקבע ויתקיים מועד הבחינה.', en: 'The form opens once the exam date is set and the exam takes place.' };
  if (!slotHasStarted(exam.schedule)) {
    return { open: false, he: `הטופס ייפתח בתחילת הבחינה (${formatSlot(exam.schedule)}).`, en: `The form opens when the exam starts (${formatSlot(exam.schedule)}).` };
  }
  return { open: true };
}

export async function loadExamForms(exam: ThesisExamDoc): Promise<Record<string, StoredExamForm>> {
  const keys = exam.examiners.map((e) => e.key);
  if (keys.length === 0) return {};
  const snaps = await db.getAll(...keys.map((k) => db.collection(THESIS_EXAM_FORMS).doc(formDocId(exam.milestoneId, k))));
  const out: Record<string, StoredExamForm> = {};
  snaps.forEach((s, i) => { if (s.exists) out[keys[i]!] = s.data() as StoredExamForm; });
  return out;
}

export type ExamFormViewer = { kind: 'examiner'; key: string } | { kind: 'reviewer' };

/** An examiner sees only their own form; a reviewer (committee member, grad
 *  school head, program head) sees every submitted form. */
export async function buildExamFormView(milestoneId: string, viewer: ExamFormViewer) {
  const loaded = await loadExam(milestoneId);
  if (!loaded) throw new ThesisExamError('בחינת התזה לא נמצאה.', 'Thesis exam not found.', 404);
  const { exam, milestone } = loaded;
  const forms = await loadExamForms(exam);
  const gate = examFormGate(exam);
  const strip = (f: StoredExamForm) => ({ ...f, key: undefined, signature: { ...f.signature, signerUid: undefined, digest: undefined } });
  return {
    milestoneId,
    form: CS_THESIS_EXAM_FORM,
    header: await examFormHeader(milestone, exam),
    status: exam.status,
    canEdit: viewer.kind === 'examiner' && gate.open && !forms[viewer.key],
    lockedReasonHe: gate.open ? null : gate.he,
    lockedReasonEn: gate.open ? null : gate.en,
    submittedCount: Object.keys(forms).length,
    examinerCount: exam.examiners.length,
    mine: viewer.kind === 'examiner' && forms[viewer.key] ? strip(forms[viewer.key]!) : null,
    all: viewer.kind === 'reviewer'
      ? exam.examiners.map((e, index) => ({ index, name: e.name, submitted: !!forms[e.key], form: forms[e.key] ? strip(forms[e.key]!) : null }))
      : null,
  };
}

export async function submitExamForm(milestoneId: string, examiner: { key: string; name: string; external: boolean }, raw: unknown): Promise<{ allIn: boolean }> {
  const loaded = await loadExam(milestoneId);
  if (!loaded) throw new ThesisExamError('בחינת התזה לא נמצאה.', 'Thesis exam not found.', 404);
  const { exam } = loaded;
  if (!exam.examiners.some((e) => e.key === examiner.key)) {
    throw new ThesisExamError('רק בוחן/ת של בחינה זו רשאי/ת למלא את הטופס.', 'Only an examiner of this exam may fill in the form.', 403);
  }
  const gate = examFormGate(exam);
  if (!gate.open) throw new ThesisExamError(gate.he, gate.en, 409);

  const body = (raw ?? {}) as { ratings?: Record<string, unknown>; comments?: unknown; components?: Record<string, unknown> };
  const ratings: Record<string, number> = {};
  for (const q of CS_THESIS_EXAM_FORM.questions) {
    const v = Number(body.ratings?.[q.key]);
    if (!Number.isInteger(v) || v < 1 || v > 10) throw new ThesisExamError('יש לדרג כל שאלה בין 1 ל-10.', 'Rate every question from 1 to 10.');
    ratings[q.key] = v;
  }
  const components: Record<string, number> = {};
  for (const c of CS_THESIS_EXAM_FORM.gradeComponents) {
    const v = Number(body.components?.[c.key]);
    if (!Number.isFinite(v) || v < 1 || v > 100) throw new ThesisExamError(`יש לתת ציון בין 1 ל-100 ל"${c.labelHe}".`, `Give "${c.labelEn}" a score from 1 to 100.`);
    components[c.key] = Math.round(v * 10) / 10;
  }
  const comments = typeof body.comments === 'string' ? body.comments.trim().slice(0, 20000) : '';
  const finalGrade = computeExamFinalGrade(components);
  const signature = await signEvaluation({
    milestoneId,
    signerUid: examiner.key,
    signerName: examiner.name,
    role: 'examiner',
    positionHe: 'שופט/ת',
    positionEn: 'Judge',
    facultyId: exam.facultyId,
    scores: { thesisExamForm: { ratings, comments, components, finalGrade } },
  });
  const stored: StoredExamForm = { milestoneId, key: examiner.key, examinerName: examiner.name, external: examiner.external, ratings, comments, components, finalGrade, submittedAt: new Date().toISOString(), signature };

  // One submission per examiner, and "was that the last one?" decided once.
  const allIn = await db.runTransaction(async (tx) => {
    const ref = db.collection(THESIS_EXAM_FORMS).doc(formDocId(milestoneId, examiner.key));
    const fresh = (await tx.get(examRef(milestoneId))).data() as ThesisExamDoc | undefined;
    if (!fresh || fresh.status !== EXAM_SCHEDULED) throw new ThesisExamError('הטופס נעול.', 'The form is locked.', 409);
    const otherRefs = fresh.examiners.filter((e) => e.key !== examiner.key).map((e) => db.collection(THESIS_EXAM_FORMS).doc(formDocId(milestoneId, e.key)));
    const [mine, ...others] = await tx.getAll(ref, ...otherRefs);
    if (mine!.exists) throw new ThesisExamError('כבר הגשת את הטופס.', 'You already submitted the form.', 409);
    tx.set(ref, stored);
    const done = others.every((o) => o.exists);
    if (done) {
      tx.update(examRef(milestoneId), { status: EXAM_COMMITTEE_REVIEW, updatedAt: new Date().toISOString() });
      tx.update(db.collection('milestones').doc(milestoneId), { status: EXAM_COMMITTEE_REVIEW, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    return done;
  });
  if (allIn) await onExamFormsComplete(milestoneId);
  return { allIn };
}

/** Every examiner submitted → the committee reviews the forms. WHAT THE
 *  COMMITTEE DOES NEXT IS NOT DEFINED YET — the flow waits here. */
async function onExamFormsComplete(milestoneId: string): Promise<void> {
  const loaded = await loadExam(milestoneId);
  if (!loaded) return;
  const title = projectTitle(await projectOf(loaded.milestone.projectId));
  await notifyUsers(loaded.exam.committeeMemberIds, loaded.exam, {
    titleHe: 'טופסי הבוחנים התקבלו',
    titleEn: "The examiners' forms are in",
    bodyHe: `כל הבוחנים מילאו את טופס מבחן התזה "${title.he}". הטפסים זמינים לוועדה.`,
    bodyEn: `Every examiner filled in the thesis exam form for "${title.en}". The forms are available to the committee.`,
  }, { pending: true });
  const supervisors = [loaded.milestone.supervisorId, loaded.milestone.secondarySupervisorId].filter(Boolean) as string[];
  await notifyUsers([...supervisors, ...(loaded.milestone.studentIds ?? [])], loaded.exam, {
    titleHe: 'הבחינה הסתיימה — ממתין לוועדה',
    titleEn: 'Exam finished — awaiting the committee',
    bodyHe: `הבוחנים הגישו את הטפסים על התזה "${title.he}". הוועדה תדון בהם.`,
    bodyEn: `The examiners submitted their forms on "${title.en}". The committee will review them.`,
  });
}

// ── Hourly sweep ─────────────────────────────────────────────────────────────

/** Backstop + timers: opens flows a missed hook left pending, restarts a
 *  picking round whose window ended before everyone picked, skips a proposed
 *  time that passed while awaiting approval, and tells the examiners the form
 *  is open once the exam starts. */
export async function sweepThesisExams(): Promise<void> {
  const pending = await db.collection('milestones').where('thesisExamFlow', '==', true).where('status', '==', 'pending').get();
  const projectIds = new Set(pending.docs.map((d) => d.data().projectId as string));
  for (const pid of projectIds) await maybeOpenThesisExamForProject(pid).catch((err) => console.error('sweepThesisExams open:', err));

  const active = await db.collection(THESIS_EXAMS).where('status', 'in', [EXAM_AVAILABILITY, EXAM_DATE_REVIEW, EXAM_DATE_FINAL_REVIEW, EXAM_SCHEDULED]).get();
  const today = todayInIsrael();
  for (const doc of active.docs) {
    const exam = doc.data() as ThesisExamDoc;
    try {
      if (exam.status === EXAM_AVAILABILITY && exam.window && today > exam.window.end) {
        await openAvailabilityRound(exam.milestoneId, { reason: 'window_expired' });
      } else if ((exam.status === EXAM_DATE_REVIEW || exam.status === EXAM_DATE_FINAL_REVIEW) && exam.commonSlots[exam.slotIndex] && slotHasStarted(exam.commonSlots[exam.slotIndex]!)) {
        const next = nextFutureSlotIndex(exam.commonSlots, exam.slotIndex + 1);
        if (next >= 0) {
          await doc.ref.update({ status: EXAM_DATE_REVIEW, slotIndex: next, updatedAt: new Date().toISOString() });
          await db.collection('milestones').doc(exam.milestoneId).update({ status: EXAM_DATE_REVIEW });
          await notifyDateReviewer(exam.milestoneId, 'program_head', exam.commonSlots[next]!);
        } else {
          await handToCoordinator(exam.milestoneId, 'slots_rejected');
        }
      } else if (exam.status === EXAM_SCHEDULED && exam.schedule && slotHasStarted(exam.schedule) && exam.opinionReminderSentFor !== exam.schedule.date) {
        await doc.ref.update({ opinionReminderSentFor: exam.schedule.date });
        const examinerKeys = exam.participants.filter((p) => p.roles.includes('examiner')).map((p) => p.key);
        const title = projectTitle(await projectOf(exam.projectId));
        await notifyParticipants(exam, {
          titleHe: 'יש למלא את טופס הבוחן',
          titleEn: "Fill in the examiner's form",
          bodyHe: `בחינת התזה "${title.he}" התחילה — טופס הבוחן פתוח למילוי.`,
          bodyEn: `The thesis exam "${title.en}" has started — the examiner's form is open.`,
        }, { pending: true, onlyKeys: examinerKeys });
      }
    } catch (err) {
      console.error(`sweepThesisExams: ${exam.milestoneId} failed:`, err);
    }
  }
}
