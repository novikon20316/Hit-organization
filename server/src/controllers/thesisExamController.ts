// src/controllers/thesisExamController.ts
//
// HTTP layer of the CS M.Sc. thesis exam flow — see services/thesisExam.ts.
// One role-agnostic page (/thesis-exam) lists every exam the caller takes part
// in, with the actions open to them: the supervisor nominates, the grad school
// head approves the nomination and the date, the program head approves the
// date, every participant picks dates, examiners fill the form, the committee
// reads the forms. Outside examiners reach the same steps through their access
// token (the public handlers at the bottom, mounted on /api/examiner-access).

import type { Request, Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { L } from '../utils/localize.js';
import { isOtpSessionFresh } from '../services/examinerAccess.js';
import { logAuditEvent } from '../services/auditLog.js';
import { logProjectRecordEntry } from '../services/projectRecords.js';
import {
  THESIS_EXAMS,
  THESIS_EXAM_STATUSES,
  EXAM_NOMINATION,
  EXAM_NOMINATION_REVIEW,
  EXAM_AVAILABILITY,
  EXAM_DATE_COORDINATOR,
  EXAM_DATE_REVIEW,
  EXAM_DATE_FINAL_REVIEW,
  EXAM_SCHEDULED,
  EXAM_COMMITTEE_REVIEW,
  EXAMINER_COUNT,
  DATES_PER_PARTICIPANT,
  AVAILABILITY_WINDOW_DAYS,
  MIN_EXAM_MINUTES,
  ThesisExamError,
  type ThesisExamDoc,
  loadExam,
  gradSchoolHeadIds,
  programHeadIds,
  adminCoordinatorIds,
  setCoordinatorDate,
  internalExaminerCandidates,
  submitNomination,
  decideNomination,
  submitAvailability,
  decideDate,
  buildExamFormView,
  submitExamForm,
  loadExamForms,
  examFormGate,
} from '../services/thesisExam.js';
import type { ResourceScope } from '../services/scopeAuthorization.js';

function sendError(req: Request, res: Response, err: unknown, en: string, he: string) {
  if (err instanceof ThesisExamError) return res.status(err.status).json({ message: L(req, err.en, err.he) });
  console.error(en, err);
  return res.status(500).json({ message: L(req, en, he) });
}

async function nameOf(uid: string): Promise<string> {
  const d = (await db.collection('users').doc(uid).get()).data() ?? {};
  return d.displayName || d.displayNameHe || uid;
}

/** Caches "who holds role X for scope Y" for one request. */
function scopeRoleCache() {
  const cache = new Map<string, Promise<string[]>>();
  return (role: 'grad_school_head' | 'program_head' | 'administrative_secretary', scope: ResourceScope) => {
    const k = `${role}|${JSON.stringify(scope)}`;
    if (!cache.has(k)) {
      cache.set(k, role === 'grad_school_head' ? gradSchoolHeadIds(scope, true) : role === 'program_head' ? programHeadIds(scope, true) : adminCoordinatorIds(scope, true));
    }
    return cache.get(k)!;
  };
}

interface ViewerRelation {
  participantKey: string | null;
  isStudent: boolean;
  isSupervisor: boolean;
  isExaminer: boolean;
  isCommittee: boolean;
  isGradHead: boolean;
  isProgramHead: boolean;
  isAdminCoordinator: boolean;
}

/** What one viewer may see and do on one exam. Students see where it stands
 *  and their own picks; staff also see names; only the supervisor and the
 *  grad school head see the nominated outside examiners' emails. */
async function buildCard(exam: ThesisExamDoc, milestone: FirebaseFirestore.DocumentData, rel: ViewerRelation) {
  const project = (await db.collection('projects').doc(exam.projectId).get()).data() ?? {};
  const staff = !rel.isStudent || rel.isSupervisor || rel.isCommittee || rel.isGradHead || rel.isProgramHead || rel.isAdminCoordinator;
  const studentNames = await Promise.all(((milestone.studentIds ?? []) as string[]).map(nameOf));
  const supervisorName = milestone.supervisorId ? await nameOf(milestone.supervisorId) : '';

  const actions: string[] = [];
  if (exam.status === EXAM_NOMINATION && rel.isSupervisor) actions.push('nominate');
  if (exam.status === EXAM_NOMINATION_REVIEW && rel.isGradHead) actions.push('review_nomination');
  if (exam.status === EXAM_AVAILABILITY && rel.participantKey) actions.push('availability');
  if (exam.status === EXAM_DATE_COORDINATOR && rel.isAdminCoordinator) actions.push('set_date');
  if (exam.status === EXAM_DATE_REVIEW && rel.isProgramHead) actions.push('review_date');
  if (exam.status === EXAM_DATE_FINAL_REVIEW && rel.isGradHead) actions.push('review_date');
  if ((exam.status === EXAM_SCHEDULED || exam.status === EXAM_COMMITTEE_REVIEW) && rel.isExaminer) actions.push('form');
  if (exam.status === EXAM_COMMITTEE_REVIEW && (rel.isCommittee || rel.isGradHead || rel.isProgramHead)) actions.push('view_forms');

  const showNomination = rel.isSupervisor || rel.isGradHead;
  const lastRejected = [...(exam.nominationHistory ?? [])].reverse().find((n) => n.decision === 'rejected') ?? null;
  const proposed = (exam.status === EXAM_DATE_REVIEW || exam.status === EXAM_DATE_FINAL_REVIEW) ? exam.commonSlots[exam.slotIndex] ?? null : null;
  const submittedKeys = Object.keys(exam.availability ?? {});
  const forms = exam.status === EXAM_SCHEDULED || exam.status === EXAM_COMMITTEE_REVIEW ? await loadExamForms(exam) : {};
  const formGate = examFormGate(exam);
  const myForm = rel.participantKey && rel.isExaminer ? forms[rel.participantKey] : undefined;

  return {
    milestoneId: exam.milestoneId,
    projectId: exam.projectId,
    projectTitleHe: project.titleHe || project.titleEn || '',
    projectTitleEn: project.titleEn || project.titleHe || '',
    milestoneNameHe: milestone.nameHe ?? '',
    milestoneNameEn: milestone.nameEn ?? '',
    studentNames,
    supervisorName,
    status: exam.status,
    actions,
    myRoles: {
      student: rel.isStudent, supervisor: rel.isSupervisor, examiner: rel.isExaminer, committee: rel.isCommittee,
      gradSchoolHead: rel.isGradHead, programHead: rel.isProgramHead, adminCoordinator: rel.isAdminCoordinator,
    },
    nomination: showNomination && exam.nomination
      ? {
        examiners: exam.nomination.examiners.map((e) => ({ type: e.type, name: e.name, email: e.email ?? null, institution: e.institution ?? null })),
        submittedByName: exam.nomination.submittedByName,
        submittedAt: exam.nomination.submittedAt,
      }
      : null,
    lastNominationRejection: showNomination && lastRejected && exam.status === EXAM_NOMINATION
      ? { reason: lastRejected.reason ?? '', decidedByName: lastRejected.decidedByName ?? '', decidedAt: lastRejected.decidedAt ?? '' }
      : null,
    examinerNames: staff ? exam.examiners.map((e) => e.name) : [],
    availabilityRound: exam.availabilityRound,
    window: exam.window,
    myAvailability: rel.participantKey ? exam.availability?.[rel.participantKey]?.entries ?? null : null,
    participantCount: exam.participants.length,
    submittedCount: submittedKeys.length,
    // Who still owes dates — staff only (it's about colleagues), never the
    // dates themselves.
    pendingParticipants: staff && exam.status === EXAM_AVAILABILITY
      ? exam.participants.filter((p) => !submittedKeys.includes(p.key)).map((p) => ({ name: p.name, roles: p.roles }))
      : [],
    proposedSlot: (rel.isGradHead || rel.isProgramHead || rel.isSupervisor || rel.isAdminCoordinator) ? proposed : null,
    slotSource: exam.slotSource ?? 'matched',
    // Everyone's picks — only for the coordinator who has to set the time
    // because they didn't overlap.
    availabilityPicks: rel.isAdminCoordinator && exam.status === EXAM_DATE_COORDINATOR
      ? exam.participants.map((p) => ({ name: p.name, roles: p.roles, entries: exam.availability?.[p.key]?.entries ?? [] }))
      : [],
    remainingSlots: (rel.isGradHead || rel.isProgramHead) && proposed ? exam.commonSlots.length - exam.slotIndex - 1 : null,
    rejectedSlots: (rel.isGradHead || rel.isProgramHead || rel.isAdminCoordinator) ? (exam.rejectedSlots ?? []).filter((r) => exam.commonSlots.some((s) => s.date === r.slot.date && s.from === r.slot.from && s.to === r.slot.to)) : [],
    schedule: exam.schedule ? { date: exam.schedule.date, from: exam.schedule.from, to: exam.schedule.to } : null,
    formsSubmittedCount: Object.keys(forms).length,
    examinerCount: exam.examiners.length,
    myFormSubmitted: !!myForm,
    formOpen: formGate.open,
    rules: { examinerCount: EXAMINER_COUNT, datesPerParticipant: DATES_PER_PARTICIPANT, windowDays: AVAILABILITY_WINDOW_DAYS, minExamMinutes: MIN_EXAM_MINUTES },
  };
}

// ─── GET /api/thesis-exam/mine ───────────────────────────────────────────────
export const getMyThesisExams = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'משתמש לא מאומת.') });
  try {
    const snap = await db.collection(THESIS_EXAMS).where('status', 'in', [...THESIS_EXAM_STATUSES]).get();
    const heads = scopeRoleCache();
    const cards = [];
    for (const doc of snap.docs) {
      const exam = doc.data() as ThesisExamDoc;
      const msSnap = await db.collection('milestones').doc(exam.milestoneId).get();
      if (!msSnap.exists) continue;
      const m = msSnap.data()!;
      const key = `u:${uid}`;
      const participant = exam.participants.find((p) => p.key === key);
      const rel: ViewerRelation = {
        participantKey: participant ? key : null,
        isStudent: (m.studentIds ?? []).includes(uid),
        isSupervisor: m.supervisorId === uid || m.secondarySupervisorId === uid,
        isExaminer: exam.examiners.some((e) => e.key === key),
        isCommittee: (exam.committeeMemberIds ?? []).includes(uid),
        isGradHead: (await heads('grad_school_head', exam.scope)).includes(uid),
        isProgramHead: (await heads('program_head', exam.scope)).includes(uid),
        isAdminCoordinator: (await heads('administrative_secretary', exam.scope)).includes(uid),
      };
      if (!Object.entries(rel).some(([k, v]) => k !== 'participantKey' && v) && !rel.participantKey) continue;
      cards.push(await buildCard(exam, m, rel));
    }
    // Things waiting on me first.
    cards.sort((a, b) => Number(b.actions.length > 0) - Number(a.actions.length > 0));
    return res.status(200).json({ exams: cards });
  } catch (err) {
    return sendError(req, res, err, 'Failed to load thesis exams.', 'טעינת בחינות התזה נכשלה.');
  }
};

