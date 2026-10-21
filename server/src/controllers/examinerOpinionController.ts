// src/controllers/examinerOpinionController.ts
//
// Endpoints for the examiner opinion form (see services/examinerOpinion.ts
// and workflowTemplates.ts's examinerOpinionForm) — internal examiners fill
// it, the supervisor and staff view it (filtered per the examiner's
// confidentiality request), and the administrative coordinator acts on the
// outcome: approve the final grade (all examiners said 'continue') or send
// the thesis back to the student for corrections. External examiners use
// the token endpoints in examinerAccessController.ts.

import { Response } from 'express';
import admin from 'firebase-admin';
import { v2 as cloudinary } from 'cloudinary';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { L } from '../utils/localize.js';
import { logAuditEvent } from '../services/auditLog.js';
import { hasActionGrant, withinCoordinatorScope } from '../services/scopeAuthorization.js';
import { transferGradeToMichlol, averageGrade } from '../services/gradeEngine.js';
import { issueFinalReportLinks } from '../services/finalReport.js';
import { notifyUser } from '../services/notify.js';
import { targetScreenFor } from '../services/notificationTargets.js';
import { signEvaluation } from '../services/evaluationSignature.js';
import {
  buildOpinionView, submitOpinion, parseUploadedOpinionForm, opinionPanel, loadOpinions, OpinionError,
  OPINIONS, OPINION_DRAFTS, OPINION_HISTORY, opinionDocId,
} from '../services/examinerOpinion.js';
import { gradesAsSignedScores, signerFacultyFor } from './evaluationFormController.js';

const STAFF_VIEW_ROLES = ['administrative_secretary', 'coordinator', 'faculty_admin', 'grad_school_head', 'program_head', 'division_head', 'dean', 'system_admin'];

async function loadOpinionMilestone(req: AuthenticatedRequest, res: Response) {
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
  if (!data.examinerOpinionForm) {
    res.status(400).json({ message: L(req, 'This milestone does not use the examiner opinion form.', 'אבן דרך זו אינה משתמשת בטופס חוות דעת בוחן.') });
    return null;
  }
  const projectSnap = await db.collection('projects').doc(data.projectId ?? '').get();
  const project = projectSnap.data() ?? {};
  const scope = { facultyId: project.facultyId ?? data.facultyId ?? '', major: project.major || undefined, degreeLevel: project.degreeType || undefined, processType: project.projectType || undefined };
  return { milestoneId, ref, data, project, scope };
}

function isStaffInScope(req: AuthenticatedRequest, scope: { facultyId: string }) {
  return hasAnyRole(req.user, STAFF_VIEW_ROLES) && (
    withinCoordinatorScope(req.user, scope) || hasActionGrant(req.user, 'approve_grades', scope) || req.user?.facultyId === scope.facultyId
  );
}

/** Who may approve the final grade / send the thesis back: the
 *  administrative coordinator in scope (the faculty's rule), anyone holding
 *  an approve_grades grant over it, or system_admin. */
function canActOnOutcome(req: AuthenticatedRequest, scope: { facultyId: string }) {
  return (hasAnyRole(req.user, ['administrative_secretary']) && withinCoordinatorScope(req.user, scope))
    || hasActionGrant(req.user, 'approve_grades', scope)
    || hasAnyRole(req.user, ['system_admin']);
}

async function uploadFiles(files: Express.Multer.File[], folder: string): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const result = await cloudinary.uploader.upload(dataUri, { resource_type: 'raw', folder });
    urls.push(result.secure_url);
  }
  return urls;
}

function sendOpinionError(req: AuthenticatedRequest, res: Response, err: unknown, fallbackEn: string, fallbackHe: string) {
  if (err instanceof OpinionError) return res.status(err.status).json({ message: L(req, err.en, err.he) });
  console.error(fallbackEn, err);
  return res.status(500).json({ message: L(req, fallbackEn, fallbackHe) });
}

// ─── GET /api/projects/milestones/:milestoneId/examiner-opinion ──────────────
export const getExaminerOpinionForm = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'משתמש לא מאומת.') });
  try {
    const loaded = await loadOpinionMilestone(req, res);
    if (!loaded) return;
    const { milestoneId, data, scope } = loaded;
    const isExaminer = (data.examinerIds ?? []).includes(uid);
    const isSupervisor = data.supervisorId === uid || data.secondarySupervisorId === uid;
    if (isStaffInScope(req, scope)) return res.status(200).json(await buildOpinionView(milestoneId, data, { kind: 'staff' }));
    if (isExaminer) return res.status(200).json(await buildOpinionView(milestoneId, data, { kind: 'examiner', key: uid }));
    if (isSupervisor) return res.status(200).json(await buildOpinionView(milestoneId, data, { kind: 'supervisor' }));
    return res.status(403).json({ message: L(req, 'You do not have access to this form.', 'אין לך גישה לטופס זה.') });
  } catch (err) {
    return sendOpinionError(req, res, err, 'Failed to load the examiner form.', 'טעינת טופס הבוחן נכשלה.');
  }
};

