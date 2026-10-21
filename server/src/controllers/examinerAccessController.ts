// src/controllers/examinerAccessController.ts
//
// Public (no verifyToken) endpoints for external examiners, who have no
// Firebase Auth account — identity comes from the token/grant code itself,
// re-derived server-side from Firestore, never trusted from the client.
import { Request, Response } from 'express';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { submitCandidateDatesAndResolve, examinerKeyOf } from '../services/defenseScheduling.js';
import { requestExaminerOtp, verifyExaminerOtp, isOtpSessionFresh } from '../services/examinerAccess.js';
import { computeGradingComponentsScore } from '../services/milestoneRouting.js';
import type { GradingComponentSpec } from '../services/workflowTemplates.js';
import { maybeFinalizeAutoCalculatedGrade } from './projectController.js';
import { logAuditEvent } from '../services/auditLog.js';
import { L } from '../utils/localize.js';
import { clientMessage } from '../utils/clientError.js';
import { buildOpinionView, submitOpinion, OpinionError } from '../services/examinerOpinion.js';
import { parseAndStoreUpload, uploadedFormUrlFor } from './examinerOpinionController.js';
import { v2 as cloudinary } from 'cloudinary';

dayjs.extend(utc);
dayjs.extend(timezone);
const TZ = 'Asia/Jerusalem';

/**
 * POST /api/examiner-access/:token/request-otp
 * Sends (or resends) a one-time email code — the second factor required
 * before the token document becomes readable (see verifyOtp / firestore.rules).
 */
export const requestOtp = async (req: Request, res: Response) => {
  const { token } = req.params;
  if (!token || typeof token !== 'string') return res.status(400).json({ message: L(req, 'Missing token.', 'חסר אסימון גישה.') });

  try {
    const { sent } = await requestExaminerOtp(token);
    if (!sent) {
      return res.status(502).json({ message: L(req, 'Failed to send the verification code. Please try again.', 'שליחת קוד האימות נכשלה. נסה/י שוב.') });
    }
    return res.status(200).json({ success: true });
  } catch (error: any) {
    if (error.message === 'Invalid or unknown token.') {
      return res.status(404).json({ message: clientMessage(error, L(req, 'The request could not be completed.', 'לא ניתן היה להשלים את הבקשה.')) });
    }
    console.error('requestOtp error:', error);
    return res.status(500).json({ message: L(req, 'Internal server error', 'שגיאת שרת פנימית.') });
  }
};

/**
 * POST /api/examiner-access/:token/verify-otp
 * Body: { code: string }
 */
export const verifyOtp = async (req: Request, res: Response) => {
  const { token } = req.params;
  const { code } = req.body;
  if (!token || typeof token !== 'string') return res.status(400).json({ message: L(req, 'Missing token.', 'חסר אסימון גישה.') });
  if (!code || typeof code !== 'string') return res.status(400).json({ message: L(req, 'Missing code.', 'חסר קוד אימות.') });

  try {
    const result = await verifyExaminerOtp(token, code);
    if (!result.verified) {
      return res.status(400).json({ message: result.reason || L(req, 'Verification failed.', 'האימות נכשל.') });
    }
    await logAuditEvent({
      userId: token,
      userRole: 'external_examiner',
      action: 'examiner_access_granted',
      entityType: 'examinerToken',
      entityId: token,
    });
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('verifyOtp error:', error);
    return res.status(500).json({ message: L(req, 'Internal server error', 'שגיאת שרת פנימית.') });
  }
};

/**
 * GET /api/examiner-access/:token/defense-dates
 * Status + window info for the external examiner's defense-date submission.
 */
