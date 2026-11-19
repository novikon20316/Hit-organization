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
//                            and examiners each pick 5 dates, with the hours
//                            they're free, within PICK_HOURS (48h) of the
//                            round opening — reminded at 24h. The dates
//                            themselves are days 3–16 after the opening day,
//                            so everyone sees the same days however late they
//                            answer. When the last one submits, every date ALL
//                            of them picked is intersected by hours; each
//                            overlap of at least MIN_EXAM_MINUTES is a
//                            candidate slot, earliest first. Found → the
//                            administrative coordinator sets the exam's hours
//                            inside that shared window (coordinatorTask
//                            'set_hours'; people pick wide windows). None →
//                            she sets the date and hours ('set_date').
//                            Deadline missed: the administrative coordinator
//                            gets LATE_ENTRY_HOURS (24h) to reach whoever is
//                            missing and enter their dates for them (the late
//                            person may still submit too). After that the
//                            system matches from everyone who DID pick, the
//                            missing ones left out (excludedKeys).
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
//   exam_grades_pending      every examiner submitted; waiting for the
//                            supervisor's research grade (or another weighted
//                            milestone's grade) — advanceExamGrading
//   exam_grade_review        the final grade — every milestone's grade by the
//                            template's percentages, frozen with its breakdown
//                            (gradeBreakdown) — awaits the grad school head:
//                            approve → exam_coordinator_approval (or, below
//                            MIN_PASSING_FINAL_GRADE = 75,
//                            exam_returned_to_supervisor); deny →
//                            exam_grade_denied (what follows: not defined yet)
//   exam_coordinator_approval  the administrative coordinator's final
//                            approval → exam_completed: milestone completed,
//                            project closed, grade sent to Michlol (stub)
//   exam_committee_review    RETIRED 2026-11-19 (no committee decision after
//                            the forms) — the sweep moves leftovers on
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
import { resolveCommitteeForMilestone, findSupervisorConflicts } from '../controllers/committeeController.js';
import { resolveMilestoneOrder, getMilestonesForTemplateId, resolveProjectTemplateMilestones, type WorkflowMilestoneSpec } from './workflowTemplates.js';
import { WEBSITE_URL } from '../config/links.js';
import { signEvaluation, type EvaluationSignature } from './evaluationSignature.js';
import { facultyName } from './studentProgress.js';
import { logProjectRecordEntry } from './projectRecords.js';
import { transferGradeToMichlol, computeProjectFinalGrade } from './gradeEngine.js';
import { recordProjectCompletion } from './projectCompletion.js';

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
/** Retired — see the header. */
export const EXAM_COMMITTEE_REVIEW = 'exam_committee_review';
export const EXAM_GRADES_PENDING = 'exam_grades_pending';
export const EXAM_GRADE_REVIEW = 'exam_grade_review';
export const EXAM_GRADE_DENIED = 'exam_grade_denied';
export const EXAM_RETURNED_TO_SUPERVISOR = 'exam_returned_to_supervisor';
export const EXAM_COORDINATOR_APPROVAL = 'exam_coordinator_approval';
export const EXAM_COMPLETED = 'exam_completed';

export const THESIS_EXAM_STATUSES = [
  EXAM_NOMINATION, EXAM_NOMINATION_REVIEW, EXAM_AVAILABILITY, EXAM_DATE_COORDINATOR,
  EXAM_DATE_REVIEW, EXAM_DATE_FINAL_REVIEW, EXAM_SCHEDULED, EXAM_COMMITTEE_REVIEW,
  EXAM_GRADES_PENDING, EXAM_GRADE_REVIEW, EXAM_GRADE_DENIED, EXAM_RETURNED_TO_SUPERVISOR,
  EXAM_COORDINATOR_APPROVAL, EXAM_COMPLETED,
] as const;

/** Every examiner already submitted — the forms are locked and readable. */
export const EXAM_FORMS_DONE_STATUSES: readonly string[] = [
  EXAM_COMMITTEE_REVIEW, EXAM_GRADES_PENDING, EXAM_GRADE_REVIEW, EXAM_GRADE_DENIED,
  EXAM_RETURNED_TO_SUPERVISOR, EXAM_COORDINATOR_APPROVAL, EXAM_COMPLETED,
];

export function isThesisExamStatus(status: string | null | undefined): boolean {
  return !!status && (THESIS_EXAM_STATUSES as readonly string[]).includes(status);
}

/** Fallback for how many examiners the supervisor nominates. The real
 *  number is the workflow template's examinerCount, which enrollment copies
 *  onto the milestone — see examinerCountFor. */
export const EXAMINER_COUNT = 2;

/** How many examiners THIS exam needs: the template's examinerCount as
 *  snapshotted on the milestone, falling back to EXAMINER_COUNT. */
export function examinerCountFor(milestone: FirebaseFirestore.DocumentData | undefined): number {
  const n = milestone?.examinerCount;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 10 ? n : EXAMINER_COUNT;
}
/** How many dates each participant picks. */
export const DATES_PER_PARTICIPANT = 5;
/** How many days the exam may fall on (the picking range's length). */
export const AVAILABILITY_WINDOW_DAYS = 14;
/** The range's first day, counted from the day the round opens — after the
 *  48h deadline plus the coordinator's 24h, so no picked day has gone by
 *  when the dates are matched. Days 3..16. */
export const RANGE_START_OFFSET_DAYS = 3;
/** Hours every participant has to submit their picks once a round opens. */
export const PICK_HOURS = 48;
/** Reminder to whoever hasn't picked, this long after the round opens. */
export const PICK_REMINDER_HOURS = 24;
/** After the deadline: how long the administrative coordinator has to
 *  enter a late participant's dates (after a call) before the system
 *  matches without them. */
export const LATE_ENTRY_HOURS = 24;
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
  availability: Record<string, { entries: AvailabilityEntry[]; submittedAt: string; enteredById?: string; enteredByName?: string }>;
  /** When this round opened, and its submit deadline. Rounds opened before
   *  the 48h rule have neither — they keep the old "until the window's last
   *  day" behavior. */
  roundOpenedAt?: string;
  pickDeadline?: string;
  pickReminderSentAt?: string | null;
  /** Set when the deadline passed with someone missing: the administrative
   *  coordinator may enter their dates until `deadline`. */
  lateEntry?: { startedAt: string; deadline: string; missingKeys: string[] } | null;
  /** Left out of the match — nobody entered their dates in time. */
  excludedKeys?: string[];
  commonSlots: ExamSlot[];
  slotIndex: number;
  rejectedSlots: SlotRejection[];
  schedule: (ExamSlot & { approvedAt: string }) | null;
  /** Where the slot under review came from: the system's match, or the
   *  administrative coordinator (who then gets it back on a rejection). */
  slotSource?: 'matched' | 'coordinator';
  /** What the administrative coordinator has to do in exam_date_coordinator:
   *  'set_hours' — a common window was found (commonSlots[slotIndex]); she
   *  picks the exam's hours inside it. 'set_date' (or absent) — no common
   *  time; she sets date and hours herself. */
  coordinatorTask?: 'set_date' | 'set_hours' | null;
  /** Every time the coordinator set, newest last. */
  coordinatorSlots?: Array<ExamSlot & { note: string; setById: string; setByName: string; setAt: string }>;
  /** Set once the "the exam started — fill the form" reminder went out. */
  opinionReminderSentFor?: string | null;
  /** How the final grade was made — frozen when it went to the grad school head. */
  gradeBreakdown?: ExamGradeBreakdown | null;
  /** The grad school head's decision on the final grade. */
  gradeReview?: ExamGradeReview | null;
  /** The administrative coordinator's final approval. */
  finalApproval?: ExamFinalApproval | null;
  updatedAt: string;
}

export interface ExamGradeBreakdownRow {
  type: string;
  nameHe: string;
  nameEn: string;
  /** The milestone's share of the final grade (template percentOfFinalGrade). */
  percent: number;
  /** The thesis exam itself — its grade is research 40 + writing 40 + defense 20. */
  isExam: boolean;
  grades: Record<string, number | null>;
}

export interface ExamGradeBreakdown {
  computedAt: string;
  students: Array<{ id: string; name: string }>;
  rows: ExamGradeBreakdownRow[];
  exam: { research: number | null; writing: number | null; defense: number | null; examGrade: number | null };
  finalGradeByStudent: Record<string, number | null>;
  missing: Array<{ he: string; en: string }>;
}