// ─── POST /api/projects/milestones/:milestoneId/examiner-opinion/parse ───────
// One file (the examiner's filled Word form) → the online form's pre-fill.
// The file itself is kept and attached to the opinion when it's submitted.
export const parseExaminerOpinionUpload = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'משתמש לא מאומת.') });
  try {
    const loaded = await loadOpinionMilestone(req, res);
    if (!loaded) return;
    const { ref, data } = loaded;
    if (!(data.examinerIds ?? []).includes(uid)) {
      return res.status(403).json({ message: L(req, 'Only an assigned examiner may upload this form.', 'רק בוחן/ת שהוקצה/ה רשאי/ת להעלות טופס זה.') });
    }
    const result = await parseAndStoreUpload(req, ref, data, uid);
    return res.status(200).json(result);
  } catch (err) {
    return sendOpinionError(req, res, err, 'Could not read the uploaded form.', 'לא ניתן היה לקרוא את הטופס שהועלה.');
  }
};

/** Shared with the external-examiner token endpoint. */
export async function parseAndStoreUpload(req: { files?: unknown }, ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData, key: string) {
  const files = ((req as any).files as Express.Multer.File[]) ?? [];
  const file = files[0];
  if (!file) throw new OpinionError('יש לצרף את קובץ הטופס.', 'Attach the form file.');
  const isWord = file.mimetype === 'application/msword' || file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (!isWord) throw new OpinionError('ניתן להעלות רק את קובץ הטופס בפורמט Word ‏(.doc / .docx).', 'Only the Word form (.doc / .docx) can be read.');
  let parsed;
  try {
    parsed = await parseUploadedOpinionForm(file.buffer, data.examinerOpinionForm);
  } catch {
    throw new OpinionError('לא ניתן היה לקרוא את הקובץ — ודא/י שזה טופס הבוחן בפורמט Word.', "The file couldn't be read — make sure it's the examiner form in Word format.");
  }
  const [url] = await uploadFiles([file], 'examinerOpinionForms');
  // Kept server-side and attached on submit — never a client-supplied URL.
  await db.collection(OPINION_DRAFTS).doc(opinionDocId(ref.id, key)).set({ milestoneId: ref.id, key, uploadedFormUrl: url, uploadedAt: new Date().toISOString() });
  return { prefill: parsed, uploadedFormUrl: url };
}

/** The examiner's uploaded Word form for this milestone, if any. */
export async function uploadedFormUrlFor(milestoneId: string, key: string): Promise<string | null> {
  const snap = await db.collection(OPINION_DRAFTS).doc(opinionDocId(milestoneId, key)).get();
  return (snap.data()?.uploadedFormUrl as string | undefined) ?? null;
}

// ─── POST /api/projects/milestones/:milestoneId/examiner-opinion ─────────────
// Multipart: conclusion, confidentiality, opinion, confidentialOpinion?,
// institution, examinerName? + optional opinion attachment(s) as `files`.
export const submitExaminerOpinionForm = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'משתמש לא מאומת.') });
  try {
    const loaded = await loadOpinionMilestone(req, res);
    if (!loaded) return;
    const { ref, data, milestoneId } = loaded;
    if (!(data.examinerIds ?? []).includes(uid)) {
      return res.status(403).json({ message: L(req, 'Only an assigned examiner may fill in this form.', 'רק בוחן/ת שהוקצה/ה רשאי/ת למלא טופס זה.') });
    }
    const signerSnap = await db.collection('users').doc(uid).get();
    const signer = signerSnap.data() ?? {};
    const fileUrls = await uploadFiles(((req as any).files as Express.Multer.File[]) ?? [], 'examinerOpinions');
    const result = await submitOpinion({
      milestoneRef: ref,
      key: uid,
      external: false,
      signerName: signer.displayName || signer.displayNameHe || uid,
      signerFacultyId: signerFacultyFor(signer, data.facultyId ?? ''),
      input: req.body,
      fileUrls,
      uploadedFormUrl: await uploadedFormUrlFor(ref.id, uid),
    });
    await logAuditEvent({
      userId: uid,
      userRole: req.user?.role ?? 'internal_examiner',
      action: 'examiner_evaluation_submitted',
      entityType: 'milestone',
      entityId: milestoneId,
      newValue: { examinerOpinion: true, conclusion: req.body?.conclusion ?? null },
    });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return sendOpinionError(req, res, err, 'Failed to submit the examiner form.', 'שליחת טופס הבוחן נכשלה.');
  }
};