// ─── GET /api/thesis-exam/:milestoneId/examiner-candidates ───────────────────
export const getExaminerCandidates = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'משתמש לא מאומת.') });
  try {
    const loaded = await loadExam(String(req.params.milestoneId));
    if (!loaded) return res.status(404).json({ message: L(req, 'Thesis exam not found.', 'בחינת התזה לא נמצאה.') });
    if (![loaded.milestone.supervisorId, loaded.milestone.secondarySupervisorId].includes(uid)) {
      return res.status(403).json({ message: L(req, "Only the project's supervisor may nominate examiners.", 'רק מנחה הפרויקט רשאי/ת למנות בוחנים.') });
    }
    return res.status(200).json({ candidates: await internalExaminerCandidates(loaded.milestone) });
  } catch (err) {
    return sendError(req, res, err, 'Failed to load the examiner list.', 'טעינת רשימת הבוחנים נכשלה.');
  }
};

async function audit(req: AuthenticatedRequest, milestoneId: string, action: string, data: Record<string, unknown>) {
  const loaded = await loadExam(milestoneId).catch(() => null);
  await logAuditEvent({
    userId: req.user!.uid,
    userRole: req.user!.role,
    action: 'thesis_exam_step',
    entityType: 'milestone',
    entityId: milestoneId,
    newValue: { step: action, ...data },
  }).catch((err) => console.error('thesisExam audit failed:', err));
  if (loaded) {
    await logProjectRecordEntry({
      projectId: loaded.exam.projectId,
      type: 'thesis_exam_step',
      actorId: req.user!.uid,
      actorRole: req.user!.role,
      data: { milestoneId, step: action, ...data },
    }).catch((err) => console.error('thesisExam record entry failed:', err));
  }
}

