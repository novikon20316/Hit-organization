// src/controllers/evaluationFormController.ts
//
// The per-student evaluation form (see workflowTemplates.ts's
// finalGradeComponents.perStudent) — first built for Electrical
// Engineering's B.Sc. "טופס הערכת פרויקט גמר הנדסי", whose paper version has
// one score column per student and a "נותן ההערכה" column saying which rows
// the supervisor fills and which the examiners fill.
//
// Storage reuses the three-rubric workflow's existing fields so everything
// downstream (maybeFinalizeAutoCalculatedGrade's completeness check, the
// supervisor's approve/override decision, the coordinator's sign-off) keeps
// working: supervisorEvaluation / examinerEvaluations[uid].project|defense
// each gain a `byStudent` map ({ [studentId]: { scores, total } }), with
// their own `total` set to the average across students for any reader that
// predates per-student scoring. Each submission also carries a digital
// `signature` (see evaluationSignature.ts).

import { Response } from 'express';
import admin from 'firebase-admin';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { L } from '../utils/localize.js';
import { clientMessage } from '../utils/clientError.js';
import { logAuditEvent } from '../services/auditLog.js';
import { computeGradingComponentsScore } from '../services/milestoneRouting.js';
import { computeProjectFinalGrade, rawRubricPoints as rawPoints, rubricMaxPoints as maxPoints } from '../services/gradeEngine.js';
import { academicYearToHebrew } from '../services/hebrewYear.js';
import { hasActionGrant, withinCoordinatorScope } from '../services/scopeAuthorization.js';
import { isDefenseDateConfirmed, resolveProjectTemplateMilestones, type FormFieldSpec, type GradingComponentSpec } from '../services/workflowTemplates.js';
import { signEvaluation, verifyEvaluationSignature, type EvaluationSignature, type SignedScores } from '../services/evaluationSignature.js';
import { maybeFinalizeAutoCalculatedGrade } from './projectController.js';

dayjs.extend(utc);
dayjs.extend(timezone);
const TZ = 'Asia/Jerusalem';

type RubricKind = 'supervisorEvaluation' | 'examinerDefenseEvaluation' | 'examinerProjectEvaluation';
// Paper order: the supervisor's rows, then the presentation, then the book.
const RUBRIC_ORDER: RubricKind[] = ['supervisorEvaluation', 'examinerDefenseEvaluation', 'examinerProjectEvaluation'];

const STAFF_VIEW_ROLES = ['administrative_secretary', 'coordinator', 'faculty_admin', 'grad_school_head', 'program_head', 'division_head', 'dean', 'system_admin'];

interface StoredStudentScores { scores: Record<string, { score: number; maxScore: number; weight: number }>; total: number }
interface StoredRubricEval { byStudent?: Record<string, StoredStudentScores>; total: number; comment?: string; submittedAt?: FirebaseFirestore.Timestamp }

function signedScoresFrom(entries: Array<StoredRubricEval | undefined>): SignedScores {
  const out: SignedScores = {};
  for (const entry of entries) {
    for (const [studentId, s] of Object.entries(entry?.byStudent ?? {})) {
      out[studentId] ??= {};
      for (const [key, v] of Object.entries(s.scores)) out[studentId][key] = v.score;
    }
  }
  return out;
}

function examinerPosition(index: number): { he: string; en: string } {
  if (index === 0) return { he: 'בוחן 1 / יו"ר', en: 'Examiner 1 / Chair' };
  return { he: `בוחן ${index + 1}`, en: `Examiner ${index + 1}` };
}

function iso(ts: any): string | null {
  return ts?.toDate?.()?.toISOString?.() ?? (typeof ts === 'string' ? ts : null);
}

function formatDate(value: string | null): string | null {
  return value ? dayjs(value).tz(TZ).format('DD/MM/YYYY') : null;
}

/** Hebrew academic year from a date — an academic year starting in
 *  September or later belongs to that calendar year's academic year. */