export const getDefenseDateStatus = async (req: Request, res: Response) => {
  const { token } = req.params;
  if (!token || typeof token !== 'string') return res.status(400).json({ message: L(req, 'Missing token.', 'חסר אסימון גישה.') });

  try {
    const tokenSnap = await db.collection('examinerTokens').doc(token).get();
    if (!tokenSnap.exists) return res.status(404).json({ message: L(req, 'Invalid or unknown token.', 'אסימון לא תקין או לא מוכר.') });
    const tokenDoc = tokenSnap.data()!;
    // MEDIUM FIX: otpVerified was only ever enforced by firestore.rules'
    // `allow get` on this same doc — but that rule only gates direct client
    // Firestore reads. This Express endpoint goes through the Admin SDK,
    // which bypasses Firestore rules entirely, so anyone in possession of
    // the raw token (leaked via email forwarding, a mail-security link
    // scanner, browser history sync, etc.) could check status without ever
    // proving control of the examiner's inbox — defeating the OTP step.
    if (!isOtpSessionFresh(tokenDoc)) {
      return res.status(403).json({ message: L(req, 'Please verify your access code first.', 'יש לאמת את קוד הגישה שלך תחילה.') });
    }

    const milestoneSnap = await db.collection('milestones').doc(tokenDoc.milestoneId).get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: L(req, 'Associated milestone not found.', 'אבן הדרך המשויכת לא נמצאה.') });
    const milestone = milestoneSnap.data()!;

    const dateMatching = milestone.dateMatching;
    if (!dateMatching) {
      return res.status(200).json({ status: 'not_open' });
    }

    const examinerKey = examinerKeyOf({ type: 'external', ref: token });
    const round = dateMatching.rounds[dateMatching.currentRound];
    const inCurrentRound = round?.panel?.includes(examinerKey);

    if (milestone.status === 'defense_date_set' || milestone.status === 'scheduled') {
      return res.status(200).json({
        status: 'matched',
        matchedDate: dateMatching.finalDate ? dayjs(dateMatching.finalDate.toDate()).tz(TZ).format('YYYY-MM-DD') : null,
      });
    }
    if (!inCurrentRound) {
      return res.status(200).json({ status: 'not_open' });
    }

    const mySubmission = dateMatching.submissions?.[examinerKey];
    const submittedThisRound = mySubmission && mySubmission.roundIndex === dateMatching.currentRound;

    return res.status(200).json({
      status: submittedThisRound ? 'awaiting_other_examiners' : 'awaiting_your_dates',
      windowStart: dayjs(dateMatching.windowStart.toDate()).tz(TZ).format('YYYY-MM-DD'),
      windowEnd: dayjs(dateMatching.windowEnd.toDate()).tz(TZ).format('YYYY-MM-DD'),
    });
  } catch (error: any) {
    console.error('getDefenseDateStatus error:', error);
    return res.status(500).json({ message: L(req, 'Internal server error', 'שגיאת שרת פנימית.') });
  }
};

/**
 * POST /api/examiner-access/:token/defense-dates
 * Body: { candidateDates: string[] }
 */