// ─── POST /api/thesis-exam/:milestoneId/nominate ─────────────────────────────
// Body: { examiners: [{ type: 'internal', uid } | { type: 'external', name, email, institution? }] }
export const nominateExaminers = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'משתמש לא מאומת.') });
  const milestoneId = String(req.params.milestoneId);
  try {
    await submitNomination(milestoneId, { uid, name: await nameOf(uid) }, req.body?.examiners);
    await audit(req, milestoneId, 'examiners_nominated', {});
    return res.status(200).json({ success: true });
  } catch (err) {
    return sendError(req, res, err, 'Failed to submit the nomination.', 'שליחת המינוי נכשלה.');
  }
};

// ─── POST /api/thesis-exam/:milestoneId/nomination-decision ──────────────────
// Body: { decision: 'approve' | 'reject', reason? }
export const decideExaminerNomination = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'משתמש לא מאומת.') });
  const decision = req.body?.decision;
  if (decision !== 'approve' && decision !== 'reject') return res.status(400).json({ message: L(req, 'Invalid decision.', 'החלטה לא תקינה.') });
  const milestoneId = String(req.params.milestoneId);
  try {
    const result = await decideNomination(milestoneId, { uid, name: await nameOf(uid) }, decision, typeof req.body?.reason === 'string' ? req.body.reason : '');
    await audit(req, milestoneId, decision === 'approve' ? 'nomination_approved' : 'nomination_rejected', {});
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return sendError(req, res, err, 'Failed to record the decision.', 'שמירת ההחלטה נכשלה.');
  }
};