function academicYearFromDate(value: string | null): string | null {
  if (!value) return null;
  const d = dayjs(value).tz(TZ);
  const startYear = d.month() >= 8 ? d.year() : d.year() - 1;
  return academicYearToHebrew(`${startYear}-${startYear + 1}`);
}

async function userNames(uids: string[]): Promise<Record<string, { name: string; facultyId: string | null; idNumber: string | null }>> {
  const unique = [...new Set(uids.filter(Boolean))];
  const snaps = await Promise.all(unique.map((uid) => db.collection('users').doc(uid).get()));
  const out: Record<string, { name: string; facultyId: string | null; idNumber: string | null }> = {};
  snaps.forEach((s) => {
    const d = s.data() ?? {};
    out[s.id] = { name: d.displayName || d.displayNameHe || s.id, facultyId: d.facultyId ?? null, idNumber: d.studentId ?? null };
  });
  return out;
}

async function loadPerStudentMilestone(req: AuthenticatedRequest, res: Response) {
  const { milestoneId } = req.params;
  if (!milestoneId || typeof milestoneId !== 'string') {
    res.status(400).json({ message: L(req, 'Invalid milestoneId.', 'מזהה אבן הדרך אינו תקין.') });
    return null;
  }
  const ref = db.collection('milestones').doc(milestoneId);
  const snap = await ref.get();
  if (!snap.exists) {
    res.status(404).json({ message: L(req, 'Milestone not found.', 'אבן הדרך לא נמצאה.') });
    return null;
  }
  const data = snap.data()!;
  if (data.type !== 'defense' || !data.finalGradeComponents?.perStudent) {
    res.status(400).json({ message: L(req, 'This milestone does not use the per-student evaluation form.', 'אבן דרך זו אינה משתמשת בטופס ההערכה לפי סטודנט.') });
    return null;
  }
  return { milestoneId, ref, data };
}

