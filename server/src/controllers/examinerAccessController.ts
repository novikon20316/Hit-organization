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
import { requestExaminerOtp, verifyExaminerOtp } from '../services/examinerAccess.js';
import { computeGradingComponentsScore } from '../services/milestoneRouting.js';
import type { GradingComponentSpec } from '../services/workflowTemplates.js';
import { maybeFinalizeAutoCalculatedGrade } from './projectController.js';
import { logAuditEvent } from '../services/auditLog.js';

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
  if (!token || typeof token !== 'string') return res.status(400).json({ message: 'Missing token.' });

  try {
    const { sent } = await requestExaminerOtp(token);
    if (!sent) {
      return res.status(502).json({ message: 'Failed to send the verification code. Please try again.' });
    }
    return res.status(200).json({ success: true });
  } catch (error: any) {
    if (error.message === 'Invalid or unknown token.') {
      return res.status(404).json({ message: error.message });
    }
    console.error('requestOtp error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * POST /api/examiner-access/:token/verify-otp
 * Body: { code: string }
 */
export const verifyOtp = async (req: Request, res: Response) => {
  const { token } = req.params;
  const { code } = req.body;
  if (!token || typeof token !== 'string') return res.status(400).json({ message: 'Missing token.' });
  if (!code || typeof code !== 'string') return res.status(400).json({ message: 'Missing code.' });

  try {
    const result = await verifyExaminerOtp(token, code);
    if (!result.verified) {
      return res.status(400).json({ message: result.reason || 'Verification failed.' });
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
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * GET /api/examiner-access/:token/defense-dates
 * Status + window info for the external examiner's defense-date submission.
 */
export const getDefenseDateStatus = async (req: Request, res: Response) => {
  const { token } = req.params;
  if (!token || typeof token !== 'string') return res.status(400).json({ message: 'Missing token.' });

  try {
    const tokenSnap = await db.collection('examinerTokens').doc(token).get();
    if (!tokenSnap.exists) return res.status(404).json({ message: 'Invalid or unknown token.' });
    const tokenDoc = tokenSnap.data()!;
    // MEDIUM FIX: otpVerified was only ever enforced by firestore.rules'
    // `allow get` on this same doc — but that rule only gates direct client
    // Firestore reads. This Express endpoint goes through the Admin SDK,
    // which bypasses Firestore rules entirely, so anyone in possession of
    // the raw token (leaked via email forwarding, a mail-security link
    // scanner, browser history sync, etc.) could check status without ever
    // proving control of the examiner's inbox — defeating the OTP step.
    if (!tokenDoc.otpVerified) {
      return res.status(403).json({ message: 'Please verify your access code first.' });
    }

    const milestoneSnap = await db.collection('milestones').doc(tokenDoc.milestoneId).get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: 'Associated milestone not found.' });
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
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * POST /api/examiner-access/:token/defense-dates
 * Body: { candidateDates: string[] }
 */
export const submitExternalDefenseDates = async (req: Request, res: Response) => {
  const { token } = req.params;
  const { candidateDates } = req.body;
  if (!token || typeof token !== 'string') return res.status(400).json({ message: 'Missing token.' });

  try {
    const tokenSnap = await db.collection('examinerTokens').doc(token).get();
    if (!tokenSnap.exists) return res.status(404).json({ message: 'Invalid or unknown token.' });
    const tokenDoc = tokenSnap.data()!;
    // MEDIUM FIX: same OTP gap as getDefenseDateStatus above — this Express
    // endpoint bypasses firestore.rules entirely via the Admin SDK, so it
    // must re-check otpVerified itself rather than relying on the rule.
    if (!tokenDoc.otpVerified) {
      return res.status(403).json({ message: 'Please verify your access code first.' });
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
    return res.status(400).json({ message: error.message || 'Failed to submit candidate dates.' });
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
  if (!token || typeof token !== 'string') return res.status(400).json({ message: 'Missing token.' });
  if (kind !== 'project' && kind !== 'defense') return res.status(400).json({ message: 'kind must be "project" or "defense".' });

  try {
    const tokenRef = db.collection('examinerTokens').doc(token);
    const tokenSnap = await tokenRef.get();
    if (!tokenSnap.exists) return res.status(404).json({ message: 'Invalid or unknown token.' });
    const tokenDoc = tokenSnap.data()!;
    // Same OTP re-check every other Express endpoint in this controller does
    // — this bypasses firestore.rules entirely via the Admin SDK.
    if (!tokenDoc.otpVerified) {
      return res.status(403).json({ message: 'Please verify your access code first.' });
    }
    if (tokenDoc.facultyId !== 'data_science' || !tokenDoc.finalGradeComponents) {
      return res.status(400).json({ message: 'This token does not use the digitized examiner evaluation form.' });
    }
    if (!tokenDoc.milestoneId) {
      return res.status(400).json({ message: 'This token has no associated milestone.' });
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
    if (!milestoneSnap.exists) return res.status(404).json({ message: 'Associated milestone not found.' });
    const milestone = milestoneSnap.data()!;
    if (!milestone.dueDate) {
      return res.status(403).json({ message: 'Evaluation opens once a defense date has been agreed and set.' });
    }
    const defenseDay = dayjs(milestone.dueDate.toDate()).tz(TZ).startOf('day');
    if (dayjs().tz(TZ).isBefore(defenseDay)) {
      return res.status(403).json({ message: `Evaluation opens on the agreed defense date (${defenseDay.format('DD/MM/YYYY')}).` });
    }

    if (kind === 'project' && !comment?.trim()) {
      return res.status(400).json({ message: 'A written comment is required.' });
    }

    const rubric: GradingComponentSpec[] = kind === 'project'
      ? tokenDoc.finalGradeComponents.examinerProjectEvaluation.components
      : tokenDoc.finalGradeComponents.examinerDefenseEvaluation.components;

    let computed;
    try {
      computed = computeGradingComponentsScore(rubric, scores ?? {});
    } catch (err: any) {
      return res.status(400).json({ message: err.message || 'Invalid evaluation scores.' });
    }

    const evaluationResult = {
      scores: computed.breakdown,
      total: computed.total,
      comment: comment?.trim() ?? '',
      submittedAt: new Date().toISOString(),
    };

    const priorOpinion = (tokenDoc.opinion ?? {}) as Record<string, unknown>;
    const nextOpinion = { ...priorOpinion, [kind]: evaluationResult };
    // Only 'submitted' once BOTH rubrics are in — mirrors
    // AssignmentCard.tsx's `graded = projectDone && defenseDone` for the
    // internal-examiner equivalent of this same milestone type.
    const bothDone = !!(nextOpinion as any).project && !!(nextOpinion as any).defense;

    await tokenRef.update({
      opinion: nextOpinion,
      ...(bothDone ? { status: 'submitted', submittedAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
      accessLog: admin.firestore.FieldValue.arrayUnion({ action: 'submitted_opinion', timestamp: new Date().toISOString() }),
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
    return res.status(500).json({ message: 'Failed to submit evaluation.' });
  }
};

export const getDefenseAccessStatus = async (req: Request, res: Response) => {
  const { grantCode } = req.params;
  if (!grantCode || typeof grantCode !== 'string') return res.status(400).json({ message: 'Missing grant code.' });

  try {
    const grantSnap = await db.collection('defenseAccessGrants').doc(grantCode).get();
    if (!grantSnap.exists) return res.status(404).json({ message: 'Invalid or unknown access grant.' });
    const grant = grantSnap.data()!;

    const now = dayjs();
    const activatesAt = dayjs(grant.activatesAt);
    const expiresAt = dayjs(grant.expiresAt);

    const status = grant.status === 'admin_extended' && now.isBefore(dayjs(grant.adminExtension?.newExpiresAt))
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
    });
  } catch (error: any) {
    console.error('getDefenseAccessStatus error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