// ─── POST /api/thesis-exam/:milestoneId/availability ─────────────────────────
// Body: { entries: [{ date: 'YYYY-MM-DD', from: 'HH:MM', to: 'HH:MM' } × 5] }
export const submitMyAvailability = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'משתמש לא מאומת.') });
  try {
    const result = await submitAvailability(String(req.params.milestoneId), `u:${uid}`, req.body?.entries);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return sendError(req, res, err, 'Failed to save your dates.', 'שמירת התאריכים נכשלה.');
  }
};

// ─── POST /api/thesis-exam/:milestoneId/date-decision ────────────────────────
// Body: { decision: 'approve' | 'reject', reason? } — the program head, then
// the grad school head (the server knows whose turn it is).
export const decideExamDate = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'משתמש לא מאומת.') });
  const decision = req.body?.decision;
  if (decision !== 'approve' && decision !== 'reject') return res.status(400).json({ message: L(req, 'Invalid decision.', 'החלטה לא תקינה.') });
  const milestoneId = String(req.params.milestoneId);
  try {
    await decideDate(milestoneId, { uid, name: await nameOf(uid) }, decision, typeof req.body?.reason === 'string' ? req.body.reason : '');
    await audit(req, milestoneId, decision === 'approve' ? 'date_approved' : 'date_rejected', {});
    return res.status(200).json({ success: true });
  } catch (err) {
    return sendError(req, res, err, 'Failed to record the decision.', 'שמירת ההחלטה נכשלה.');
  }
};

// ─── POST /api/thesis-exam/:milestoneId/coordinator-date ─────────────────────
// Body: { date: 'YYYY-MM-DD', from: 'HH:MM', to: 'HH:MM', note? } — the
// administrative coordinator, when nobody's picks overlapped (or the heads
// rejected every common time). Goes to the program head, then the grad
// school head, like a matched time.
export const setExamDateByCoordinator = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'משתמש לא מאומת.') });
  const milestoneId = String(req.params.milestoneId);
  try {
    await setCoordinatorDate(milestoneId, { uid, name: await nameOf(uid) }, req.body ?? {});
    await audit(req, milestoneId, 'coordinator_set_date', { date: req.body?.date, from: req.body?.from, to: req.body?.to });
    return res.status(200).json({ success: true });
  } catch (err) {
    return sendError(req, res, err, 'Failed to set the time.', 'קביעת המועד נכשלה.');
  }
};

// ─── GET /api/thesis-exam/:milestoneId/form ──────────────────────────────────
export const getExamForm = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'משתמש לא מאומת.') });
  const milestoneId = String(req.params.milestoneId);
  try {
    const loaded = await loadExam(milestoneId);
    if (!loaded) return res.status(404).json({ message: L(req, 'Thesis exam not found.', 'בחינת התזה לא נמצאה.') });
    const { exam } = loaded;
    const key = `u:${uid}`;
    if (exam.examiners.some((e) => e.key === key)) return res.status(200).json(await buildExamFormView(milestoneId, { kind: 'examiner', key }));
    // The committee reads every form once all are in; the two heads may too.
    const reviewer = (exam.committeeMemberIds ?? []).includes(uid)
      || (await gradSchoolHeadIds(exam.scope, true)).includes(uid)
      || (await programHeadIds(exam.scope, true)).includes(uid);
    if (reviewer && exam.status === EXAM_COMMITTEE_REVIEW) return res.status(200).json(await buildExamFormView(milestoneId, { kind: 'reviewer' }));
    return res.status(403).json({ message: L(req, 'You do not have access to these forms.', 'אין לך גישה לטפסים אלה.') });
  } catch (err) {
    return sendError(req, res, err, 'Failed to load the form.', 'טעינת הטופס נכשלה.');
  }
};