// ─── GET /api/projects/milestones/:milestoneId/evaluation-form ───────────────
export const getEvaluationForm = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'משתמש לא מאומת.') });

  try {
    const loaded = await loadPerStudentMilestone(req, res);
    if (!loaded) return;
    const { milestoneId, data } = loaded;

    const projectSnap = await db.collection('projects').doc(data.projectId ?? '').get();
    const project = projectSnap.exists ? projectSnap.data()! : {};
    const scope = { facultyId: project.facultyId ?? data.facultyId ?? '', major: project.major || undefined, degreeLevel: project.degreeType || undefined, processType: project.projectType || undefined };

    const examinerIds: string[] = data.examinerIds ?? [];
    const isSupervisor = data.supervisorId === uid || data.secondarySupervisorId === uid;
    const examinerIndex = examinerIds.indexOf(uid);
    const isExaminer = examinerIndex !== -1;
    const isStaff = hasAnyRole(req.user, STAFF_VIEW_ROLES) && (
      withinCoordinatorScope(req.user, scope) || hasActionGrant(req.user, 'approve_grades', scope) || req.user?.facultyId === scope.facultyId
    );
    if (!isSupervisor && !isExaminer && !isStaff) {
      return res.status(403).json({ message: L(req, 'You do not have access to this evaluation form.', 'אין לך גישה לטופס הערכה זה.') });
    }

    const studentIds: string[] = data.studentIds ?? [];
    const people = await userNames([...studentIds, data.supervisorId, ...examinerIds]);
    const rubrics = data.finalGradeComponents;

    // ── Header (every line an autoFill field) ──
    const projectStartDate = iso(project.projectStartDate);
    const defenseDate = isDefenseDateConfirmed(data.status) ? iso(data.dueDate) : null;
    const resolveHeader = (f: FormFieldSpec): string | null => {
      switch (f.autoFill) {
        case 'projectStartDate': return formatDate(projectStartDate);
        case 'academicYear': return academicYearToHebrew(project.academicYear ?? null) ?? academicYearFromDate(projectStartDate);
        case 'defenseDate': return formatDate(defenseDate);
        case 'supervisorName': return people[data.supervisorId]?.name ?? null;
        case 'projectNameHe': return project.titleHe || null;
        case 'projectNameEn': return project.titleEn || null;
        case 'examinerNames': return examinerIds.map((id) => people[id]?.name).filter(Boolean).join(', ') || null;
        case 'studentName': return studentIds.map((id) => people[id]?.name).join(', ');
        default: return null;
      }
    };
    const header = ((rubrics.headerFields ?? []) as FormFieldSpec[]).map((f) => ({ key: f.key, labelHe: f.labelHe, labelEn: f.labelEn, value: resolveHeader(f) }));

    // ── Who may see which scores ──
    // Same policy as milestoneVisibility.ts: an examiner's scores are visible
    // to that examiner and to coordinator/admin-tier staff only; the
    // supervisor's to the supervisor and staff. Signatures are visible to
    // everyone who can open the form — that's what they're for.
    const canSeeSupervisorScores = isSupervisor || isStaff;
    const canSeeExaminerScores = (id: string) => id === uid || isStaff;
    const scoresOnly = (entries: Array<StoredRubricEval | undefined>) => signedScoresFrom(entries);

    const supEval = data.supervisorEvaluation as (StoredRubricEval & { signature?: EvaluationSignature }) | null;
    const supervisor = {
      uid: data.supervisorId,
      name: people[data.supervisorId]?.name ?? '',
      submitted: !!supEval,
      submittedAt: iso(supEval?.submittedAt),
      scores: supEval && canSeeSupervisorScores ? scoresOnly([supEval]) : null,
      comment: supEval && canSeeSupervisorScores ? supEval.comment ?? '' : null,
      signature: supEval?.signature
        ? { ...supEval.signature, digest: undefined, valid: await verifyEvaluationSignature(milestoneId, supEval.signature, scoresOnly([supEval])) }
        : null,
    };

    const examiners = await Promise.all(examinerIds.map(async (id, index) => {
      const entry = data.examinerEvaluations?.[id] as { project?: StoredRubricEval; defense?: StoredRubricEval; signature?: EvaluationSignature } | undefined;
      const position = examinerPosition(index);
      const submitted = !!(entry?.project && entry?.defense);
      const signed = scoresOnly([entry?.project, entry?.defense]);
      return {
        uid: id,
        name: people[id]?.name ?? '',
        positionHe: position.he,
        positionEn: position.en,
        submitted,
        submittedAt: iso(entry?.project?.submittedAt),
        scores: submitted && canSeeExaminerScores(id) ? signed : null,
        comment: submitted && canSeeExaminerScores(id) ? entry?.defense?.comment ?? '' : null,
        signature: entry?.signature
          ? { ...entry.signature, digest: undefined, valid: await verifyEvaluationSignature(milestoneId, entry.signature, signed) }
          : null,
      };
    }));

    // ── Totals per student ──
    const allExaminersSubmitted = examinerIds.length > 0 && examiners.every((e) => e.submitted);
    const showTotals = isStaff || (isSupervisor && data.autoCalculatedFinalGradeByStudent != null);
    const templateMilestones = await resolveProjectTemplateMilestones(project);
    const thisPercent = templateMilestones.find((m) => m.type === data.type)?.percentOfFinalGrade ?? 100;
    const siblingsSnap = await db.collection('milestones').where('projectId', '==', data.projectId ?? '').get();
    const siblings = siblingsSnap.docs.map((d) => d.data());

    const totals = studentIds.map((studentId) => {
      const sup = rawPoints(supEval ?? undefined, studentId, rubrics.supervisorEvaluation.components);
      const avgExaminer = (sub: 'project' | 'defense', components: GradingComponentSpec[]) => {
        if (!allExaminersSubmitted) return null;
        const each = examinerIds.map((id) => rawPoints(data.examinerEvaluations?.[id]?.[sub], studentId, components) ?? 0);
        return each.reduce((a, b) => a + b, 0) / each.length;
      };
      const defense = avgExaminer('defense', rubrics.examinerDefenseEvaluation.components);
      const projectBook = avgExaminer('project', rubrics.examinerProjectEvaluation.components);
      const points = sup != null && defense != null && projectBook != null ? Math.round((sup + defense + projectBook) * 10) / 10 : null;
      const milestoneGrade: number | null = data.finalGradeByStudent?.[studentId] ?? data.autoCalculatedFinalGradeByStudent?.[studentId] ?? null;
      // The other milestones' share of the project grade (the interim
      // report's 25% for the B.Sc. form) — this student's own grade on each.
      const otherMilestones = templateMilestones
        .filter((m) => m.type !== data.type && (m.percentOfFinalGrade ?? 0) > 0)
        .map((m) => {
          const doc = siblings.find((s) => s.type === m.type && (s.studentIds ?? []).includes(studentId));
          const grade: number | null = doc ? doc.finalGradeByStudent?.[studentId] ?? doc.finalGrade ?? null : null;
          return { type: m.type, nameHe: m.nameHe, nameEn: m.nameEn, percent: m.percentOfFinalGrade ?? 0, grade };
        });
      const actual = siblings
        .filter((s) => (s.studentIds ?? []).includes(studentId))
        .map((s) => ({ type: s.type, finalGrade: s.type === data.type ? (data.gradeApproved ? milestoneGrade : null) : s.finalGradeByStudent?.[studentId] ?? s.finalGrade ?? null }));
      return {
        studentId,
        supervisorPoints: showTotals || canSeeSupervisorScores ? sup : null,
        examinerDefensePoints: showTotals ? defense : null,
        examinerProjectPoints: showTotals ? projectBook : null,
        points: showTotals ? points : null,
        maxPoints: RUBRIC_ORDER.reduce((sum, k) => sum + maxPoints(rubrics[k].components), 0),
        milestoneGrade: showTotals ? milestoneGrade : null,
        milestonePercent: thisPercent,
        otherMilestones: showTotals ? otherMilestones : [],
        projectFinalGrade: showTotals ? computeProjectFinalGrade(templateMilestones, actual) : null,
      };
    });

    // ── What the viewer may do ──
    let canEdit = false;
    let lockedReasonHe: string | null = null;
    let lockedReasonEn: string | null = null;
    const alreadyComputed = data.autoCalculatedFinalGrade != null || data.gradeApproved;
    if (alreadyComputed) {
      lockedReasonHe = 'כל ההערכות הוגשו והציון חושב — הטופס נעול.';
      lockedReasonEn = 'All evaluations are in and the grade was computed — the form is locked.';
    } else if (data.supervisorId === uid) {
      canEdit = true;
    } else if (isExaminer) {
      const defenseDay = data.dueDate ? dayjs(data.dueDate.toDate()).tz(TZ).startOf('day') : null;
      if (!defenseDay || !isDefenseDateConfirmed(data.status)) {
        lockedReasonHe = 'ההערכה תיפתח רק לאחר שנקבע מועד הגנה.';
        lockedReasonEn = 'Evaluation opens once a defense date has been agreed and set.';
      } else if (dayjs().tz(TZ).isBefore(defenseDay)) {
        lockedReasonHe = `ההערכה תיפתח במועד ההגנה (${defenseDay.format('DD/MM/YYYY')}).`;
        lockedReasonEn = `Evaluation opens on the defense date (${defenseDay.format('DD/MM/YYYY')}).`;
      } else {
        canEdit = true;
      }
    }

    return res.status(200).json({
      milestoneId,
      projectId: data.projectId ?? null,
      facultyId: scope.facultyId,
      titleHe: rubrics.formTitleHe ?? data.nameHe ?? '',
      titleEn: rubrics.formTitleEn ?? data.nameEn ?? '',
      header,
      students: studentIds.map((id) => ({ id, name: people[id]?.name ?? id, idNumber: people[id]?.idNumber ?? null })),
      rubrics: RUBRIC_ORDER.map((kind) => ({
        kind,
        giver: kind === 'supervisorEvaluation' ? 'supervisor' : 'examiner',
        weight: rubrics[kind].weight,
        components: rubrics[kind].components,
      })),
      viewer: {
        role: data.supervisorId === uid ? 'supervisor' : isExaminer ? 'examiner' : isSupervisor ? 'secondary_supervisor' : 'staff',
        canEdit,
        lockedReasonHe,
        lockedReasonEn,
        positionHe: data.supervisorId === uid ? 'מנחה' : isExaminer ? examinerPosition(examinerIndex).he : null,
        positionEn: data.supervisorId === uid ? 'Supervisor' : isExaminer ? examinerPosition(examinerIndex).en : null,
      },
      supervisor,
      examiners,
      totals,
      gradeApproved: !!data.gradeApproved,
      gradeOverrideStatus: data.gradeOverride?.status ?? null,
    });
  } catch (error: any) {
    console.error('getEvaluationForm error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load the evaluation form.', 'טעינת טופס ההערכה נכשלה.') });
  }
};

