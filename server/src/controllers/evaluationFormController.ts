// src/controllers/evaluationFormController.ts
//
// The per-student evaluation form (see workflowTemplates.ts's
// finalGradeComponents.perStudent) — first built for Electrical
// Engineering's B.Sc. "טופס הערכת פרויקט גמר הנדסי", whose paper version has
// one score column per student and a "נותן ההערכה" column saying which rows
// the supervisor fills and which the examiners fill. Also serves forms split
// across several milestones (finalGradeComponents.formGroup — Electrical's
// M.Sc. project form covers the project book AND the presentation/defense,
// each its own milestone with its own submission, graders and approval):
// the form view shows each milestone of the group as a section.
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

/** What a grade decision signs: studentId -> { grade }. */
export function gradesAsSignedScores(map: Record<string, number> | null | undefined): SignedScores {
  return Object.fromEntries(Object.entries(map ?? {}).map(([sid, g]) => [sid, { grade: g }]));
}

export function examinerPosition(index: number, labels?: Array<{ he: string; en: string }>): { he: string; en: string } {
  const configured = labels?.[index];
  if (configured) return configured;
  if (index === 0) return { he: 'בוחן 1 / יו"ר', en: 'Examiner 1 / Chair' };
  return { he: `בוחן ${index + 1}`, en: `Examiner ${index + 1}` };
}

/** Signer's faculty for a signature — their own, or the milestone's for an
 *  account with none of its own (e.g. a cross-faculty 'all' account). */
export function signerFacultyFor(signer: FirebaseFirestore.DocumentData, fallbackFacultyId: string): string {
  return signer.facultyId && signer.facultyId !== 'all' ? signer.facultyId : fallbackFacultyId;
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
  if (!data.finalGradeComponents?.perStudent) {
    res.status(400).json({ message: L(req, 'This milestone does not use the per-student evaluation form.', 'אבן דרך זו אינה משתמשת בטופס ההערכה לפי סטודנט.') });
    return null;
  }
  return { milestoneId, ref, data };
}

/** Whether a grader may fill their part of this milestone's form right now,
 *  and if not, why. A defense milestone opens to examiners on the agreed
 *  defense day (same gate as submitExaminerEvaluation) and to the supervisor
 *  any time; any other milestone opens to both once the student has
 *  submitted it and its pre-check chain (if it has one) is complete. Nobody
 *  can edit once the grade has been computed. */
export function evaluationGate(data: FirebaseFirestore.DocumentData, role: 'supervisor' | 'examiner'): { open: true } | { open: false; he: string; en: string } {
  if (data.gradeApproved || data.autoCalculatedFinalGrade != null) {
    return { open: false, he: 'כל ההערכות הוגשו והציון חושב — הטופס נעול.', en: 'All evaluations are in and the grade was computed — the form is locked.' };
  }
  if (data.type === 'defense') {
    if (role === 'supervisor') return { open: true };
    if (!data.dueDate || !isDefenseDateConfirmed(data.status)) {
      return { open: false, he: 'ההערכה תיפתח רק לאחר שנקבע מועד הגנה.', en: 'Evaluation opens once a defense date has been agreed and set.' };
    }
    const defenseDay = dayjs(data.dueDate.toDate()).tz(TZ).startOf('day');
    if (dayjs().tz(TZ).isBefore(defenseDay)) {
      return { open: false, he: `ההערכה תיפתח במועד ההגנה (${defenseDay.format('DD/MM/YYYY')}).`, en: `Evaluation opens on the defense date (${defenseDay.format('DD/MM/YYYY')}).` };
    }
    return { open: true };
  }
  if (!data.submittedAt) {
    return { open: false, he: 'ההערכה תיפתח לאחר שהסטודנט/ית יגיש/תגיש את אבן הדרך.', en: 'Evaluation opens once the student submits this milestone.' };
  }
  const routing: Array<{ role: string }> = data.routing ?? [];
  if (routing.length > 0 && !routing.some((s) => s.role === 'examiner') && !data.chainPrecheckComplete) {
    return { open: false, he: 'ההערכה תיפתח לאחר אישור ההגשה בבדיקה המקדימה.', en: 'Evaluation opens once the submission passes its pre-check approvals.' };
  }
  return { open: true };
}