export const submitExternalDefenseDates = async (req: Request, res: Response) => {
  const { token } = req.params;
  const { candidateDates } = req.body;
  if (!token || typeof token !== 'string') return res.status(400).json({ message: L(req, 'Missing token.', 'חסר אסימון גישה.') });

  try {
    const tokenSnap = await db.collection('examinerTokens').doc(token).get();
    if (!tokenSnap.exists) return res.status(404).json({ message: L(req, 'Invalid or unknown token.', 'אסימון לא תקין או לא מוכר.') });
    const tokenDoc = tokenSnap.data()!;
    // MEDIUM FIX: same OTP gap as getDefenseDateStatus above — this Express
    // endpoint bypasses firestore.rules entirely via the Admin SDK, so it
    // must re-check otpVerified itself rather than relying on the rule.
    if (!isOtpSessionFresh(tokenDoc)) {
      return res.status(403).json({ message: L(req, 'Please verify your access code first.', 'יש לאמת את קוד הגישה שלך תחילה.') });
    }

    const examinerKey = examinerKeyOf({ type: 'external', ref: token });
    const result = await submitCandidateDatesAndResolve(tokenDoc.milestoneId, examinerKey, candidateDates);
    await logAuditEvent({
      userId: token,
      userRole: 'external_examiner',
      action: 'examiner_dates_submitted',
      entityType: 'milestone',
      entityId: tokenDoc.milestoneId,
      newValue: { candidateDates },
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    console.error('submitExternalDefenseDates error:', error);
    return res.status(400).json({ message: clientMessage(error, L(req, 'Failed to submit candidate dates.', 'שליחת התאריכים המוצעים נכשלה.')) });
  }
};

/**
 * GET /api/examiner-access/defense/:grantCode
 * The day-of access gate. Status is ALWAYS computed fresh here (never
 * trusted from the stored `status` field) — there's no cron in this app to
 * flip it at midnight, so "is this active right now" must be derived live.
 */
/**
 * POST /api/examiner-access/:token/examiner-evaluation
 * Body: { kind: 'project' | 'defense', scores, comment? }
 * Only applicable to a data_science defense milestone's three-rubric
 * finalGradeComponents workflow (see createExternalExaminerAccess's
 * denormalization of finalGradeComponents onto the token doc) — a 400 for
 * any other faculty's token, which keeps using the direct-Firestore
 * submitExaminerOpinion write (web/lib/examinerTokens.ts) completely
 * unchanged. Mirrors projectController.ts's submitExaminerEvaluation
 * (the internal-examiner equivalent) so an external data_science examiner's
 * score counts toward the SAME milestone.autoCalculatedFinalGrade, keyed by
 * this token instead of a Firebase uid — see maybeFinalizeAutoCalculatedGrade's
 * defensePanel-aware identity union.
 */
export const submitExternalExaminerEvaluation = async (req: Request, res: Response) => {
  const { token } = req.params;
  const { kind, scores, comment } = req.body;
  if (!token || typeof token !== 'string') return res.status(400).json({ message: L(req, 'Missing token.', 'חסר אסימון גישה.') });
  if (kind !== 'project' && kind !== 'defense') return res.status(400).json({ message: L(req, 'kind must be "project" or "defense".', 'הערך של kind חייב להיות "project" או "defense".') });

  try {
    const tokenRef = db.collection('examinerTokens').doc(token);
    const tokenSnap = await tokenRef.get();
    if (!tokenSnap.exists) return res.status(404).json({ message: L(req, 'Invalid or unknown token.', 'אסימון לא תקין או לא מוכר.') });
    const tokenDoc = tokenSnap.data()!;
    // Same OTP re-check every other Express endpoint in this controller does
    // — this bypasses firestore.rules entirely via the Admin SDK.
    if (!isOtpSessionFresh(tokenDoc)) {
      return res.status(403).json({ message: L(req, 'Please verify your access code first.', 'יש לאמת את קוד הגישה שלך תחילה.') });
    }
    if (tokenDoc.facultyId !== 'data_science' || !tokenDoc.finalGradeComponents) {
      return res.status(400).json({ message: L(req, 'This token does not use the digitized examiner evaluation form.', 'אסימון זה אינו משתמש בטופס ההערכה הדיגיטלי של הבוחן.') });
    }
    if (!tokenDoc.milestoneId) {
      return res.status(400).json({ message: L(req, 'This token has no associated milestone.', 'לאסימון זה אין אבן דרך משויכת.') });
    }

    // CRITICAL FIX: identical gate to projectController.ts's
    // submitExaminerEvaluation (the internal-examiner equivalent) — an
    // external examiner could previously submit a score at any time,
    // including before the defense had even happened, since this was never
    // checked here at all (only the internal side had even a cosmetic
    // client-side "grading opens after the defense" hint, and that wasn't
    // enforced server-side either). Re-fetches the milestone fresh rather
    // than trusting tokenDoc.defenseDate, which is a one-time snapshot taken
    // when the examiner was assigned — before date-matching resolves a real
    // date, and never updated afterward.
    const milestoneRef = db.collection('milestones').doc(tokenDoc.milestoneId);
    const milestoneSnap = await milestoneRef.get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: L(req, 'Associated milestone not found.', 'אבן הדרך המשויכת לא נמצאה.') });
    const milestone = milestoneSnap.data()!;
    if (!milestone.dueDate) {
      return res.status(403).json({ message: L(req, 'Evaluation opens once a defense date has been agreed and set.', 'ההערכה תיפתח לאחר שתיאום תאריך ההגנה יושלם.') });
    }
    const defenseDay = dayjs(milestone.dueDate.toDate()).tz(TZ).startOf('day');
    if (dayjs().tz(TZ).isBefore(defenseDay)) {
      return res.status(403).json({ message: L(req, `Evaluation opens on the agreed defense date (${defenseDay.format('DD/MM/YYYY')}).`, `ההערכה תיפתח בתאריך ההגנה שנקבע (${defenseDay.format('DD/MM/YYYY')}).`) });
    }

    if (kind === 'project' && !comment?.trim()) {
      return res.status(400).json({ message: L(req, 'A written comment is required.', 'נדרשת הערה כתובה.') });
    }

    const rubric: GradingComponentSpec[] = kind === 'project'
      ? tokenDoc.finalGradeComponents.examinerProjectEvaluation.components
      : tokenDoc.finalGradeComponents.examinerDefenseEvaluation.components;

    let computed;
    try {
      computed = computeGradingComponentsScore(rubric, scores ?? {});
    } catch (err: any) {
      return res.status(400).json({ message: clientMessage(err, L(req, 'Invalid evaluation scores.', 'ציוני ההערכה אינם תקינים.')) });
    }

    const evaluationResult = {
      scores: computed.breakdown,
      total: computed.total,
      comment: comment?.trim() ?? '',
      submittedAt: new Date().toISOString(),
    };

    // Transaction, not a plain get()-then-update() of the WHOLE opinion map:
    // the project and defense rubrics are normally submitted as two separate
    // requests (two forms/tabs) within moments of each other. Merging onto
    // `priorOpinion` read all the way up at the top of this handler (well
    // before this write) meant whichever request wrote second could
    // silently drop the other kind's just-submitted result, and `bothDone`
    // would then never see both. Re-reads fresh inside the transaction so
    // the merge always starts from whatever the other request actually
    // committed.
    await db.runTransaction(async (transaction) => {
      const freshSnap = await transaction.get(tokenRef);
      const priorOpinion = (freshSnap.data()?.opinion ?? {}) as Record<string, unknown>;
      const nextOpinion = { ...priorOpinion, [kind]: evaluationResult };
      // Only 'submitted' once BOTH rubrics are in — mirrors
      // AssignmentCard.tsx's `graded = projectDone && defenseDone` for the
      // internal-examiner equivalent of this same milestone type.
      const bothDone = !!(nextOpinion as any).project && !!(nextOpinion as any).defense;

      transaction.update(tokenRef, {
        opinion: nextOpinion,
        ...(bothDone ? { status: 'submitted', submittedAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
        accessLog: admin.firestore.FieldValue.arrayUnion({ action: 'submitted_opinion', timestamp: new Date().toISOString() }),
      });
    });

    // milestoneRef already fetched above for the defense-date gate — reused
    // here rather than re-declared (tokenDoc.milestoneId was already
    // validated non-empty there too).
    await milestoneRef.update({
      [`examinerEvaluations.${token}.${kind}`]: {
        scores: computed.breakdown,
        total: computed.total,
        comment: comment?.trim() ?? '',
        submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await maybeFinalizeAutoCalculatedGrade(milestoneRef);

    await logAuditEvent({
      userId: token,
      userRole: 'external_examiner',
      action: 'examiner_evaluation_submitted',
      entityType: 'milestone',
      entityId: tokenDoc.milestoneId ?? token,
      newValue: { kind, total: computed.total },
    });

    return res.status(200).json({ success: true, total: computed.total });
  } catch (error: any) {
    console.error('submitExternalExaminerEvaluation error:', error);
    return res.status(500).json({ message: L(req, 'Failed to submit evaluation.', 'שליחת ההערכה נכשלה.') });
  }
};

export const getDefenseAccessStatus = async (req: Request, res: Response) => {
  const { grantCode } = req.params;
  if (!grantCode || typeof grantCode !== 'string') return res.status(400).json({ message: L(req, 'Missing grant code.', 'חסר קוד הרשאה.') });

  try {
    const grantSnap = await db.collection('defenseAccessGrants').doc(grantCode).get();
    if (!grantSnap.exists) return res.status(404).json({ message: L(req, 'Invalid or unknown access grant.', 'הרשאת הגישה אינה תקינה או לא מוכרת.') });
    const grant = grantSnap.data()!;

    const now = dayjs();
    const activatesAt = dayjs(grant.activatesAt);
    const expiresAt = dayjs(grant.expiresAt);

    // 'revoked' = staff moved the defense date and a new grant was issued
    // for the new day (coordinatorController.ts's reissueDefenseAccessGrants).
    const status = grant.status === 'revoked'
      ? 'revoked'
      : grant.status === 'admin_extended' && now.isBefore(dayjs(grant.adminExtension?.newExpiresAt))
      ? 'active'
      : now.isBefore(activatesAt)
        ? 'not_yet_active'
        : now.isAfter(grant.status === 'admin_extended' ? dayjs(grant.adminExtension?.newExpiresAt) : expiresAt)
          ? 'expired'
          : 'active';

    const isFirstOpen = !(grant.accessLog && grant.accessLog.length > 0);

    await grantSnap.ref.update({
      accessLog: [...(grant.accessLog ?? []), { action: 'opened', timestamp: new Date().toISOString() }],
    });

    if (status === 'active' && isFirstOpen) {
      await logAuditEvent({
        userId: grantCode,
        userRole: 'external_examiner',
        action: 'examiner_document_viewed',
        entityType: 'defenseAccessGrant',
        entityId: grantCode,
        newValue: { projectId: grant.projectId, milestoneId: grant.milestoneId },
      });
    }

    if (status !== 'active') {
      return res.status(200).json({
        status,
        examinerName: grant.examinerName,
        defenseDateISO: grant.defenseDateISO,
        activatesAt: grant.activatesAt,
        expiresAt: grant.status === 'admin_extended' ? grant.adminExtension?.newExpiresAt : grant.expiresAt,
      });
    }

    const [projectSnap, milestoneSnap] = await Promise.all([
      db.collection('projects').doc(grant.projectId).get(),
      db.collection('milestones').doc(grant.milestoneId).get(),
    ]);
    const project = projectSnap.data();
    const milestone = milestoneSnap.data();

    return res.status(200).json({
      status: 'active',
      examinerName: grant.examinerName,
      defenseDateISO: grant.defenseDateISO,
      projectTitleHe: project?.titleHe ?? '',
      projectTitleEn: project?.titleEn ?? '',
      room: milestone?.defenseRoom ?? null,
      building: milestone?.defenseBuilding ?? null,
      onlineDefenseLink: milestone?.onlineDefenseLink ?? null,
      time: milestone?.defenseTime ?? null,
      defenseMode: milestone?.defenseMode ?? null,
      zoomMeeting: milestone?.zoomMeeting ?? null,
    });
  } catch (error: any) {
    console.error('getDefenseAccessStatus error:', error);
    return res.status(500).json({ message: L(req, 'Internal server error', 'שגיאת שרת פנימית.') });
  }
};

// ─── Examiner opinion form (external examiners) ──────────────────────────────
// Same form and rules as the internal endpoints in examinerOpinionController.ts
// (see services/examinerOpinion.ts), keyed by the access token — an external
// examiner has no Firebase account. Each re-checks the OTP session, since
// these bypass firestore.rules via the Admin SDK.

async function loadTokenOpinionMilestone(req: Request, res: Response) {
  const { token } = req.params;
  if (!token || typeof token !== 'string') {
    res.status(400).json({ message: L(req, 'Missing token.', 'חסר אסימון גישה.') });
    return null;
  }
  const tokenSnap = await db.collection('examinerTokens').doc(token).get();
  if (!tokenSnap.exists) {
    res.status(404).json({ message: L(req, 'Invalid or unknown token.', 'אסימון לא תקין או לא מוכר.') });
    return null;
  }
  const tokenDoc = tokenSnap.data()!;
  if (!isOtpSessionFresh(tokenDoc)) {
    res.status(403).json({ message: L(req, 'Please verify your access code first.', 'יש לאמת את קוד הגישה שלך תחילה.') });
    return null;
  }
  // Examiners are often assigned at project level (no milestoneId on the
  // token) — fall back to the project's opinion-form milestone, provided
  // this token is actually on its panel.
  let snap: FirebaseFirestore.DocumentSnapshot | null = tokenDoc.milestoneId ? await db.collection('milestones').doc(tokenDoc.milestoneId).get() : null;
  if ((!snap?.exists || !snap.data()?.examinerOpinionForm) && tokenDoc.projectId) {
    const candidates = await db.collection('milestones').where('projectId', '==', tokenDoc.projectId).get();
    snap = candidates.docs.find((d) => d.data().examinerOpinionForm
      && (d.data().defensePanel ?? []).some((p: { type?: string; ref?: string }) => p.type === 'external' && p.ref === token)) ?? null;
  }
  const ref = snap?.ref;
  if (!snap?.exists || !ref || !snap.data()?.examinerOpinionForm) {
    res.status(400).json({ message: L(req, 'This invitation does not use the examiner opinion form.', 'הזמנה זו אינה משתמשת בטופס חוות דעת הבוחן.') });
    return null;
  }
  return { token, tokenDoc, ref, data: snap.data()! };
}

function sendTokenOpinionError(req: Request, res: Response, err: unknown, en: string, he: string) {
  if (err instanceof OpinionError) return res.status(err.status).json({ message: L(req, err.en, err.he) });
  console.error(en, err);
  return res.status(500).json({ message: L(req, en, he) });
}

/** GET /api/examiner-access/:token/opinion-form */
export const getExternalOpinionForm = async (req: Request, res: Response) => {
  try {
    const loaded = await loadTokenOpinionMilestone(req, res);
    if (!loaded) return;
    return res.status(200).json(await buildOpinionView(loaded.ref.id, loaded.data, { kind: 'examiner', key: loaded.token }, {
      name: loaded.tokenDoc.examinerName ?? '',
      institution: loaded.tokenDoc.examinerInstitution ?? '',
    }));
  } catch (err) {
    return sendTokenOpinionError(req, res, err, 'Failed to load the examiner form.', 'טעינת טופס הבוחן נכשלה.');
  }
};

/** POST /api/examiner-access/:token/opinion-form/parse — one Word file. */
export const parseExternalOpinionUpload = async (req: Request, res: Response) => {
  try {
    const loaded = await loadTokenOpinionMilestone(req, res);
    if (!loaded) return;
    return res.status(200).json(await parseAndStoreUpload(req, loaded.ref, loaded.data, loaded.token));
  } catch (err) {
    return sendTokenOpinionError(req, res, err, 'Could not read the uploaded form.', 'לא ניתן היה לקרוא את הטופס שהועלה.');
  }
};

/** POST /api/examiner-access/:token/opinion-form — multipart, like the internal one. */
export const submitExternalOpinionForm = async (req: Request, res: Response) => {
  try {
    const loaded = await loadTokenOpinionMilestone(req, res);
    if (!loaded) return;
    const files = ((req as any).files as Express.Multer.File[]) ?? [];
    const fileUrls: string[] = [];
    for (const file of files) {
      const result = await cloudinary.uploader.upload(`data:${file.mimetype};base64,${file.buffer.toString('base64')}`, { resource_type: 'raw', folder: 'examinerOpinions' });
      fileUrls.push(result.secure_url);
    }
    const result = await submitOpinion({
      milestoneRef: loaded.ref,
      key: loaded.token,
      external: true,
      signerName: loaded.tokenDoc.examinerName || loaded.tokenDoc.name || '',
      // An external examiner belongs to no faculty in this system — the
      // signature carries the thesis's faculty, with their own institution
      // in the signed opinion itself.
      signerFacultyId: loaded.data.facultyId ?? '',
      input: req.body,
      fileUrls,
      uploadedFormUrl: await uploadedFormUrlFor(loaded.ref.id, loaded.token),
    });
    await logAuditEvent({
      userId: loaded.token,
      userRole: 'external_examiner',
      action: 'examiner_evaluation_submitted',
      entityType: 'milestone',
      entityId: loaded.ref.id,
      newValue: { examinerOpinion: true, conclusion: req.body?.conclusion ?? null },
    });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return sendTokenOpinionError(req, res, err, 'Failed to submit the examiner form.', 'שליחת טופס הבוחן נכשלה.');
  }
};