// ─── POST /api/projects/milestones/:milestoneId/examiner-opinion/final-grade ─
// Body: { grades: { [studentId]: number } } — the administrative coordinator
// enters and approves the final grade once every examiner said 'continue'.
export const approveThesisFinalGrade = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'משתמש לא מאומת.') });
  try {
    const loaded = await loadOpinionMilestone(req, res);
    if (!loaded) return;
    const { ref, data, scope, milestoneId, project } = loaded;
    if (!canActOnOutcome(req, scope)) {
      return res.status(403).json({ message: L(req, 'Only the administrative coordinator may approve this grade.', 'רק הרכז/ת המנהלי/ת רשאי/ת לאשר ציון זה.') });
    }
    if (data.opinionOutcome?.result !== 'continue') {
      return res.status(409).json({ message: L(req, 'The final grade can be approved only after every examiner approved the thesis.', 'ניתן לאשר את הציון הסופי רק לאחר שכל הבוחנים אישרו את העבודה.') });
    }
    if (data.gradeApproved) {
      return res.status(409).json({ message: L(req, 'This grade has already been approved.', 'ציון זה כבר אושר.') });
    }
    const studentIds: string[] = data.studentIds ?? [];
    const grades: Record<string, number> = {};
    for (const sid of studentIds) {
      const g = Number(req.body?.grades?.[sid]);
      if (!Number.isFinite(g) || g < 0 || g > 100) {
        return res.status(400).json({ message: L(req, 'Every student needs a grade between 0 and 100.', 'יש להזין לכל סטודנט ציון בין 0 ל-100.') });
      }
      grades[sid] = Math.round(g);
    }
    const finalGrade = averageGrade(grades);
    const signerSnap = await db.collection('users').doc(uid).get();
    const signer = signerSnap.data() ?? {};
    const signature = await signEvaluation({
      milestoneId, signerUid: uid, signerName: signer.displayName || signer.displayNameHe || uid,
      role: 'coordinator', positionHe: 'רכז/ת מנהלי/ת — אישור הציון הסופי', positionEn: 'Administrative coordinator — final grade approval',
      facultyId: signerFacultyFor(signer, data.facultyId ?? ''), scores: gradesAsSignedScores(grades),
    });

    try {
      await db.runTransaction(async (tx) => {
        const fresh = (await tx.get(ref)).data() ?? {};
        if (fresh.gradeApproved) throw new Error('ALREADY_APPROVED');
        tx.update(ref, {
          finalGrade,
          finalGradeByStudent: grades,
          gradeApproved: true,
          gradeApprovedBy: uid,
          gradeApprovedAt: admin.firestore.FieldValue.serverTimestamp(),
          gradedAt: admin.firestore.FieldValue.serverTimestamp(),
          gradeApprovalSignature: signature,
          statusBeforeGradeApproval: fresh.status ?? null,
          status: 'completed',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
    } catch (err: any) {
      if (err?.message === 'ALREADY_APPROVED') return res.status(409).json({ message: L(req, 'This grade has already been approved.', 'ציון זה כבר אושר.') });
      throw err;
    }

    await logAuditEvent({
      userId: uid,
      userRole: req.user?.role ?? 'administrative_secretary',
      action: 'final_grade_approved',
      entityType: 'milestone',
      entityId: milestoneId,
      newValue: { finalGrade, finalGradeByStudent: grades },
    });

    // Michlol (stub until the integration exists) — one transfer per grade.
    const byGrade = new Map<number, string[]>();
    studentIds.forEach((sid) => byGrade.set(grades[sid]!, [...(byGrade.get(grades[sid]!) ?? []), sid]));
    const transfers = await Promise.all([...byGrade.entries()].map(([grade, ids]) =>
      transferGradeToMichlol({ milestoneId, projectId: data.projectId ?? '', studentIds: ids, finalGrade: grade })));
    await ref.update({
      michlolTransferStatus: transfers.every((t) => t.transferred) ? 'transferred' : 'failed',
      michlolTransferredAt: transfers[0]?.transferredAt ?? new Date().toISOString(),
    });

    const title = project.titleHe || project.titleEn || '';
    await Promise.all([
      ...studentIds.map((sid) => notifyUser({
        recipientId: sid,
        type: 'general',
        inAppType: 'final_grade_approved',
        titleHe: '🎓 הציון הסופי אושר',
        titleEn: '🎓 Final Grade Approved',
        bodyHe: `הציון הסופי שלך בעבודת התזה (${grades[sid]}) אושר.`,
        bodyEn: `Your final thesis grade (${grades[sid]}) has been approved.`,
        relatedProjectId: data.projectId ?? null,
        relatedMilestoneId: milestoneId,
        targetScreen: 'student_grades',
      }).catch((e) => console.error('approveThesisFinalGrade: student notify failed:', e))),
      ...[data.supervisorId, data.secondarySupervisorId].filter(Boolean).map((sup: string) => notifyUser({
        recipientId: sup,
        type: 'general',
        inAppType: 'final_grade_approved',
        titleHe: `🎓 הציון הסופי אושר — ${title}`,
        titleEn: `🎓 Final grade approved — ${title}`,
        bodyHe: 'הרכז/ת המנהלי/ת אישר/ה את הציון הסופי של עבודת התזה.',
        bodyEn: 'The administrative coordinator approved the final thesis grade.',
        relatedProjectId: data.projectId ?? null,
        relatedMilestoneId: milestoneId,
      }).catch((e) => console.error('approveThesisFinalGrade: supervisor notify failed:', e))),
    ]);
    await issueFinalReportLinks(milestoneId);
    return res.status(200).json({ success: true, finalGrade });
  } catch (err) {
    return sendOpinionError(req, res, err, 'Failed to approve the final grade.', 'אישור הציון הסופי נכשל.');
  }
};

// ─── POST /api/projects/milestones/:milestoneId/examiner-opinion/send-back ───
// Body: { note } — after a 'revise'/'reject' outcome, returns the thesis to
// the student for corrections. The opinions of examiners who asked for
// changes are archived; only they review the corrected version (a new
// round). The student sees `note` as the milestone's rejection reason.
export const sendThesisBackForCorrections = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'משתמש לא מאומת.') });
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 5000) : '';
  if (!note) return res.status(400).json({ message: L(req, 'Write a message for the student.', 'יש לכתוב הודעה לסטודנט/ית.') });
  try {
    const loaded = await loadOpinionMilestone(req, res);
    if (!loaded) return;
    const { ref, data, scope, milestoneId } = loaded;
    if (!canActOnOutcome(req, scope)) {
      return res.status(403).json({ message: L(req, 'Only the administrative coordinator may send the thesis back.', 'רק הרכז/ת המנהלי/ת רשאי/ת להחזיר את העבודה.') });
    }
    const result = data.opinionOutcome?.result;
    if (result !== 'revise' && result !== 'reject') {
      return res.status(409).json({ message: L(req, 'The thesis can be sent back only after an examiner asked for changes.', 'ניתן להחזיר את העבודה רק לאחר שבוחן/ת ביקש/ה שינויים.') });
    }
    const spec = data.examinerOpinionForm;
    const panel = await opinionPanel(data);
    const opinions = await loadOpinions(milestoneId, panel.map((p) => p.key));
    const outcomeOf = (conclusion: string) => spec.conclusions.find((c: { value: string; outcome: string }) => c.value === conclusion)?.outcome ?? 'revise';
    const reReviewers = Object.entries(opinions).filter(([, o]) => outcomeOf(o.conclusion) !== 'continue').map(([key]) => key);

    const update: Record<string, unknown> = {
      opinionOutcome: null,
      examinerOpinionRound: (data.examinerOpinionRound ?? 1) + 1,
      opinionSendBack: { at: new Date().toISOString(), by: uid, note, round: data.examinerOpinionRound ?? 1 },
      statusBeforeSendBack: data.status ?? null,
      status: 'rejected',
      rejectionReason: note,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    // Archive the re-reviewers' opinions (kept for staff) and clear them so
    // those examiners fill in the form again for the corrected version.
    const batch = db.batch();
    const round = data.examinerOpinionRound ?? 1;
    for (const key of reReviewers) {
      batch.set(db.collection(OPINION_HISTORY).doc(`${opinionDocId(milestoneId, key)}__r${round}`), { ...opinions[key], milestoneId, key });
      batch.delete(db.collection(OPINIONS).doc(opinionDocId(milestoneId, key)));
      batch.delete(db.collection(OPINION_DRAFTS).doc(opinionDocId(milestoneId, key)));
    }
    batch.update(ref, update);
    await batch.commit();

    await logAuditEvent({
      userId: uid,
      userRole: req.user?.role ?? 'administrative_secretary',
      action: 'final_grade_rejected',
      entityType: 'milestone',
      entityId: milestoneId,
      newValue: { sentBackForCorrections: true, reReviewers: reReviewers.length },
      explanation: note,
    });

    await Promise.all((data.studentIds ?? []).map((sid: string) => notifyUser({
      recipientId: sid,
      type: 'milestone_graded',
      inAppType: 'thesis_returned_for_corrections',
      titleHe: '📄 העבודה הוחזרה לתיקונים',
      titleEn: '📄 Thesis returned for corrections',
      bodyHe: note,
      bodyEn: note,
      relatedProjectId: data.projectId ?? null,
      relatedMilestoneId: milestoneId,
      ...(targetScreenFor('student', 'milestone_action') ? { targetScreen: targetScreenFor('student', 'milestone_action')! } : {}),
    }).catch((e) => console.error('sendThesisBackForCorrections: notify failed:', e))));
    return res.status(200).json({ success: true, reReviewers: reReviewers.length });
  } catch (err) {
    return sendOpinionError(req, res, err, 'Failed to send the thesis back.', 'החזרת העבודה נכשלה.');
  }
};