// ─── POST /api/projects/milestones/:milestoneId/evaluation-form ──────────────
// Body: { scoresByStudent: { [studentId]: { [componentKey]: number } }, comment? }
// The project's supervisor fills the supervisor rubric; an assigned examiner
// fills both examiner rubrics (presentation + project book) at once — the
// "נותן ההערכה" column of the paper form. Every enrolled student must be
// scored. Re-submitting is allowed (and re-signs) until the grade has been
// computed from everyone's submissions.
export const submitEvaluationForm = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'משתמש לא מאומת.') });
  const { scoresByStudent, comment } = req.body as { scoresByStudent?: Record<string, Record<string, unknown>>; comment?: unknown };
  if (!scoresByStudent || typeof scoresByStudent !== 'object') {
    return res.status(400).json({ message: L(req, 'Scores are required.', 'יש להזין ציונים.') });
  }
  const commentText = typeof comment === 'string' ? comment.trim().slice(0, 5000) : '';

  try {
    const loaded = await loadPerStudentMilestone(req, res);
    if (!loaded) return;
    const { milestoneId, ref, data } = loaded;

    const examinerIds: string[] = data.examinerIds ?? [];
    const role: 'supervisor' | 'examiner' | null = data.supervisorId === uid ? 'supervisor' : examinerIds.includes(uid) ? 'examiner' : null;
    if (!role) {
      return res.status(403).json({ message: L(req, "Only this project's supervisor or an assigned examiner may fill in this form.", 'רק המנחה של הפרויקט או בוחן/ת שהוקצה/ה רשאים למלא טופס זה.') });
    }
    if (data.gradeApproved || data.autoCalculatedFinalGrade != null) {
      return res.status(409).json({ message: L(req, 'All evaluations are in and the grade was computed — the form is locked.', 'כל ההערכות הוגשו והציון חושב — הטופס נעול.') });
    }
    if (role === 'examiner') {
      // Same gate as submitExaminerEvaluation: only from the agreed defense day.
      if (!data.dueDate || !isDefenseDateConfirmed(data.status)) {
        return res.status(403).json({ message: L(req, 'Evaluation opens once a defense date has been agreed and set.', 'ההערכה תיפתח רק לאחר שנקבע מועד הגנה.') });
      }
      const defenseDay = dayjs(data.dueDate.toDate()).tz(TZ).startOf('day');
      if (dayjs().tz(TZ).isBefore(defenseDay)) {
        return res.status(403).json({ message: L(req, `Evaluation opens on the agreed defense date (${defenseDay.format('DD/MM/YYYY')}).`, `ההערכה תיפתח במועד ההגנה שנקבע (${defenseDay.format('DD/MM/YYYY')}).`) });
      }
    }

    const studentIds: string[] = data.studentIds ?? [];
    const rubrics = data.finalGradeComponents;
    const kinds: RubricKind[] = role === 'supervisor' ? ['supervisorEvaluation'] : ['examinerDefenseEvaluation', 'examinerProjectEvaluation'];

    // Validate every student against every rubric this actor owns.
    const computedByKind: Record<string, Record<string, StoredStudentScores>> = {};
    try {
      for (const kind of kinds) {
        computedByKind[kind] = {};
        for (const studentId of studentIds) {
          const studentScores = scoresByStudent[studentId];
          if (!studentScores || typeof studentScores !== 'object') {
            throw new Error('Every student must be scored.');
          }
          const computed = computeGradingComponentsScore(rubrics[kind].components, studentScores);
          computedByKind[kind][studentId] = { scores: computed.breakdown, total: computed.total };
        }
      }
    } catch (err: any) {
      return res.status(400).json({ message: clientMessage(err, 'Invalid evaluation scores.') });
    }

    const buildEntry = (kind: RubricKind): StoredRubricEval & { scores: Record<string, never> } => {
      const byStudent = computedByKind[kind] ?? {};
      const totals = Object.values(byStudent).map((s) => s.total);
      return {
        byStudent,
        scores: {},
        total: totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0,
        comment: commentText,
        submittedAt: admin.firestore.Timestamp.now(),
      };
    };

    // Digital signature — the signer's own name and faculty, from their
    // account (falling back to the project's faculty for an account with
    // none of its own, e.g. a cross-faculty 'all' examiner).
    const signerSnap = await db.collection('users').doc(uid).get();
    const signer = signerSnap.data() ?? {};
    const signerFaculty = signer.facultyId && signer.facultyId !== 'all' ? signer.facultyId : data.facultyId ?? '';
    const position = role === 'supervisor' ? { he: 'מנחה', en: 'Supervisor' } : examinerPosition(examinerIds.indexOf(uid));

    let update: Record<string, unknown>;
    let signedEntries: StoredRubricEval[];
    if (role === 'supervisor') {
      const entry = buildEntry('supervisorEvaluation');
      signedEntries = [entry];
      const signature = await signEvaluation({
        milestoneId, signerUid: uid, signerName: signer.displayName || signer.displayNameHe || uid, role,
        positionHe: position.he, positionEn: position.en, facultyId: signerFaculty, scores: signedScoresFrom(signedEntries),
      });
      update = { supervisorEvaluation: { ...entry, signature } };
    } else {
      const defense = buildEntry('examinerDefenseEvaluation');
      const projectBook = buildEntry('examinerProjectEvaluation');
      signedEntries = [projectBook, defense];
      const signature = await signEvaluation({
        milestoneId, signerUid: uid, signerName: signer.displayName || signer.displayNameHe || uid, role,
        positionHe: position.he, positionEn: position.en, facultyId: signerFaculty, scores: signedScoresFrom(signedEntries),
      });
      update = { [`examinerEvaluations.${uid}`]: { defense, project: projectBook, signature } };
    }

    await ref.update({ ...update, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    await maybeFinalizeAutoCalculatedGrade(ref);

    await logAuditEvent({
      userId: uid,
      userRole: req.user?.role ?? role,
      action: role === 'supervisor' ? 'supervisor_evaluation_submitted' : 'examiner_evaluation_submitted',
      entityType: 'milestone',
      entityId: milestoneId,
      newValue: { perStudent: true, students: studentIds.length },
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('submitEvaluationForm error:', error);
    return res.status(500).json({ message: L(req, 'Failed to submit the evaluation form.', 'שליחת טופס ההערכה נכשלה.') });
  }
};