export interface ExamGradeReview {
  decision: 'approve' | 'deny';
  reason: string;
  byUid: string;
  byName: string;
  at: string;
  signature?: EvaluationSignature;
}

export interface ExamFinalApproval {
  byUid: string;
  byName: string;
  at: string;
  note: string;
  signature: EvaluationSignature;
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
  const start = dayjs(openDay).add(RANGE_START_OFFSET_DAYS, 'day');
  return { start: start.format('YYYY-MM-DD'), end: start.add(AVAILABILITY_WINDOW_DAYS - 1, 'day').format('YYYY-MM-DD') };
}

/** "18/11/2026 14:00" in Israel time. */
export function formatMoment(iso: string): string {
  return dayjs(iso).tz(TZ).format('DD/MM/YYYY HH:mm');
}

/** Validates one participant's 5 picks against the round's window. Returns
 *  the normalized entries (sorted by date) or throws. */
export function validateAvailability(raw: unknown, window: { start: string; end: string }, opts: { allowFewer?: boolean } = {}): AvailabilityEntry[] {
  if (opts.allowFewer) {
    // The coordinator entering a late participant's dates after a call:
    // whatever they could give, 1..N.
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > DATES_PER_PARTICIPANT) {
      throw new ThesisExamError(`יש להזין בין 1 ל-${DATES_PER_PARTICIPANT} תאריכים.`, `Enter between 1 and ${DATES_PER_PARTICIPANT} dates.`);
    }
  } else if (!Array.isArray(raw) || raw.length !== DATES_PER_PARTICIPANT) {
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
    bodyHe: `התזה "${title.he}" אושרה. יש למנות ${examinerCountFor(m)} בוחנים לבחינה — המינוי יועבר לאישור ראש בית הספר ללימודים מתקדמים.`,
    bodyEn: `The thesis "${title.en}" was approved. Please nominate ${examinerCountFor(m)} examiners for the exam — the nomination goes to the head of the graduate school for approval.`,
  }, { pending: true });
  await notifyUsers(m.studentIds ?? [], doc, {
    titleHe: 'שלב הבחינה נפתח',
    titleEn: 'The exam stage has started',
    bodyHe: `המנחה ממנה כעת בוחנים לתזה "${title.he}". בהמשך תתבקש/י לבחור תאריכים ושעות שנוחים לך לבחינה.`,
    bodyEn: `Your supervisor is now nominating examiners for "${title.en}". Later you'll be asked to pick dates and hours that suit you for the exam.`,
  });
  await alertExamCommitteeConflict(ref.id, m, project, doc).catch((err) => console.error(`thesisExam: committee conflict alert failed on ${ref.id}:`, err));
}

/** The supervisor still sits on the committee that will judge the exam (no
 *  stand-in was picked for this project on an earlier milestone): the
 *  administrative coordinator is asked to pick one in her "Replace
 *  Committee Member" tab, which lists the exam (see committeeConflicts.ts).
 *  The exam isn't held — her pick joins the committee whenever it's made
 *  (refreshExamCommitteeForProject). */