// ─── GET /api/project-coordinator/thesis-opinions ────────────────────────────
// The administrative coordinator's queue: theses whose examiners have all
// answered and that still await her action (grade approval or a decision
// on a returned thesis).
export const getThesisOpinionQueue = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'משתמש לא מאומת.') });
  if (!hasAnyRole(req.user, ['administrative_secretary', 'system_admin'])) {
    return res.status(403).json({ message: L(req, 'Forbidden.', 'הגישה נדחתה.') });
  }
  try {
    const isSystemAdmin = hasAnyRole(req.user, ['system_admin']);
    // Same scope resolution as projectCoordinatorController.ts's
    // resolveCoordinatorScopes: explicit coordinatorScopes, else her own
    // real facultyId. null = every faculty (system_admin, or an 'all' scope);
    // each row is re-checked with withinCoordinatorScope below.
    const scopedFaculties = (req.user?.coordinatorScopes ?? []).map((sc) => sc.facultyId);
    const ownFaculty = req.user?.facultyId && req.user.facultyId !== 'all' ? [req.user.facultyId] : [];
    const facultyIds = isSystemAdmin || scopedFaculties.includes('all') ? null : [...new Set(scopedFaculties.length > 0 ? scopedFaculties : ownFaculty)];
    if (facultyIds && facultyIds.length === 0) return res.status(200).json({ items: [] });
    const snaps = facultyIds
      ? await Promise.all(facultyIds.map((f) => db.collection('milestones').where('facultyId', '==', f).where('opinionOutcome.result', 'in', ['continue', 'revise', 'reject']).get()))
      : [await db.collection('milestones').where('opinionOutcome.result', 'in', ['continue', 'revise', 'reject']).get()];
    const docs = snaps.flatMap((s) => s.docs).filter((d) => !d.data().gradeApproved && d.data().examinerOpinionForm);

    const items = await Promise.all(docs.map(async (d) => {
      const m = d.data();
      const projectSnap = await db.collection('projects').doc(m.projectId ?? '').get();
      const project = projectSnap.data() ?? {};
      if (!isSystemAdmin && !withinCoordinatorScope(req.user, { facultyId: project.facultyId ?? m.facultyId ?? '', major: project.major || undefined, degreeLevel: project.degreeType || undefined, processType: project.projectType || undefined })) return null;
      const studentSnaps = await Promise.all((m.studentIds ?? []).map((sid: string) => db.collection('users').doc(sid).get()));
      const panel = await opinionPanel(m);
      return {
        milestoneId: d.id,
        projectId: m.projectId ?? null,
        projectTitleHe: project.titleHe ?? '',
        projectTitleEn: project.titleEn ?? '',
        students: studentSnaps.map((s) => ({ id: s.id, name: s.data()?.displayName ?? s.id })),
        outcome: m.opinionOutcome.result as 'continue' | 'revise' | 'reject',
        decidedAt: m.opinionOutcome.decidedAt ?? null,
        round: m.examinerOpinionRound ?? 1,
        examinerCount: panel.length,
      };
    }));
    return res.status(200).json({ items: items.filter(Boolean) });
  } catch (err) {
    return sendOpinionError(req, res, err, 'Failed to load the thesis opinions queue.', 'טעינת רשימת חוות הדעת נכשלה.');
  }
};