// ─── GET /api/projects/milestones/:milestoneId/evaluation-form ───────────────
// The whole paper form — every milestone sharing this one's formGroup as a
// section of its own (a standalone form is a single section), plus the
// project-level header, students, the other milestones' share of the grade
// and each student's weighted final grade.
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

    const siblingsSnap = await db.collection('milestones').where('projectId', '==', data.projectId ?? '').get();
    const siblings = siblingsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirebaseFirestore.DocumentData & { id: string }));
    const studentIds: string[] = data.studentIds ?? [];
    const fgc = data.finalGradeComponents;
    const formGroup: string | undefined = fgc.formGroup;
    const sectionDocs = (formGroup
      ? siblings.filter((m) => m.finalGradeComponents?.perStudent && m.finalGradeComponents.formGroup === formGroup)
      : siblings.filter((m) => m.id === milestoneId)
    ).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // Access: the project's supervisors, anyone examining any section, or
    // coordinator/admin-tier staff in scope.
    const allExaminerIds = [...new Set(sectionDocs.flatMap((m) => (m.examinerIds ?? []) as string[]))];
    const isSupervisor = data.supervisorId === uid || data.secondarySupervisorId === uid;
    const isAnyExaminer = allExaminerIds.includes(uid);
    const isStaff = hasAnyRole(req.user, STAFF_VIEW_ROLES) && (
      withinCoordinatorScope(req.user, scope) || hasActionGrant(req.user, 'approve_grades', scope) || req.user?.facultyId === scope.facultyId
    );
    if (!isSupervisor && !isAnyExaminer && !isStaff) {
      return res.status(403).json({ message: L(req, 'You do not have access to this evaluation form.', 'אין לך גישה לטופס הערכה זה.') });
    }

    const people = await userNames([...studentIds, data.supervisorId, data.secondarySupervisorId, ...allExaminerIds]);
    const templateMilestones = await resolveProjectTemplateMilestones(project);
    const percentOf = (type: string) => templateMilestones.find((m) => m.type === type)?.percentOfFinalGrade ?? (type === 'defense' ? 100 : 0);

    // ── Header (every line an autoFill field) ──
    const projectStartDate = iso(project.projectStartDate);
    // "Exam/defense date": a defense milestone's agreed date (only once
    // confirmed); for a form group with no defense milestone, the last
    // section's own scheduled date (the M.Sc. presentation's date).
    const defenseDoc = sectionDocs.find((m) => m.type === 'defense');
    const lastSection = sectionDocs[sectionDocs.length - 1] ?? data;
    const examDate = defenseDoc
      ? (isDefenseDateConfirmed(defenseDoc.status) ? iso(defenseDoc.dueDate) : null)
      : iso(lastSection.dueDate);
    const resolveHeader = (f: FormFieldSpec): string | null => {
      switch (f.autoFill) {
        case 'projectStartDate': return formatDate(projectStartDate);
        case 'academicYear': return academicYearToHebrew(project.academicYear ?? null) ?? academicYearFromDate(projectStartDate);
        case 'defenseDate': return formatDate(examDate);
        case 'supervisorName': return people[data.supervisorId]?.name ?? null;
        case 'supervisorNames': return [data.supervisorId, data.secondarySupervisorId].filter(Boolean).map((id: string) => people[id]?.name).filter(Boolean).join(', ') || null;
        case 'projectNameHe': return project.titleHe || null;
        case 'projectNameEn': return project.titleEn || null;
        case 'examinerNames': return allExaminerIds.map((id) => people[id]?.name).filter(Boolean).join(', ') || null;
        case 'studentName': return studentIds.map((id) => people[id]?.name).join(', ');
        default: return null;
      }
    };
    const header = ((fgc.headerFields ?? []) as FormFieldSpec[]).map((f) => ({ key: f.key, labelHe: f.labelHe, labelEn: f.labelEn, value: resolveHeader(f) }));

    // Same policy as milestoneVisibility.ts: an examiner's scores are visible
    // to that examiner and to coordinator/admin-tier staff only; the
    // supervisor's to the supervisors and staff. Signatures are visible to
    // everyone who can open the form — that's what they're for.
    const canSeeSupervisorScores = isSupervisor || isStaff;
    const verified = async (forMilestone: string, sig: EvaluationSignature | undefined, scores: SignedScores) =>
      sig ? { ...sig, digest: undefined, valid: await verifyEvaluationSignature(forMilestone, sig, scores) } : null;

    const sections = await Promise.all(sectionDocs.map(async (m) => {
      const rubrics = m.finalGradeComponents;
      const examinerIds: string[] = m.examinerIds ?? [];
      const examinerIndex = examinerIds.indexOf(uid);
      const percent = percentOf(m.type);

      const supEval = m.supervisorEvaluation as (StoredRubricEval & { signature?: EvaluationSignature }) | null;
      const supervisor = {
        uid: m.supervisorId,
        name: people[m.supervisorId]?.name ?? '',
        submitted: !!supEval,
        submittedAt: iso(supEval?.submittedAt),
        scores: supEval && canSeeSupervisorScores ? signedScoresFrom([supEval]) : null,
        comment: supEval && canSeeSupervisorScores ? supEval.comment ?? '' : null,
        signature: await verified(m.id, supEval?.signature, signedScoresFrom([supEval ?? undefined])),
      };

      const examiners = await Promise.all(examinerIds.map(async (id, index) => {
        const entry = m.examinerEvaluations?.[id] as { project?: StoredRubricEval; defense?: StoredRubricEval; signature?: EvaluationSignature } | undefined;
        const position = examinerPosition(index, rubrics.examinerLabels);
        const submitted = !!(entry?.project && entry?.defense);
        const signed = signedScoresFrom([entry?.project, entry?.defense]);
        const canSee = id === uid || isStaff;
        return {
          uid: id,
          name: people[id]?.name ?? '',
          positionHe: position.he,
          positionEn: position.en,
          submitted,
          submittedAt: iso(entry?.project?.submittedAt),
          scores: submitted && canSee ? signed : null,
          comment: submitted && canSee ? entry?.defense?.comment ?? '' : null,
          signature: await verified(m.id, entry?.signature, signed),
        };
      }));

      const allExaminersSubmitted = examinerIds.length > 0 && examiners.every((e) => e.submitted);
      const showTotals = isStaff || (isSupervisor && m.autoCalculatedFinalGradeByStudent != null);
      const totals = studentIds.map((studentId) => {
        const sup = rawPoints(supEval ?? undefined, studentId, rubrics.supervisorEvaluation.components);
        const avgExaminer = (sub: 'project' | 'defense', components: GradingComponentSpec[]) => {
          if (!allExaminersSubmitted) return null;
          const each = examinerIds.map((id) => rawPoints(m.examinerEvaluations?.[id]?.[sub], studentId, components) ?? 0);
          return each.reduce((a, b) => a + b, 0) / each.length;
        };
        const defense = avgExaminer('defense', rubrics.examinerDefenseEvaluation.components);
        const projectBook = avgExaminer('project', rubrics.examinerProjectEvaluation.components);
        const points = sup != null && defense != null && projectBook != null ? Math.round((sup + defense + projectBook) * 10) / 10 : null;
        const milestoneGrade: number | null = m.finalGradeByStudent?.[studentId] ?? m.autoCalculatedFinalGradeByStudent?.[studentId] ?? null;
        return {
          studentId,
          points: showTotals ? points : null,
          maxPoints: RUBRIC_ORDER.reduce((sum, k) => sum + maxPoints(rubrics[k].components), 0),
          milestoneGrade: showTotals ? milestoneGrade : null,
          // This milestone's share of the project grade, in grade points.
          contribution: showTotals && milestoneGrade != null ? Math.round(milestoneGrade * percent) / 100 : null,
        };
      });

      // What this viewer may do in THIS section.
      const myRole: 'supervisor' | 'examiner' | null = m.supervisorId === uid ? 'supervisor' : examinerIndex !== -1 ? 'examiner' : null;
      const gate = myRole ? evaluationGate(m, myRole) : null;
      const position = myRole === 'supervisor' ? { he: 'מנחה', en: 'Supervisor' } : myRole === 'examiner' ? examinerPosition(examinerIndex, rubrics.examinerLabels) : null;

      return {
        milestoneId: m.id,
        nameHe: m.nameHe ?? '',
        nameEn: m.nameEn ?? '',
        type: m.type,
        percent,
        totalsDisplay: rubrics.totalsDisplay ?? 'points',
        rubrics: RUBRIC_ORDER.map((kind) => {
          const share = (percent * rubrics[kind].weight) / 100;
          const giver: 'supervisor' | 'examiner' = kind === 'supervisorEvaluation' ? 'supervisor' : 'examiner';
          return {
            kind,
            giver,
            weight: rubrics[kind].weight,
            // This rubric's share of the project's final grade, and each
            // grader's part of it (an examiner rubric is split equally).
            percentOfTotal: Math.round(share * 100) / 100,
            percentPerGrader: Math.round((giver === 'examiner' && examinerIds.length > 0 ? share / examinerIds.length : share) * 100) / 100,
            components: rubrics[kind].components as GradingComponentSpec[],
          };
        }).filter((r) => r.components.length > 0),
        viewer: {
          role: myRole,
          canEdit: !!gate?.open,
          lockedReasonHe: gate && !gate.open ? gate.he : null,
          lockedReasonEn: gate && !gate.open ? gate.en : null,
          positionHe: position?.he ?? null,
          positionEn: position?.en ?? null,
        },
        supervisor,
        examiners,
        totals,
        gradeApproved: !!m.gradeApproved,
        gradeOverrideStatus: m.gradeOverride?.status ?? null,
        // The bottom-of-form signature lines: the supervisor's approval of
        // the computed grades and the coordinator's final sign-off.
        approvals: {
          supervisor: await verified(m.id, m.gradeOverride?.signature, gradesAsSignedScores(m.gradeOverride?.proposedGrades)),
          coordinator: await verified(m.id, m.gradeApprovalSignature, gradesAsSignedScores(m.finalGradeByStudent)),
        },
      };
    }));

    // Milestones outside the form that still carry part of the grade (the
    // interim report, on both Electrical forms) — this student's own grade
    // on each — and the weighted project grade.
    const sectionIds = new Set(sectionDocs.map((m) => m.id));
    const showProjectTotals = isStaff || isSupervisor;
    const studentTotals = studentIds.map((studentId) => {
      const own = siblings.filter((s) => (s.studentIds ?? []).includes(studentId));
      const gradeFor = (s: FirebaseFirestore.DocumentData): number | null => s.finalGradeByStudent?.[studentId] ?? s.finalGrade ?? null;
      const otherMilestones = templateMilestones
        .filter((t) => (t.percentOfFinalGrade ?? 0) > 0 && !own.some((s) => s.type === t.type && sectionIds.has(s.id)))
        .map((t) => {
          const doc = own.find((s) => s.type === t.type);
          return { type: t.type, nameHe: t.nameHe, nameEn: t.nameEn, percent: t.percentOfFinalGrade ?? 0, grade: doc ? gradeFor(doc) : null };
        });
      const actual = own.map((s) => ({ type: s.type as string, finalGrade: sectionIds.has(s.id) ? (s.gradeApproved ? gradeFor(s) : null) : gradeFor(s) }));
      return {
        studentId,
        otherMilestones: showProjectTotals ? otherMilestones : [],
        projectFinalGrade: showProjectTotals ? computeProjectFinalGrade(templateMilestones, actual) : null,
      };
    });

    return res.status(200).json({
      milestoneId,
      projectId: data.projectId ?? null,
      facultyId: scope.facultyId,
      titleHe: fgc.formTitleHe ?? data.nameHe ?? '',
      titleEn: fgc.formTitleEn ?? data.nameEn ?? '',
      header,
      students: studentIds.map((id) => ({ id, name: people[id]?.name ?? id, idNumber: people[id]?.idNumber ?? null })),
      viewerIsStaff: isStaff,
      sections,
      studentTotals,
    });
  } catch (error: any) {
    console.error('getEvaluationForm error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load the evaluation form.', 'טעינת טופס ההערכה נכשלה.') });
  }
};

// ─── POST /api/projects/milestones/:milestoneId/evaluation-form ──────────────
// Body: { scoresByStudent: { [studentId]: { [componentKey]: number } }, comment? }
// The project's supervisor fills the supervisor rubric; an assigned examiner
// fills both examiner rubrics at once (either may be empty on a given
// milestone) — the "נותן ההערכה" column of the paper form. Every enrolled
// student must be scored. Re-submitting is allowed (and re-signs) until the
// grade has been computed from everyone's submissions.
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
    const gate = evaluationGate(data, role);
    if (!gate.open) {
      return res.status(409).json({ message: L(req, gate.en, gate.he) });
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

    // Digital signature — the signer's own name and faculty, from their account.
    const signerSnap = await db.collection('users').doc(uid).get();
    const signer = signerSnap.data() ?? {};
    const signerFaculty = signerFacultyFor(signer, data.facultyId ?? '');
    const position = role === 'supervisor' ? { he: 'מנחה', en: 'Supervisor' } : examinerPosition(examinerIds.indexOf(uid), rubrics.examinerLabels);

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