async function alertExamCommitteeConflict(
  milestoneId: string,
  milestone: FirebaseFirestore.DocumentData,
  project: FirebaseFirestore.DocumentData,
  exam: ThesisExamDoc,
): Promise<void> {
  const committee = await resolveCommitteeForMilestone(milestone, project);
  if (!committee || findSupervisorConflicts(committee, project).length === 0) return;
  const title = projectTitle(project);
  const ids = await adminCoordinatorIds(exam.scope);
  await Promise.all(ids.map((recipientId) => notifyUser({
    recipientId,
    type: 'general',
    inAppType: 'committee_conflict_hold',
    titleHe: 'ניגוד עניינים בוועדת בחינת התזה — יש לבחור מחליף/ה',
    titleEn: 'Conflict of interest on a thesis exam committee — choose a replacement',
    bodyHe: `המנחה של "${title.he}" חבר/ה בוועדה שתבחן את התזה. יש לבחור מחליף/ה בלשונית "החלפת חבר ועדה" — המחליף/ה יחליף/תחליף את המנחה בוועדה לאורך כל הפרויקט.`,
    bodyEn: `The supervisor of "${title.en}" sits on the committee that will judge the thesis. Choose a replacement in the "Replace Committee Member" tab — they replace the supervisor on the committee for the whole project.`,
    relatedProjectId: exam.projectId,
    relatedMilestoneId: milestoneId,
    channels: { email: true, sms: false },
    targetScreen: 'admin_coordinator_committee_conflicts',
  }).catch((err) => console.error(`thesisExam: conflict alert to ${recipientId} failed:`, err))));
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
  const needed = examinerCountFor(milestone);
  if (!Array.isArray(raw) || raw.length !== needed) {
    throw new ThesisExamError(`יש למנות בדיוק ${needed} בוחנים.`, `Nominate exactly ${needed} examiners.`);
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
  // The project's own supervisor can't sit on the committee that judges
  // their student's exam (conflict of interest — same rule as the committee
  // stage's COI hold). They still take part, as the supervisor; their stand-in
  // (the project-wide one the administrative coordinator chose the first
  // time, or this milestone's own) is already swapped in by
  // resolveCommitteeForMilestone.
  const supervisorIds = [milestone.supervisorId, milestone.secondarySupervisorId].filter(Boolean) as string[];
  const committeeMemberIds = committee
    ? [...new Set([...(committee.memberIds ?? []), committee.chairmanId].filter(Boolean) as string[])].filter((id) => !supervisorIds.includes(id))
    : [];
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

/** Rebuilds the committee of the project's open exam(s) after a stand-in
 *  was chosen (see committeeController.applyProjectStandInEverywhere). The
 *  list is otherwise only built when a picking round opens. A member who
 *  joins after every examiner already submitted gets the same "forms are
 *  in" task the committee got then. */
export async function refreshExamCommitteeForProject(projectId: string): Promise<void> {
  const exams = await db.collection(THESIS_EXAMS).where('projectId', '==', projectId).get();
  for (const doc of exams.docs) {
    const exam = doc.data() as ThesisExamDoc;
    // Not at the picking round yet — openAvailabilityRound builds it then.
    if (!exam.participants?.length) continue;
    const msSnap = await db.collection('milestones').doc(exam.milestoneId).get();
    if (!msSnap.exists) continue;
    const { participants, committeeId, committeeMemberIds } = await buildParticipants(exam, msSnap.data()!);
    const before = exam.committeeMemberIds ?? [];
    const added = committeeMemberIds.filter((id) => !before.includes(id));
    const removed = before.filter((id) => !committeeMemberIds.includes(id));
    if (added.length === 0 && removed.length === 0 && committeeId === exam.committeeId) continue;
    await doc.ref.update({ participants, committeeId, committeeMemberIds, updatedAt: new Date().toISOString() });
  }
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
  const pickDeadline = dayjs(now).add(PICK_HOURS, 'hour').toISOString();
  await db.runTransaction(async (tx) => {
    tx.update(examRef(milestoneId), {
      status: EXAM_AVAILABILITY,
      participants,
      committeeId,
      committeeMemberIds,
      availabilityRound: round,
      window,
      availability: {},
      roundOpenedAt: now,
      pickDeadline,
      pickReminderSentAt: null,
      lateEntry: null,
      excludedKeys: [],
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
    bodyHe: `${lead.he}בחינת התזה "${title.he}": יש לבחור עד ${formatMoment(pickDeadline)} ${DATES_PER_PARTICIPANT} תאריכים בין ${formatDay(window.start)} ל-${formatDay(window.end)}, ובכל תאריך את השעות שבהן את/ה פנוי/ה. המערכת תקבע את המועד שמשותף לכולם.`,
    bodyEn: `${lead.en}Thesis exam "${title.en}": by ${formatMoment(pickDeadline)}, pick ${DATES_PER_PARTICIPANT} dates between ${formatDay(window.start)} and ${formatDay(window.end)}, and the hours you're free on each. The system sets the time everyone shares.`,
  }, { pending: true });
}

export async function submitAvailability(
  milestoneId: string,
  participantKey: string,
  raw: unknown,
  opts: { enteredBy?: { uid: string; name: string } } = {},
): Promise<{ resolved: boolean }> {
  const loaded = await loadExam(milestoneId);
  if (!loaded) throw new ThesisExamError('בחינת התזה לא נמצאה.', 'Thesis exam not found.', 404);
  if (loaded.exam.status !== EXAM_AVAILABILITY || !loaded.exam.window) {
    throw new ThesisExamError('בחירת התאריכים אינה פתוחה כעת.', 'Date picking is not open right now.', 409);
  }
  if (!loaded.exam.participants.some((p) => p.key === participantKey)) {
    throw new ThesisExamError('אינך משתתף/ת בבחינה זו.', 'You are not a participant in this exam.', 403);
  }
  const entries = validateAvailability(raw, loaded.exam.window, { allowFewer: !!opts.enteredBy });
  const round = loaded.exam.availabilityRound;
  const stamp = opts.enteredBy ? { enteredById: opts.enteredBy.uid, enteredByName: opts.enteredBy.name } : {};
  const now = new Date().toISOString();

  // Write + "was that the last one?" in one transaction, so two last
  // submissions can't both (or neither) resolve the round.
  const outcome = await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(examRef(milestoneId))).data() as ThesisExamDoc | undefined;
    if (!fresh || fresh.status !== EXAM_AVAILABILITY || fresh.availabilityRound !== round) {
      throw new ThesisExamError('סבב בחירת התאריכים השתנה — יש לרענן ולנסות שוב.', 'The date-picking round changed — refresh and try again.', 409);
    }
    const availability = { ...fresh.availability, [participantKey]: { entries, submittedAt: now, ...stamp } };
    const allIn = fresh.participants.every((p) => availability[p.key]);
    if (!allIn) {
      // The whole map, not a dotted field path: an outside examiner's key
      // embeds their access token, whose charset includes '*' (invalid in a path).
      tx.update(examRef(milestoneId), { availability, updatedAt: now });
      return { kind: 'waiting' as const };
    }
    const slots = computeCommonSlots(fresh.participants.map((p) => availability[p.key]!.entries));
    if (slots.length === 0) {
      tx.update(examRef(milestoneId), { availability, commonSlots: [], slotIndex: 0, lateEntry: null, coordinatorTask: 'set_date', status: EXAM_DATE_COORDINATOR, updatedAt: now });
      tx.update(db.collection('milestones').doc(milestoneId), { status: EXAM_DATE_COORDINATOR, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return { kind: 'none' as const };
    }
    tx.update(examRef(milestoneId), { availability, commonSlots: slots, slotIndex: 0, slotSource: 'matched', lateEntry: null, coordinatorTask: 'set_hours', status: EXAM_DATE_COORDINATOR, updatedAt: now });
    tx.update(db.collection('milestones').doc(milestoneId), { status: EXAM_DATE_COORDINATOR, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { kind: 'matched' as const, slot: slots[0]! };
  });

  if (outcome.kind === 'waiting') return { resolved: false };
  if (outcome.kind === 'none') {
    await handToCoordinator(milestoneId, 'no_common_slot');
    return { resolved: true };
  }
  await askCoordinatorForHours(milestoneId, outcome.slot);
  return { resolved: true };
}


// ── Step 2a: the 48h deadline ────────────────────────────────────────────────

function missingParticipants(exam: ThesisExamDoc): Participant[] {
  return exam.participants.filter((p) => !exam.availability?.[p.key]);
}

/** One sweep tick for a round under the 48h rule: the 24h reminder, the
 *  hand-off to the administrative coordinator at the deadline, and — once
 *  her 24h are up — the match from whoever did pick. */
async function advancePickingRound(exam: ThesisExamDoc): Promise<void> {
  const missing = missingParticipants(exam);
  if (missing.length === 0 || !exam.pickDeadline) return; // resolved on the last submit
  const now = dayjs();
  if (exam.lateEntry) {
    if (!now.isBefore(dayjs(exam.lateEntry.deadline))) await matchWithoutMissing(exam.milestoneId);
    return;
  }
  if (!now.isBefore(dayjs(exam.pickDeadline))) {
    await startLateEntry(exam.milestoneId);
    return;
  }
  if (!exam.pickReminderSentAt && exam.roundOpenedAt && !now.isBefore(dayjs(exam.roundOpenedAt).add(PICK_REMINDER_HOURS, 'hour'))) {
    await examRef(exam.milestoneId).update({ pickReminderSentAt: now.toISOString() });
    const title = projectTitle(await projectOf(exam.projectId));
    await notifyParticipants(exam, {
      titleHe: 'תזכורת: יש לבחור תאריכים לבחינת התזה',
      titleEn: 'Reminder: pick your thesis exam dates',
      bodyHe: `טרם בחרת תאריכים לבחינת התזה "${title.he}". יש לבחור ${DATES_PER_PARTICIPANT} תאריכים עד ${formatMoment(exam.pickDeadline)}.`,
      bodyEn: `You haven't picked dates for the thesis exam "${title.en}" yet. Pick ${DATES_PER_PARTICIPANT} dates by ${formatMoment(exam.pickDeadline)}.`,
    }, { pending: true, onlyKeys: missing.map((p) => p.key) });
  }
}

/** Deadline passed with someone missing: the administrative coordinator
 *  gets LATE_ENTRY_HOURS to reach them and enter their dates. */
async function startLateEntry(milestoneId: string): Promise<void> {
  const startedAt = new Date().toISOString();
  const deadline = dayjs(startedAt).add(LATE_ENTRY_HOURS, 'hour').toISOString();
  const missingKeys = await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(examRef(milestoneId))).data() as ThesisExamDoc | undefined;
    if (!fresh || fresh.status !== EXAM_AVAILABILITY || fresh.lateEntry) return null;
    const keys = missingParticipants(fresh).map((p) => p.key);
    if (keys.length === 0) return null;
    tx.update(examRef(milestoneId), { lateEntry: { startedAt, deadline, missingKeys: keys }, updatedAt: startedAt });
    return keys;
  });
  if (!missingKeys) return;
  const loaded = await loadExam(milestoneId);
  if (!loaded) return;
  const title = projectTitle(await projectOf(loaded.exam.projectId));
  const names = loaded.exam.participants.filter((p) => missingKeys.includes(p.key)).map((p) => p.name).join(', ');
  await notifyUsers(await adminCoordinatorIds(loaded.exam.scope), loaded.exam, {
    titleHe: 'משתתפים לא בחרו תאריכים לבחינת תזה',
    titleEn: "Participants didn't pick thesis exam dates",
    bodyHe: `בבחינת התזה "${title.he}" לא בחרו תאריכים בזמן: ${names}. יש ליצור איתם קשר ולהזין את התאריכים שלהם עד ${formatMoment(deadline)} — אחרת המערכת תקבע מועד לפי מי שכן בחרו.`,
    bodyEn: `For the thesis exam "${title.en}", these participants didn't pick dates in time: ${names}. Contact them and enter their dates by ${formatMoment(deadline)} — otherwise the system sets the time from those who did pick.`,
  }, { pending: true });
  await notifyParticipants(loaded.exam, {
    titleHe: 'המועד האחרון לבחירת תאריכים עבר',
    titleEn: 'The date-picking deadline has passed',
    bodyHe: `לא בחרת תאריכים לבחינת התזה "${title.he}". הרכזת האדמיניסטרטיבית תיצור איתך קשר. עדיין ניתן לבחור בעצמך עד ${formatMoment(deadline)}; לאחר מכן המועד ייקבע ללא התאריכים שלך.`,
    bodyEn: `You didn't pick dates for the thesis exam "${title.en}". The administrative coordinator will contact you. You can still pick yourself until ${formatMoment(deadline)}; after that the time is set without your dates.`,
  }, { pending: true, onlyKeys: missingKeys });
}

/** The coordinator's 24h are up: match from everyone who picked; the rest
 *  are left out (excludedKeys). No overlap → the coordinator sets it. */
async function matchWithoutMissing(milestoneId: string): Promise<void> {
  const now = new Date().toISOString();
  const outcome = await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(examRef(milestoneId))).data() as ThesisExamDoc | undefined;
    if (!fresh || fresh.status !== EXAM_AVAILABILITY || !fresh.lateEntry || dayjs().isBefore(dayjs(fresh.lateEntry.deadline))) return null;
    const picked = fresh.participants.filter((p) => fresh.availability?.[p.key]);
    const excludedKeys = missingParticipants(fresh).map((p) => p.key);
    const slots = picked.length > 0 ? computeCommonSlots(picked.map((p) => fresh.availability[p.key]!.entries)) : [];
    const base = { lateEntry: null, excludedKeys, commonSlots: slots, slotIndex: 0, updatedAt: now };
    if (slots.length === 0) {
      tx.update(examRef(milestoneId), { ...base, coordinatorTask: 'set_date', status: EXAM_DATE_COORDINATOR });
      tx.update(db.collection('milestones').doc(milestoneId), { status: EXAM_DATE_COORDINATOR, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return { kind: 'none' as const, excludedKeys };
    }
    tx.update(examRef(milestoneId), { ...base, slotSource: 'matched', coordinatorTask: 'set_hours', status: EXAM_DATE_COORDINATOR });
    tx.update(db.collection('milestones').doc(milestoneId), { status: EXAM_DATE_COORDINATOR, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { kind: 'matched' as const, slot: slots[0]!, excludedKeys };
  });
  if (!outcome) return;
  const loaded = await loadExam(milestoneId);
  if (loaded) {
    const title = projectTitle(await projectOf(loaded.exam.projectId));
    await notifyParticipants(loaded.exam, {
      titleHe: 'מועד הבחינה ייקבע ללא התאריכים שלך',
      titleEn: 'The exam time is being set without your dates',
      bodyHe: `לא התקבלו תאריכים ממך לבחינת התזה "${title.he}", ולכן המועד נקבע לפי שאר המשתתפים. תישלח הודעה כשהמועד יאושר.`,
      bodyEn: `No dates came in from you for the thesis exam "${title.en}", so the time is set from the other participants. You'll be notified once it's approved.`,
    }, { onlyKeys: outcome.excludedKeys });
  }
  if (outcome.kind === 'none') await handToCoordinator(milestoneId, 'no_common_slot');
  else await askCoordinatorForHours(milestoneId, outcome.slot);
}

/** The administrative coordinator enters a late participant's dates (after
 *  talking to them) while the late-entry window is open. `participantIndex`
 *  is the participant's position in the round's list — never the key, which
 *  for an outside examiner embeds their access token. */
export async function enterLateParticipantDates(
  milestoneId: string,
  actor: { uid: string; name: string },
  participantIndex: unknown,
  raw: unknown,
): Promise<{ resolved: boolean }> {
  const loaded = await loadExam(milestoneId);
  if (!loaded) throw new ThesisExamError('בחינת התזה לא נמצאה.', 'Thesis exam not found.', 404);
  const { exam } = loaded;
  if (!(await adminCoordinatorIds(exam.scope, true)).includes(actor.uid)) {
    throw new ThesisExamError('רק הרכזת האדמיניסטרטיבית רשאית להזין תאריכים עבור משתתף.', 'Only the administrative coordinator may enter dates for a participant.', 403);
  }
  if (exam.status !== EXAM_AVAILABILITY || !exam.lateEntry || !dayjs().isBefore(dayjs(exam.lateEntry.deadline))) {
    throw new ThesisExamError('הזמן להזנת תאריכים עבור משתתפים שלא בחרו אינו פתוח כעת.', 'Entering dates for late participants is not open right now.', 409);
  }
  const p = typeof participantIndex === 'number' && Number.isInteger(participantIndex) ? exam.participants[participantIndex] : undefined;
  if (!p) throw new ThesisExamError('המשתתף לא נמצא.', 'Participant not found.', 404);
  if (exam.availability?.[p.key]) throw new ThesisExamError(`${p.name} כבר בחר/ה תאריכים.`, `${p.name} has already picked dates.`, 409);
  return submitAvailability(milestoneId, p.key, raw, { enteredBy: actor });
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
async function handToCoordinator(milestoneId: string, why: 'no_common_slot' | 'slots_rejected' | 'slots_passed'): Promise<void> {
  const now = new Date().toISOString();
  await examRef(milestoneId).update({ status: EXAM_DATE_COORDINATOR, coordinatorTask: 'set_date', updatedAt: now });
  await db.collection('milestones').doc(milestoneId).update({ status: EXAM_DATE_COORDINATOR, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  const loaded = await loadExam(milestoneId);
  if (!loaded) return;
  const title = projectTitle(await projectOf(loaded.milestone.projectId));
  const reason = why === 'no_common_slot'
    ? { he: 'לא נמצא מועד ושעות המשותפים לכל המשתתפים', en: 'No date and hours were common to every participant' }
    : why === 'slots_passed'
      ? { he: 'המועדים המשותפים שנמצאו כבר עברו', en: 'The common times found have already passed' }
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
    const record = { ...slot, note, setById: actor.uid, setByName: actor.name, setAt: now };
    if (fresh.coordinatorTask === 'set_hours') {
      // A common window was found: the hours must sit inside it, on its day.
      const win = fresh.commonSlots[fresh.slotIndex];
      if (!win) throw new ThesisExamError('המועד המשותף לא נמצא.', 'The common time was not found.', 409);
      if (date !== win.date || from < win.from || to > win.to) {
        throw new ThesisExamError(
          `יש לקבוע את שעות הבחינה בתוך המועד המשותף: ${formatSlot(win)}.`,
          `Set the exam hours inside the common time: ${formatSlot(win)}.`,
        );
      }
      const commonSlots = fresh.commonSlots.map((s, i) => (i === fresh.slotIndex ? slot : s));
      tx.update(examRef(milestoneId), {
        status: EXAM_DATE_REVIEW,
        commonSlots,
        slotSource: 'matched',
        coordinatorTask: null,
        coordinatorSlots: admin.firestore.FieldValue.arrayUnion({ ...record, window: win }),
        updatedAt: now,
      });
      tx.update(db.collection('milestones').doc(milestoneId), { status: EXAM_DATE_REVIEW, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return;
    }
    tx.update(examRef(milestoneId), {
      status: EXAM_DATE_REVIEW,
      commonSlots: [slot],
      slotIndex: 0,
      slotSource: 'coordinator',
      coordinatorTask: null,
      coordinatorSlots: admin.firestore.FieldValue.arrayUnion(record),
      updatedAt: now,
    });
    tx.update(db.collection('milestones').doc(milestoneId), { status: EXAM_DATE_REVIEW, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  await notifyDateReviewer(milestoneId, 'program_head', slot);
}

/** Can an exam of MIN_EXAM_MINUTES still start inside this window? */
function windowStillUsable(slot: ExamSlot): boolean {
  return !slotHasStarted({ date: slot.date, from: clockOf(minutesOf(slot.to) - MIN_EXAM_MINUTES) });
}

/** The next common window after `fromIndex` an exam can still fit in, or -1. */
function nextFutureSlotIndex(slots: ExamSlot[], fromIndex: number): number {
  for (let i = fromIndex; i < slots.length; i++) if (windowStillUsable(slots[i]!)) return i;
  return -1;
}

/** A common window was found: the administrative coordinator sets the exam
 *  hours inside it; then the program head and the grad school head approve. */
async function askCoordinatorForHours(milestoneId: string, window: ExamSlot): Promise<void> {
  const loaded = await loadExam(milestoneId);
  if (!loaded) return;
  const title = projectTitle(await projectOf(loaded.milestone.projectId));
  await notifyUsers(await adminCoordinatorIds(loaded.exam.scope), loaded.exam, {
    titleHe: 'נמצא מועד משותף — יש לקבוע את שעות הבחינה',
    titleEn: 'Common time found — set the exam hours',
    bodyHe: `לבחינת התזה "${title.he}" נמצא מועד משותף: ${formatSlot(window)}. יש לקבוע את שעות הבחינה בתוך הטווח — הן יועברו לאישור ראש התוכנית וראש בית הספר.`,
    bodyEn: `A common time was found for the thesis exam "${title.en}": ${formatSlot(window)}. Set the exam hours inside it — they go to the program head and the grad school head for approval.`,
  }, { pending: true });
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
      tx.update(examRef(milestoneId), { status: EXAM_DATE_COORDINATOR, coordinatorTask: 'set_hours', slotIndex: next, rejectedSlots: admin.firestore.FieldValue.arrayUnion(rejection), updatedAt: now });
      tx.update(msRef, { status: EXAM_DATE_COORDINATOR, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return { kind: 'next_slot' as const, slot: fresh.commonSlots[next]! };
    }
    tx.update(examRef(milestoneId), { rejectedSlots: admin.firestore.FieldValue.arrayUnion(rejection), updatedAt: now });
    return { kind: 'exhausted' as const };
  });

  if (result.kind === 'to_grad_head') return notifyDateReviewer(milestoneId, 'grad_school_head', slot);
  if (result.kind === 'next_slot') return askCoordinatorForHours(milestoneId, result.slot);
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
// the header (student, ID, academic unit, supervisors, topic, exam date).
// Each examiner fills five 1–10 ratings and general comments. The three grade
// components each have ONE owner (per the CS faculty, 2026-11-17):
//   • research (40%) — the SUPERVISOR alone, based on their opinion. Examiners
//     never see or fill it.
//   • writing (40%)  — each examiner, on their own form; the average counts.
//   • defense (20%)  — nobody types it: each examiner's average of ratings
//     1–5 (×10), averaged over every examiner who submitted.
// Stored in `thesisExamForms` (server-only, like thesisExams): one doc per
// examiner plus one for the supervisor's grade, each digitally signed. The
// committee sees every form and the combined grade once all examiners
// submitted.

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
    { key: 'research', labelHe: 'מחקר על סמך חוות דעת המנחה', labelEn: "Research, based on the supervisor's opinion", weight: 40, source: 'supervisor' },
    { key: 'writing', labelHe: 'כתיבת התזה', labelEn: 'Writing the thesis', weight: 40, source: 'examiner' },
    { key: 'defense', labelHe: 'מבחן ההגנה על התזה', labelEn: 'The thesis defense exam', weight: 20, source: 'computed' },
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
  /** Only the examiner-owned components (`writing`). Forms sent before the
   *  2026-11-18 split also hold research/defense — ignored everywhere. */
  components: Record<string, number>;
  /** This examiner's share of the defense component: mean(q1..q5) × 10. */
  defenseContribution?: number;
  /** Legacy (pre-split) per-examiner total. Not used any more. */
  finalGrade?: number;
  submittedAt: string;
  signature: EvaluationSignature;
}

/** The supervisor's research grade — one per exam, signed. */
export interface StoredSupervisorExamGrade {
  milestoneId: string;
  supervisorUid: string;
  supervisorName: string;
  research: number;
  submittedAt: string;
  signature: EvaluationSignature;
}

const formDocId = (milestoneId: string, key: string) => `${milestoneId}__${key}`;
const SUPERVISOR_GRADE_KEY = 'supervisor';

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** mean(q1..q5) on the 1–10 scale, as a 0–100 score. */
export function defenseContributionOf(ratings: Record<string, number>): number {
  return round1(mean(CS_THESIS_EXAM_FORM.questions.map((q) => Number(ratings[q.key] ?? 0))) * 10);
}

export interface ExamGradeSummary {
  research: number | null;
  writing: number | null;
  defense: number | null;
  /** Weighted total — null until the supervisor's grade and every examiner's
   *  form are in. */
  finalGrade: number | null;
}

export function computeExamGradeSummary(exam: ThesisExamDoc, forms: Record<string, StoredExamForm>, supervisor: StoredSupervisorExamGrade | null): ExamGradeSummary {
  const submitted = Object.values(forms);
  const writing = submitted.map((f) => f.components?.writing).filter((v): v is number => typeof v === 'number');
  const defense = submitted.map((f) => f.defenseContribution ?? defenseContributionOf(f.ratings));
  const parts: Record<'research' | 'writing' | 'defense', number | null> = {
    research: supervisor ? supervisor.research : null,
    writing: writing.length ? round1(mean(writing)) : null,
    defense: defense.length ? round1(mean(defense)) : null,
  };
  const allIn = exam.examiners.length > 0 && exam.examiners.every((e) => !!forms[e.key]);
  const finalGrade = allIn && parts.research != null && parts.writing != null && parts.defense != null
    ? round1(CS_THESIS_EXAM_FORM.gradeComponents.reduce((sum, c) => sum + (parts[c.key] ?? 0) * c.weight, 0) / 100)
    : null;
  return { research: parts.research, writing: parts.writing, defense: parts.defense, finalGrade };
}

export async function loadSupervisorExamGrade(milestoneId: string): Promise<StoredSupervisorExamGrade | null> {
  const snap = await db.collection(THESIS_EXAM_FORMS).doc(formDocId(milestoneId, SUPERVISOR_GRADE_KEY)).get();
  return snap.exists ? (snap.data() as StoredSupervisorExamGrade) : null;
}

/** The supervisor may give the research grade once the exam is scheduled
 *  (it does not depend on the exam itself) and while the committee reviews. */
export function supervisorGradeOpen(exam: ThesisExamDoc): boolean {
  return exam.status === EXAM_SCHEDULED || exam.status === EXAM_COMMITTEE_REVIEW || exam.status === EXAM_GRADES_PENDING;
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
  if (EXAM_FORMS_DONE_STATUSES.includes(exam.status)) return { open: false, he: 'כל הבוחנים הגישו את הטופס — הטופס נעול.', en: 'Every examiner has submitted — the form is locked.' };
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

export type ExamFormViewer = { kind: 'examiner'; key: string } | { kind: 'reviewer' } | { kind: 'supervisor' };

/** An examiner sees only their own form — never the supervisor's research
 *  grade; the supervisor sees only their own grade (not the examiners'
 *  forms); a reviewer (committee member, grad school head, program head) sees
 *  every submitted form, the supervisor's grade and the combined result. */
export async function buildExamFormView(milestoneId: string, viewer: ExamFormViewer) {
  const loaded = await loadExam(milestoneId);
  if (!loaded) throw new ThesisExamError('בחינת התזה לא נמצאה.', 'Thesis exam not found.', 404);
  const { exam, milestone } = loaded;
  const [forms, supervisorGrade] = await Promise.all([loadExamForms(exam), loadSupervisorExamGrade(milestoneId)]);
  const gate = examFormGate(exam);
  const sig = (s: EvaluationSignature) => ({ ...s, signerUid: undefined, digest: undefined });
  // Only the examiner-owned components leave the server — a pre-split form's
  // research/defense numbers are dropped, never shown.
  const examinerKeys = CS_THESIS_EXAM_FORM.gradeComponents.filter((c) => c.source === 'examiner').map((c) => c.key as string);
  const strip = (f: StoredExamForm) => ({
    ...f,
    key: undefined,
    finalGrade: undefined,
    components: Object.fromEntries(examinerKeys.filter((k) => typeof f.components?.[k] === 'number').map((k) => [k, f.components[k]!])),
    defenseContribution: f.defenseContribution ?? defenseContributionOf(f.ratings),
    signature: sig(f.signature),
  });
  const supervisorOpen = supervisorGradeOpen(exam);
  const supervisorView = supervisorGrade
    ? { research: supervisorGrade.research, supervisorName: supervisorGrade.supervisorName, submittedAt: supervisorGrade.submittedAt, signature: sig(supervisorGrade.signature) }
    : null;
  const canEdit = viewer.kind === 'examiner' ? gate.open && !forms[viewer.key]
    : viewer.kind === 'supervisor' ? supervisorOpen && !supervisorGrade
    : false;
  const locked = viewer.kind === 'supervisor'
    ? (supervisorOpen ? null : { he: 'ציון המנחה ייפתח לאחר שייקבע מועד הבחינה.', en: "The supervisor's grade opens once the exam date is set." })
    : (gate.open ? null : { he: gate.he, en: gate.en });
  return {
    milestoneId,
    viewerKind: viewer.kind,
    form: CS_THESIS_EXAM_FORM,
    header: await examFormHeader(milestone, exam),
    status: exam.status,
    canEdit,
    lockedReasonHe: locked?.he ?? null,
    lockedReasonEn: locked?.en ?? null,
    submittedCount: Object.keys(forms).length,
    examinerCount: exam.examiners.length,
    mine: viewer.kind === 'examiner' && forms[viewer.key] ? strip(forms[viewer.key]!) : null,
    supervisorGrade: viewer.kind === 'supervisor' || viewer.kind === 'reviewer' ? supervisorView : null,
    summary: viewer.kind === 'reviewer' ? computeExamGradeSummary(exam, forms, supervisorGrade) : null,
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
  // The examiner fills only the components they own; anything else in the
  // body (research = the supervisor's, defense = computed) is ignored.
  const components: Record<string, number> = {};
  for (const c of CS_THESIS_EXAM_FORM.gradeComponents.filter((g) => g.source === 'examiner')) {
    const v = Number(body.components?.[c.key]);
    if (!Number.isFinite(v) || v < 1 || v > 100) throw new ThesisExamError(`יש לתת ציון בין 1 ל-100 ל"${c.labelHe}".`, `Give "${c.labelEn}" a score from 1 to 100.`);
    components[c.key] = Math.round(v * 10) / 10;
  }
  const comments = typeof body.comments === 'string' ? body.comments.trim().slice(0, 20000) : '';
  const defenseContribution = defenseContributionOf(ratings);
  const signature = await signEvaluation({
    milestoneId,
    signerUid: examiner.key,
    signerName: examiner.name,
    role: 'examiner',
    positionHe: 'שופט/ת',
    positionEn: 'Judge',
    facultyId: exam.facultyId,
    scores: { thesisExamForm: { ratings, comments, components, defenseContribution } },
  });
  const stored: StoredExamForm = { milestoneId, key: examiner.key, examinerName: examiner.name, external: examiner.external, ratings, comments, components, defenseContribution, submittedAt: new Date().toISOString(), signature };

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
      tx.update(examRef(milestoneId), { status: EXAM_GRADES_PENDING, updatedAt: new Date().toISOString() });
      tx.update(db.collection('milestones').doc(milestoneId), { status: EXAM_GRADES_PENDING, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    return done;
  });
  if (allIn) await advanceExamGrading(milestoneId);
  return { allIn };
}

/** The supervisor's research grade (40%). Only the project's supervisor (or
 *  additional supervisor); once, signed — like the examiners' forms. */
export async function submitSupervisorExamGrade(milestoneId: string, supervisor: { uid: string; name: string }, raw: unknown): Promise<void> {
  const loaded = await loadExam(milestoneId);
  if (!loaded) throw new ThesisExamError('בחינת התזה לא נמצאה.', 'Thesis exam not found.', 404);
  const { exam, milestone } = loaded;
  if (![milestone.supervisorId, milestone.secondarySupervisorId].includes(supervisor.uid)) {
    throw new ThesisExamError('רק מנחה הפרויקט רשאי/ת לתת את ציון המחקר.', "Only the project's supervisor may give the research grade.", 403);
  }
  if (!supervisorGradeOpen(exam)) throw new ThesisExamError('ציון המנחה ייפתח לאחר שייקבע מועד הבחינה.', "The supervisor's grade opens once the exam date is set.", 409);
  const v = Number((raw as { research?: unknown } | null)?.research);
  if (!Number.isFinite(v) || v < 1 || v > 100) throw new ThesisExamError('יש לתת ציון מחקר בין 1 ל-100.', 'Give the research grade a score from 1 to 100.');
  const research = round1(v);
  const signature = await signEvaluation({
    milestoneId,
    signerUid: supervisor.uid,
    signerName: supervisor.name,
    role: 'supervisor',
    positionHe: 'מנחה',
    positionEn: 'Supervisor',
    facultyId: exam.facultyId,
    scores: { thesisExamSupervisorGrade: { research } },
  });
  const stored: StoredSupervisorExamGrade = { milestoneId, supervisorUid: supervisor.uid, supervisorName: supervisor.name, research, submittedAt: new Date().toISOString(), signature };
  const ref = db.collection(THESIS_EXAM_FORMS).doc(formDocId(milestoneId, SUPERVISOR_GRADE_KEY));
  await db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) throw new ThesisExamError('ציון המנחה כבר ניתן.', "The supervisor's grade was already given.", 409);
    tx.set(ref, stored);
  });
  await advanceExamGrading(milestoneId);
}

// ── Final grade: breakdown → grad school head → administrative coordinator ──

/** 75 and above is good enough (faculty, 2026-11-19); below it, the grad
 *  school head's approval sends the thesis back to the supervisor for more
 *  work with the student. WHICH milestone it returns to is not set yet — it
 *  parks at exam_returned_to_supervisor until the faculty says. */
export const MIN_PASSING_FINAL_GRADE: number | null = 75;

/** The template the exam milestone was enrolled from: the project ref whose
 *  template has this exam milestone. A project's projectType can disagree
 *  with its milestones (thesis "111" is stored as 'project'), so the plain
 *  degree/projectType lookup would read the wrong template's percentages. */
async function templateMilestonesForExam(project: FirebaseFirestore.DocumentData, milestone: FirebaseFirestore.DocumentData): Promise<WorkflowMilestoneSpec[]> {
  const refs = (project.workflowTemplateRefs ?? []) as Array<{ templateId: string }>;
  for (const ref of refs) {
    const resolved = await getMilestonesForTemplateId(ref.templateId).catch(() => null);
    if (resolved?.milestones.some((m) => m.type === milestone.type && m.thesisExamFlow)) return resolved.milestones;
  }
  return resolveProjectTemplateMilestones(project as never);
}

/** Builds how the final grade is made: every template milestone with its
 *  weight and each student's grade on it (the exam's own grade = research 40
 *  + writing 40 + defense 20), and each student's weighted final grade.
 *  `missing` says what still has no grade. */
export async function buildExamGradeBreakdown(exam: ThesisExamDoc, milestone: FirebaseFirestore.DocumentData): Promise<ExamGradeBreakdown> {
  const project = await projectOf(milestone.projectId);
  const [forms, supervisorGrade, template, siblingsSnap] = await Promise.all([
    loadExamForms(exam),
    loadSupervisorExamGrade(exam.milestoneId),
    templateMilestonesForExam(project, milestone),
    db.collection('milestones').where('projectId', '==', milestone.projectId).get(),
  ]);
  const summary = computeExamGradeSummary(exam, forms, supervisorGrade);
  const studentIds: string[] = milestone.studentIds ?? [];
  const students = await Promise.all(studentIds.map(async (id) => ({ id, name: await userName(id) })));
  const siblings = siblingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as FirebaseFirestore.DocumentData & { id: string });
  const missing: Array<{ he: string; en: string }> = [];
  if (summary.research == null) missing.push({ he: 'ציון המחקר של המנחה (40%)', en: "The supervisor's research grade (40%)" });
  if (!exam.examiners.every((e) => !!forms[e.key])) missing.push({ he: 'טופס של כל הבוחנים', en: "Every examiner's form" });

  const rows: ExamGradeBreakdownRow[] = [...template]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((t) => {
      const isExam = t.type === milestone.type;
      const actual = siblings.find((m) => m.type === t.type && studentIds.some((s) => (m.studentIds ?? []).includes(s)));
      const percent = t.percentOfFinalGrade ?? (t.type === 'defense' ? 100 : 0);
      const grades = Object.fromEntries(studentIds.map((sid) => {
        if (isExam) return [sid, summary.finalGrade];
        const g = actual?.finalGradeByStudent?.[sid] ?? actual?.finalGrade;
        return [sid, typeof g === 'number' ? g : null];
      })) as Record<string, number | null>;
      if (percent > 0 && !isExam && studentIds.some((sid) => grades[sid] == null)) {
        missing.push({ he: `ציון אבן הדרך "${t.nameHe}"`, en: `The grade of the "${t.nameEn || t.nameHe}" milestone` });
      }
      return { type: t.type, nameHe: t.nameHe, nameEn: t.nameEn || t.nameHe, percent, isExam, grades };
    });

  // Without weights the engine would return 0, not "unknown".
  if (!rows.some((r) => r.isExam)) missing.push({ he: 'אבן הדרך של הבחינה אינה מופיעה בתבנית התהליך', en: "The exam milestone isn't in the workflow template" });
  if (rows.reduce((sum, r) => sum + r.percent, 0) <= 0) missing.push({ he: 'בתבנית התהליך אין משקלות לאבני הדרך', en: 'The workflow template gives no milestone a weight' });

  const finalGradeByStudent = Object.fromEntries(studentIds.map((sid) => [sid, computeProjectFinalGrade(
    rows.map((r) => ({ type: r.type, percentOfFinalGrade: r.percent })),
    rows.map((r) => ({ type: r.type, finalGrade: r.grades[sid] ?? null })),
  )])) as Record<string, number | null>;

  return {
    computedAt: new Date().toISOString(),
    students,
    rows,
    exam: { research: summary.research, writing: summary.writing, defense: summary.defense, examGrade: summary.finalGrade },
    finalGradeByStudent,
    missing,
  };
}

const WAITING_FOR_GRADES = [EXAM_COMMITTEE_REVIEW, EXAM_GRADES_PENDING];

/** Moves an exam whose examiners all submitted towards the grad school
 *  head: computes the breakdown and, once nothing is missing, hands it over
 *  (frozen as `gradeBreakdown`). Idempotent — called after the last form,
 *  after the supervisor's grade, and by the hourly sweep (which also moves
 *  exams left at the retired exam_committee_review step). */
export async function advanceExamGrading(milestoneId: string): Promise<void> {
  const loaded = await loadExam(milestoneId);
  if (!loaded) return;
  const { exam, milestone } = loaded;
  if (!WAITING_FOR_GRADES.includes(exam.status)) return;
  const breakdown = await buildExamGradeBreakdown(exam, milestone);
  const complete = breakdown.missing.length === 0 && Object.values(breakdown.finalGradeByStudent).every((g) => g != null);
  const next = complete ? EXAM_GRADE_REVIEW : EXAM_GRADES_PENDING;
  const moved = await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(examRef(milestoneId))).data() as ThesisExamDoc | undefined;
    if (!fresh || fresh.status !== exam.status) return false;
    if (fresh.status === next) return false;
    tx.update(examRef(milestoneId), { status: next, ...(complete ? { gradeBreakdown: breakdown } : {}), updatedAt: new Date().toISOString() });
    tx.update(db.collection('milestones').doc(milestoneId), { status: next, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return true;
  });
  if (!moved) return;
  const title = projectTitle(await projectOf(milestone.projectId));
  const supervisors = [milestone.supervisorId, milestone.secondarySupervisorId].filter(Boolean) as string[];
  if (!complete) {
    if (breakdown.exam.research == null) {
      await notifyUsers(supervisors, exam, {
        titleHe: 'יש לתת את ציון המחקר',
        titleEn: 'Give the research grade',
        bodyHe: `הבוחנים הגישו את הטפסים על התזה "${title.he}". הציון הסופי יחושב ויעבור לאישור ראש בית הספר ללימודים מתקדמים לאחר שתיתן/י את ציון המחקר (40%).`,
        bodyEn: `The examiners submitted their forms on "${title.en}". The final grade is computed and sent to the grad school head once you give the research grade (40%).`,
      }, { pending: true });
    }
    await notifyUsers([...supervisors, ...(milestone.studentIds ?? [])], exam, {
      titleHe: 'הבחינה הסתיימה — הציון הסופי בחישוב',
      titleEn: 'Exam finished — the final grade is being completed',
      bodyHe: `הבוחנים הגישו את הטפסים על התזה "${title.he}". הציון הסופי יחושב ויעבור לאישור.`,
      bodyEn: `The examiners submitted their forms on "${title.en}". The final grade will be computed and sent for approval.`,
    });
    return;
  }
  await notifyUsers(await gradSchoolHeadIds(exam.scope), exam, {
    titleHe: 'ציון סופי של תזה ממתין לאישורך',
    titleEn: 'A thesis final grade awaits your approval',
    bodyHe: `הציון הסופי של התזה "${title.he}" חושב לפי משקלות אבני הדרך. יש לעיין בפירוט ולאשר או לדחות.`,
    bodyEn: `The final grade of the thesis "${title.en}" was computed from the milestone weights. Review the breakdown and approve or deny it.`,
  }, { pending: true });
  await notifyUsers([...supervisors, ...(milestone.studentIds ?? [])], exam, {
    titleHe: 'הציון הסופי הועבר לאישור',
    titleEn: 'The final grade was sent for approval',
    bodyHe: `הציון הסופי של התזה "${title.he}" הועבר לאישור ראש בית הספר ללימודים מתקדמים.`,
    bodyEn: `The final grade of the thesis "${title.en}" was sent to the grad school head for approval.`,
  });
}

/** The grad school head approves or denies the computed final grade. */
export async function reviewExamFinalGrade(
  milestoneId: string,
  actor: { uid: string; name: string },
  decision: 'approve' | 'deny',
  reasonRaw: unknown,
): Promise<{ status: string }> {
  const loaded = await loadExam(milestoneId);
  if (!loaded) throw new ThesisExamError('בחינת התזה לא נמצאה.', 'Thesis exam not found.', 404);
  const { exam, milestone } = loaded;
  if (exam.status !== EXAM_GRADE_REVIEW || !exam.gradeBreakdown) throw new ThesisExamError('הציון אינו ממתין לאישורך.', "The grade isn't awaiting your approval.", 409);
  const reason = typeof reasonRaw === 'string' ? reasonRaw.trim().slice(0, 5000) : '';
  if (decision === 'deny' && !reason) throw new ThesisExamError('יש לכתוב את סיבת הדחייה.', 'Write the reason for denying.');
  const grades = Object.values(exam.gradeBreakdown.finalGradeByStudent).filter((g): g is number => g != null);
  const tooLow = decision === 'approve' && MIN_PASSING_FINAL_GRADE != null && grades.some((g) => g < MIN_PASSING_FINAL_GRADE!);
  const next = decision === 'deny' ? EXAM_GRADE_DENIED : tooLow ? EXAM_RETURNED_TO_SUPERVISOR : EXAM_COORDINATOR_APPROVAL;
  const signature = decision === 'approve' ? await signEvaluation({
    milestoneId,
    signerUid: actor.uid,
    signerName: actor.name,
    role: 'grad_school_head',
    positionHe: 'ראש בית הספר ללימודים מתקדמים — אישור הציון הסופי',
    positionEn: 'Grad school head — final grade approval',
    facultyId: exam.facultyId,
    scores: { thesisExamFinalGrade: exam.gradeBreakdown.finalGradeByStudent },
  }) : null;
  const gradeReview: ExamGradeReview = { decision, reason, byUid: actor.uid, byName: actor.name, at: new Date().toISOString(), ...(signature ? { signature } : {}) };
  await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(examRef(milestoneId))).data() as ThesisExamDoc | undefined;
    if (!fresh || fresh.status !== EXAM_GRADE_REVIEW) throw new ThesisExamError('הציון כבר טופל.', 'The grade was already handled.', 409);
    tx.update(examRef(milestoneId), { status: next, gradeReview, updatedAt: gradeReview.at });
    tx.update(db.collection('milestones').doc(milestoneId), { status: next, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  const title = projectTitle(await projectOf(milestone.projectId));
  const supervisors = [milestone.supervisorId, milestone.secondarySupervisorId].filter(Boolean) as string[];
  const students: string[] = milestone.studentIds ?? [];
  if (next === EXAM_COORDINATOR_APPROVAL) {
    await notifyUsers(await adminCoordinatorIds(exam.scope), exam, {
      titleHe: 'ציון סופי של תזה ממתין לאישור סופי',
      titleEn: 'A thesis final grade awaits final approval',
      bodyHe: `ראש בית הספר ללימודים מתקדמים אישר/ה את הציון הסופי של התזה "${title.he}". יש לאשר סופית לפני העברת הציון למכלול.`,
      bodyEn: `The grad school head approved the final grade of the thesis "${title.en}". Give the final approval before the grade goes to Michlol.`,
    }, { pending: true });
    await notifyUsers([...supervisors, ...students], exam, {
      titleHe: 'הציון הסופי אושר ע"י ראש בית הספר',
      titleEn: 'The grad school head approved the final grade',
      bodyHe: `הציון הסופי של התזה "${title.he}" אושר וממתין לאישור הסופי של הרכזת האדמיניסטרטיבית.`,
      bodyEn: `The final grade of the thesis "${title.en}" was approved and awaits the administrative coordinator's final approval.`,
    });
  } else if (next === EXAM_RETURNED_TO_SUPERVISOR) {
    await notifyUsers(supervisors, exam, {
      titleHe: 'התזה חוזרת אליך להמשך עבודה',
      titleEn: 'The thesis returns to you for more work',
      bodyHe: `הציון הסופי של התזה "${title.he}" נמוך מהנדרש. יש להמשיך לעבוד עם הסטודנט/ית.${reason ? ` ${reason}` : ''}`,
      bodyEn: `The final grade of the thesis "${title.en}" is below what is required. Continue working with the student.${reason ? ` ${reason}` : ''}`,
    }, { pending: true });
  } else {
    await notifyUsers([...supervisors, ...(await adminCoordinatorIds(exam.scope))], exam, {
      titleHe: 'הציון הסופי נדחה ע"י ראש בית הספר',
      titleEn: 'The grad school head denied the final grade',
      bodyHe: `ראש בית הספר ללימודים מתקדמים דחה/תה את הציון הסופי של התזה "${title.he}": ${reason}`,
      bodyEn: `The grad school head denied the final grade of the thesis "${title.en}": ${reason}`,
    });
  }
  return { status: next };
}

/** The administrative coordinator's final approval: the student finished
 *  every milestone — the exam milestone is completed with its grade, the
 *  project is closed and the final grade is sent to Michlol (a stub until
 *  the integration exists). */
export async function approveExamFinalGrade(milestoneId: string, actor: { uid: string; name: string }, noteRaw: unknown): Promise<{ finalGradeByStudent: Record<string, number> }> {
  const loaded = await loadExam(milestoneId);
  if (!loaded) throw new ThesisExamError('בחינת התזה לא נמצאה.', 'Thesis exam not found.', 404);
  const { exam, milestone } = loaded;
  const breakdown = exam.gradeBreakdown;
  if (exam.status !== EXAM_COORDINATOR_APPROVAL || !breakdown) throw new ThesisExamError('הציון אינו ממתין לאישור הסופי.', "The grade isn't awaiting the final approval.", 409);
  const note = typeof noteRaw === 'string' ? noteRaw.trim().slice(0, 5000) : '';
  const finalGradeByStudent = Object.fromEntries(Object.entries(breakdown.finalGradeByStudent).filter((e): e is [string, number] => e[1] != null));
  const examGrade = breakdown.exam.examGrade;
  const signature = await signEvaluation({
    milestoneId,
    signerUid: actor.uid,
    signerName: actor.name,
    role: 'coordinator',
    positionHe: 'רכז/ת מנהלי/ת — אישור סופי של הציון',
    positionEn: 'Administrative coordinator — final grade approval',
    facultyId: exam.facultyId,
    scores: { thesisExamFinalGrade: finalGradeByStudent },
  });
  const finalApproval: ExamFinalApproval = { byUid: actor.uid, byName: actor.name, at: new Date().toISOString(), note, signature };
  await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(examRef(milestoneId))).data() as ThesisExamDoc | undefined;
    if (!fresh || fresh.status !== EXAM_COORDINATOR_APPROVAL) throw new ThesisExamError('הציון כבר אושר.', 'The grade was already approved.', 409);
    tx.update(examRef(milestoneId), { status: EXAM_COMPLETED, finalApproval, updatedAt: finalApproval.at });
    tx.update(db.collection('milestones').doc(milestoneId), {
      status: 'completed',
      // The exam milestone's own grade; the project's final grade (by the
      // milestone weights) goes in the record and to Michlol.
      finalGrade: examGrade,
      finalGradeByStudent: Object.fromEntries((milestone.studentIds ?? []).map((sid: string) => [sid, examGrade])),
      gradeApproved: true,
      gradeApprovedBy: actor.uid,
      gradeApprovedAt: admin.firestore.FieldValue.serverTimestamp(),
      gradedAt: admin.firestore.FieldValue.serverTimestamp(),
      gradeApprovalSignature: signature,
      statusBeforeGradeApproval: EXAM_COORDINATOR_APPROVAL,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await logProjectRecordEntry({
    projectId: exam.projectId, type: 'final_grade_approved', actorId: actor.uid, actorRole: 'administrative_secretary',
    data: { milestoneId, finalGradeByStudent, examGrade },
  }).catch((err) => console.error('thesisExam: record entry failed:', err));
  await recordProjectCompletion({ milestoneId, milestone, actorId: actor.uid, actorRole: 'administrative_secretary', final: true });

  // Michlol (stub until the integration exists) — one transfer per grade.
  const byGrade = new Map<number, string[]>();
  Object.entries(finalGradeByStudent).forEach(([sid, g]) => byGrade.set(g, [...(byGrade.get(g) ?? []), sid]));
  const transfers = await Promise.all([...byGrade.entries()].map(([grade, ids]) =>
    transferGradeToMichlol({ milestoneId, projectId: exam.projectId, studentIds: ids, finalGrade: grade })
      .catch((err) => { console.error('thesisExam: Michlol transfer failed:', err); return { transferred: false, transferredAt: new Date().toISOString() }; })));
  await db.collection('milestones').doc(milestoneId).update({
    michlolTransferStatus: transfers.length && transfers.every((t) => t.transferred) ? 'transferred' : 'failed',
    michlolTransferredAt: transfers[0]?.transferredAt ?? new Date().toISOString(),
  }).catch((err) => console.error('thesisExam: Michlol status update failed:', err));

  const title = projectTitle(await projectOf(milestone.projectId));
  await Promise.all(Object.entries(finalGradeByStudent).map(([sid, g]) => notifyUser({
    recipientId: sid, type: 'general', inAppType: 'final_grade_approved',
    titleHe: '🎓 סיימת את התזה', titleEn: '🎓 You completed your thesis',
    bodyHe: `הציון הסופי שלך בתזה "${title.he}" (${g}) אושר סופית. סיימת את כל אבני הדרך.`,
    bodyEn: `Your final grade on the thesis "${title.en}" (${g}) received final approval. You completed every milestone.`,
    relatedProjectId: exam.projectId, relatedMilestoneId: milestoneId, targetScreen: 'student_grades',
  }).catch((err) => console.error('thesisExam: notify failed:', err))));
  const supervisors = [milestone.supervisorId, milestone.secondarySupervisorId].filter(Boolean) as string[];
  await notifyUsers(supervisors, exam, {
    titleHe: `🎓 התזה הושלמה — ${title.he}`, titleEn: `🎓 Thesis completed — ${title.en}`,
    bodyHe: 'הרכזת האדמיניסטרטיבית אישרה סופית את הציון הסופי, והוא הועבר למכלול.',
    bodyEn: 'The administrative coordinator gave the final grade its final approval and it was sent to Michlol.',
  });
  return { finalGradeByStudent };
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

  const active = await db.collection(THESIS_EXAMS).where('status', 'in', [EXAM_AVAILABILITY, EXAM_DATE_COORDINATOR, EXAM_DATE_REVIEW, EXAM_DATE_FINAL_REVIEW, EXAM_SCHEDULED, EXAM_COMMITTEE_REVIEW, EXAM_GRADES_PENDING]).get();
  const today = todayInIsrael();
  for (const doc of active.docs) {
    const exam = doc.data() as ThesisExamDoc;
    try {
      if (exam.status === EXAM_COMMITTEE_REVIEW || exam.status === EXAM_GRADES_PENDING) {
        // Backstop for a missed hook, a grade given elsewhere, and exams
        // left at the retired committee step.
        await advanceExamGrading(exam.milestoneId);
      } else if (exam.status === EXAM_AVAILABILITY && exam.pickDeadline) {
        await advancePickingRound(exam);
      } else if (exam.status === EXAM_AVAILABILITY && exam.window && today > exam.window.end) {
        // A round opened before the 48h rule: it runs until its last day.
        await openAvailabilityRound(exam.milestoneId, { reason: 'window_expired' });
      } else if ((exam.status === EXAM_DATE_REVIEW || exam.status === EXAM_DATE_FINAL_REVIEW) && exam.commonSlots[exam.slotIndex] && slotHasStarted(exam.commonSlots[exam.slotIndex]!)) {
        const next = nextFutureSlotIndex(exam.commonSlots, exam.slotIndex + 1);
        if (next >= 0 && exam.slotSource !== 'coordinator') {
          await doc.ref.update({ status: EXAM_DATE_COORDINATOR, coordinatorTask: 'set_hours', slotIndex: next, updatedAt: new Date().toISOString() });
          await db.collection('milestones').doc(exam.milestoneId).update({ status: EXAM_DATE_COORDINATOR });
          await askCoordinatorForHours(exam.milestoneId, exam.commonSlots[next]!);
        } else {
          await handToCoordinator(exam.milestoneId, 'slots_passed');
        }
      } else if (exam.status === EXAM_DATE_COORDINATOR && exam.coordinatorTask === 'set_hours' && exam.commonSlots[exam.slotIndex] && !windowStillUsable(exam.commonSlots[exam.slotIndex]!)) {
        // The common window passed before the coordinator set the hours.
        const next = nextFutureSlotIndex(exam.commonSlots, exam.slotIndex + 1);
        if (next >= 0) {
          await doc.ref.update({ slotIndex: next, updatedAt: new Date().toISOString() });
          await askCoordinatorForHours(exam.milestoneId, exam.commonSlots[next]!);
        } else {
          await handToCoordinator(exam.milestoneId, 'slots_passed');
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