// ─── POST /api/thesis-exam/:milestoneId/form ─────────────────────────────────
// Body: { ratings: { q1..q5: 1-10 }, comments, components: { research, writing, defense: 1-100 } }
export const submitMyExamForm = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'משתמש לא מאומת.') });
  const milestoneId = String(req.params.milestoneId);
  try {
    const result = await submitExamForm(milestoneId, { key: `u:${uid}`, name: await nameOf(uid), external: false }, req.body);
    await audit(req, milestoneId, 'exam_form_submitted', {});
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return sendError(req, res, err, 'Failed to submit the form.', 'שליחת הטופס נכשלה.');
  }
};

// ─── Outside examiners (public, by access token) ─────────────────────────────

async function loadTokenExam(req: Request, res: Response) {
  const token = String(req.params.token ?? '');
  if (!token) { res.status(400).json({ message: L(req, 'Missing token.', 'חסר אסימון גישה.') }); return null; }
  const tokenSnap = await db.collection('examinerTokens').doc(token).get();
  if (!tokenSnap.exists) { res.status(404).json({ message: L(req, 'Invalid or unknown token.', 'אסימון לא תקין או לא מוכר.') }); return null; }
  const tokenDoc = tokenSnap.data()!;
  if (!isOtpSessionFresh(tokenDoc)) { res.status(403).json({ message: L(req, 'Please verify your access code first.', 'יש לאמת את קוד הגישה שלך תחילה.') }); return null; }
  const loaded = tokenDoc.milestoneId ? await loadExam(tokenDoc.milestoneId) : null;
  const key = `x:${token}`;
  if (!loaded || !loaded.exam.examiners.some((e) => e.key === key)) {
    // Not a thesis-exam invitation — the page simply doesn't show this part.
    res.status(200).json({ exam: null });
    return null;
  }
  return { token, key, tokenDoc, ...loaded };
}

/** GET /api/examiner-access/:token/thesis-exam */
export const getExternalThesisExam = async (req: Request, res: Response) => {
  try {
    const loaded = await loadTokenExam(req, res);
    if (!loaded) return;
    const card = await buildCard(loaded.exam, loaded.milestone, {
      participantKey: loaded.exam.participants.some((p) => p.key === loaded.key) ? loaded.key : null,
      isStudent: false, isSupervisor: false, isExaminer: true, isCommittee: false, isGradHead: false, isProgramHead: false, isAdminCoordinator: false,
    });
    // An outside examiner doesn't need the staff-only lists.
    return res.status(200).json({ exam: { ...card, pendingParticipants: [], examinerNames: [] } });
  } catch (err) {
    return sendError(req, res, err, 'Failed to load the thesis exam.', 'טעינת בחינת התזה נכשלה.');
  }
};

/** POST /api/examiner-access/:token/thesis-exam/availability */
export const submitExternalAvailability = async (req: Request, res: Response) => {
  try {
    const loaded = await loadTokenExam(req, res);
    if (!loaded) return;
    const result = await submitAvailability(loaded.exam.milestoneId, loaded.key, req.body?.entries);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return sendError(req, res, err, 'Failed to save your dates.', 'שמירת התאריכים נכשלה.');
  }
};

/** GET /api/examiner-access/:token/thesis-exam/form */
export const getExternalExamForm = async (req: Request, res: Response) => {
  try {
    const loaded = await loadTokenExam(req, res);
    if (!loaded) return;
    return res.status(200).json(await buildExamFormView(loaded.exam.milestoneId, { kind: 'examiner', key: loaded.key }));
  } catch (err) {
    return sendError(req, res, err, 'Failed to load the form.', 'טעינת הטופס נכשלה.');
  }
};

/** POST /api/examiner-access/:token/thesis-exam/form */
export const submitExternalExamForm = async (req: Request, res: Response) => {
  try {
    const loaded = await loadTokenExam(req, res);
    if (!loaded) return;
    const name = loaded.exam.examiners.find((e) => e.key === loaded.key)?.name || loaded.tokenDoc.examinerName || '';
    const result = await submitExamForm(loaded.exam.milestoneId, { key: loaded.key, name, external: true }, req.body);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return sendError(req, res, err, 'Failed to submit the form.', 'שליחת הטופס נכשלה.');
  }
};
