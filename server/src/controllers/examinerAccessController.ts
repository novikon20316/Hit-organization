// src/controllers/examinerAccessController.ts
//
// Public (no verifyToken) endpoints for external examiners, who have no
// Firebase Auth account — identity comes from the token/grant code itself,
// re-derived server-side from Firestore, never trusted from the client.
import { Request, Response } from 'express';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { db } from '../config/firebase.js';
import { submitCandidateDatesAndResolve, examinerKeyOf } from '../services/defenseScheduling.js';
import { requestExaminerOtp, verifyExaminerOtp } from '../services/examinerAccess.js';
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
      status: submittedThisRound ? 'awaiting_other_examiner' : 'awaiting_your_dates',
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
