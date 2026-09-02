// backend/controllers/milestoneController.js
import admin from 'firebase-admin';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import multer from 'multer';
import { RequestHandler } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { logAuditEvent } from '../services/auditLog.js';
import { hasActionGrant, withinCoordinatorScope, resolveMilestoneScope, resolveProjectScope, resolveStaffForScope, effectiveFacultyIds } from '../services/scopeAuthorization.js';
import { isChainDriven } from '../services/milestoneRouting.js';
import { sanitizeMilestoneForViewer } from '../services/milestoneVisibility.js';
import { buildRevisionArchiveUpdate } from '../services/milestoneRevisions.js';
import { applySingleDueDateOverride, applyBulkDueDateOverride } from '../services/deadlineOverride.js';
import { requestExceptionalAction } from '../services/exceptionalActions.js';
import { submissionRequirementMet, resolveMilestoneOrder, type FormFieldSpec } from '../services/workflowTemplates.js';
import { onEnterCommitteeStage } from './committeeReviewController.js';
import { notifyUser } from '../services/notify.js';
import { fixMulterFilenameEncoding } from '../utils/fileNameEncoding.js';
import { logProjectRecordEntry } from '../services/projectRecords.js';
import { getUserRoles, matchedRole } from '../middleware/auth.js';

const db = admin.firestore();

// ── Multer setup (memory storage — files available as buffers) ────────────────
const ALLOWED_MILESTONE_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'image/png',
  'image/jpeg',
]);

// Thrown from fileFilter below for an unsupported type — caught by
// handleUploadError, not left to multer's default "silently drop the file"
// behavior (cb(null, false)), which used to let a submission with a rejected
// file go through as if it had no file at all: no error shown to the
// student, and the supervisor never sees anything was ever attached.
class UnsupportedFileTypeError extends Error {
  code = 'UNSUPPORTED_FILE_TYPE';
  constructor(public fileName: string) {
    super(`Unsupported file type: ${fileName}`);
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MILESTONE_MIME_TYPES.has(file.mimetype)) {
      cb(new UnsupportedFileTypeError(fixMulterFilenameEncoding(file.originalname)));
      return;
    }
    cb(null, true);
  },
});
export const uploadMiddleware: RequestHandler = upload.array('files') as unknown as RequestHandler;

// Express error-handling middleware (4 args — the arity is how Express tells
// it apart from a regular middleware) mounted right after uploadMiddleware in
// routes/milestones.ts — catches both the fileFilter rejection above and
// multer's own errors (e.g. LIMIT_FILE_SIZE for the 20MB cap), and returns
// the same bilingual { message, messageHe, messageEn } shape every other
// submitMilestone validation error already uses, instead of falling through
// to index.ts's generic, English-only, unlocalized 500 handler.
export const handleUploadError: import('express').ErrorRequestHandler = (err, _req, res, next) => {
  if (err instanceof UnsupportedFileTypeError) {
    return res.status(400).json({
      message: `Unsupported file type: ${err.fileName}. Allowed: PDF, Word, ZIP, PNG, JPEG.`,
      messageHe: `סוג קובץ לא נתמך: ${err.fileName}. סוגים מותרים: PDF, Word, ZIP, PNG, JPEG.`,
      messageEn: `Unsupported file type: ${err.fileName}. Allowed: PDF, Word, ZIP, PNG, JPEG.`,
    });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      message: 'File too large — the limit is 20MB.',
      messageHe: 'הקובץ גדול מדי — המגבלה היא 20MB.',
      messageEn: 'File too large — the limit is 20MB.',
    });
  }
  return next(err);
};


// POST /api/milestones/:milestoneId/submit
export const submitMilestone = async (req: AuthenticatedRequest, res: Response) => {
  const { milestoneId } = req.params;
  const studentId = req.user?.uid;

  if (!milestoneId || typeof milestoneId !== 'string')
    return res.status(400).json({ message: 'Invalid milestoneId.' });
  if (!studentId)
    return res.status(401).json({ message: 'Unauthorized.' });

  try {
    // ✅ Fields come from req.body (multer parses form fields)
    const note = req.body?.note ?? '';
    const files = (req as any).files as Express.Multer.File[] ?? [];

    console.log('📥 Submit milestone:', { milestoneId, note, filesCount: files.length });

    // ── Update milestone in Firestore ───────────────────────────────────────
    const milestoneRef = db.collection('milestones').doc(milestoneId);
    const milestoneSnap = await milestoneRef.get();

    if (!milestoneSnap.exists)
      return res.status(404).json({ message: 'Milestone not found.' });

    const milestoneData = milestoneSnap.data()!;

    // Make sure the student owns this milestone
    const studentIds: string[] = milestoneData.studentIds ?? [];
    if (!studentIds.includes(studentId))
      return res.status(403).json({ message: 'Forbidden.' });

    // Team milestone (more than one owner — see projectEnrollment.ts) — once
    // any teammate has submitted, lock the rest out until it's rejected
    // (student-facing revision, reopening for anyone on the team) or fully
    // approved and the next milestone opens. A solo milestone keeps today's
    // behavior (a student may resubmit anytime before grading).
    if (studentIds.length > 1 && milestoneData.status !== 'pending' && milestoneData.status !== 'rejected') {
      return res.status(409).json({
        message: 'A teammate already submitted this milestone. Wait for it to be graded and approved before submitting again.',
        messageHe: 'חבר/ת קבוצה כבר הגיש/ה את אבן הדרך הזו. יש להמתין לבדיקה ואישור לפני הגשה נוספת.',
        messageEn: 'A teammate already submitted this milestone. Wait for it to be graded and approved before submitting again.',
      });
    }

    // A milestone with studentFormFields configured (currently only
    // data_science's research_proposal — see addResearchProposalStudentForm.ts)
    // is submitted as a structured form instead of the generic file+note —
    // the form itself has its own required-field validation below, so the
    // note/file submissionRequirement check (which doesn't apply here) is
    // skipped entirely for it.
    const studentFormFields: FormFieldSpec[] = milestoneData.studentFormFields ?? [];
    const isStructuredFormMilestone = studentFormFields.length > 0;
    let studentFormData: Record<string, unknown> | undefined;

    if (isStructuredFormMilestone) {
      try {
        studentFormData = typeof req.body?.formData === 'string' ? JSON.parse(req.body.formData) : req.body?.formData;
      } catch {
        return res.status(400).json({ message: 'Invalid formData.' });
      }
      if (!studentFormData || typeof studentFormData !== 'object') {
        return res.status(400).json({ message: 'formData is required for this milestone.' });
      }
      // Locked fields (autoFill) are never typed by the student — only the
      // freely-editable fields are checked for "required and present".
      const missing = studentFormFields.filter(
        (f) => f.required && !f.locked && (studentFormData![f.key] === undefined || studentFormData![f.key] === null || studentFormData![f.key] === '')
      );
      if (missing.length > 0) {
        return res.status(400).json({ message: `Missing required field(s): ${missing.map((f) => f.labelEn).join(', ')}` });
      }
    }

    // Checked before touching Cloudinary at all — no point uploading a file
    // for a submission that's about to be rejected anyway (or, worse,
    // silently accepting a comment-only submission on a milestone that
    // actually required a file). Doesn't apply to a structured-form
    // milestone, whose own field validation just ran above.
    if (!isStructuredFormMilestone && !submissionRequirementMet(milestoneData.submissionRequirement, files.length > 0, note.trim().length > 0)) {
      const req = milestoneData.submissionRequirement;
      const messageEn = 'This milestone requires ' + (req === 'both' ? 'a file and a comment.' : `a ${req}.`);
      const messageHe = 'אבן דרך זו דורשת ' + (req === 'both' ? 'קובץ והערה.' : req === 'file' ? 'קובץ.' : 'הערה.');
      // messageHe/messageEn let the client (which knows the student's own
      // language preference — the server has no per-user language field to
      // read, see contexts/LanguageContext.tsx) show this in the right
      // language; `message` stays the English fallback for any caller that
      // predates these fields.
      return res.status(400).json({ message: messageEn, messageHe, messageEn });
    }

    // Sorted by the milestone's OWN order (from the template it was created
    // under — see workflowTemplates.ts's resolveMilestoneOrder), not a
    // hardcoded type list — a faculty's template can reorder milestones or
    // define custom ones the old hardcoded list never knew about. Checked
    // before touching Cloudinary, same reasoning as the requirement check
    // above.
    const thisOrder = resolveMilestoneOrder(milestoneData);
    const previousSnap = await db.collection('milestones')
      .where('projectId', '==', milestoneData.projectId)
      .where('studentIds',  'array-contains', studentId)
      .get();

    // Matches the client's own definition of "done" (see ActiveDashboard.tsx/
    // Activedashboard.tsx's isUnlocked) — 'coordinator_approved' is the real
    // terminal status every milestone actually reaches; 'completed' is never
    // written anywhere, only checked defensively. Checking 'completed' alone
    // left the client's Submit button enabled (it considered the previous
    // milestone done) while this endpoint unconditionally rejected the
    // submission — the exact "previous milestones must be completed" error
    // students hit even after their prior milestone was genuinely approved.
    const allPrevCompleted = previousSnap.docs
      .filter(d => resolveMilestoneOrder(d.data()) < thisOrder)
      .every(d => d.data().status === 'coordinator_approved' || d.data().status === 'completed');

    if (!allPrevCompleted)
      return res.status(400).json({
        message: 'Previous milestones must be completed before submitting this one.',
        messageHe: 'יש להשלים את אבני הדרך הקודמות לפני הגשת אבן דרך זו.',
        messageEn: 'Previous milestones must be completed before submitting this one.',
      });

    // ── Upload files to Cloudinary ──────────────────────────────────────────
    const fileUrls: string[] = [];

    try {
      for (const file of files) {
        const base64 = file.buffer.toString('base64');
        const dataUri = `data:${file.mimetype};base64,${base64}`;

        // resource_type: 'raw' leaves the delivery URL without a file
        // extension unless told otherwise (Cloudinary generates a bare
        // hash public_id) — with no extension, the browser has no way to
        // know it's a PDF/etc. and Cloudinary can't return a useful
        // Content-Type, so any attempt to preview the file (e.g. the
        // milestone file panel's iframe) gets treated as an opaque
        // download instead of rendering inline. Passing the original
        // extension as `format` makes Cloudinary append it to the URL.
        const ext = file.originalname.includes('.') ? file.originalname.split('.').pop() : undefined;

        const result = await cloudinary.uploader.upload(dataUri, {
          resource_type: 'raw',
          folder: 'milestones',
          ...(ext ? { format: ext } : {}),
        });

        fileUrls.push(result.secure_url);
      }
    } catch (uploadError: any) {
      // A misconfigured/rotated Cloudinary credential (see the startup
      // warning in index.ts) surfaces here as a raw SDK error — e.g. "Must
      // supply api_key" — which used to reach the student verbatim, in
      // English only, with no indication it was a server-side problem and
      // not something wrong with their submission. Logged in full for
      // debugging; the student gets a clean, bilingual, actionable message.
      console.error('submitMilestone file upload error:', uploadError);
      return res.status(502).json({
        message: 'File upload failed. Please try again in a few minutes.',
        messageHe: 'העלאת הקובץ נכשלה. נא לנסות שוב בעוד מספר דקות.',
        messageEn: 'File upload failed. Please try again in a few minutes.',
      });
    }

    // Preserve the outgoing round (its file(s), note, and whatever decision
    // was made on it) before it gets overwritten below — see
    // services/milestoneRevisions.ts.
    const archiveUpdate = buildRevisionArchiveUpdate(milestoneData);

    await milestoneRef.update({
      status:         'submitted',
      submittedAt:    admin.firestore.FieldValue.serverTimestamp(),
      fileUrls,
      submissionNote: note,
      ...(studentFormData ? { studentFormData } : {}),
      ...(archiveUpdate ?? {}),
      // Chain-driven milestones restart the chain on every fresh submission
      // — see the identical addition in projectController.ts's
      // submitStudentMilestone (this is the second, mobile-facing route that
      // does the exact same submit/resubmit write).
      ...(isChainDriven(milestoneData)
        ? { currentStageIndex: 0, stageScores: {}, stageEnteredAt: admin.firestore.FieldValue.serverTimestamp() }
        : {}),
    });

    // The research-proposal form is where a project's real title first
    // becomes known when the student (not the supervisor) is the one filling
    // it in — mirrors submitStaffRecord's identical propagation
    // (supervisorController.ts) so anything reading project.titleHe/titleEn
    // doesn't need to reach into this milestone's studentFormData separately.
    if (milestoneData.type === 'research_proposal' && milestoneData.projectId
      && typeof studentFormData?.projectNameHe === 'string' && typeof studentFormData?.projectNameEn === 'string') {
      await db.collection('projects').doc(milestoneData.projectId).update({
        titleHe: studentFormData.projectNameHe,
        titleEn: studentFormData.projectNameEn,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await logProjectRecordEntry({
      projectId: milestoneData.projectId,
      type: archiveUpdate ? 'milestone_resubmitted' : 'milestone_submitted',
      actorId: studentId,
      actorRole: 'student',
      data: {
        milestoneId,
        milestoneType: milestoneData.type,
        milestoneName: { he: milestoneData.nameHe ?? milestoneData.type, en: milestoneData.nameEn ?? milestoneData.type },
        note,
        fileCount: fileUrls.length,
      },
    });

    // A fresh (or resubmitted) chain-driven milestone always restarts at
    // stage 0 above — if that stage routes to a committee, every member
    // needs notifying with the just-uploaded files/note, same as the
    // supervisor notification below but fanned out to the whole panel.
    if (isChainDriven(milestoneData) && milestoneData.routing[0]?.role === 'committee') {
      const freshMilestone = (await milestoneRef.get()).data()!;
      await onEnterCommitteeStage(milestoneId, freshMilestone);
    }

    // ── Notify supervisor + coordinator/administrative-coordinator staff ───
    const supervisorId  = milestoneData.supervisorId ?? null;
    const projectId     = milestoneData.projectId    ?? null;
    const milestoneTitle = { he: milestoneData.nameHe ?? milestoneData.type, en: milestoneData.nameEn ?? milestoneData.type };
    const projectTitle   = { he: milestoneData.projectTitleHe ?? '', en: milestoneData.projectTitleEn ?? '' };

    // Coordinators/administrative-coordinators oversee many students at once,
    // so their notification (unlike the supervisor's, who already knows who
    // their own student is) needs to be self-contained: who submitted, which
    // project/supervisor it's under, how the timing compares to the due
    // date, and what was actually attached — so staff can triage without
    // opening the project first.
    const [studentSnapForNotify, supervisorSnapForNotify] = await Promise.all([
      db.collection('users').doc(studentId).get(),
      supervisorId ? db.collection('users').doc(supervisorId).get() : Promise.resolve(null),
    ]);
    const studentName    = studentSnapForNotify.data()?.displayName || 'Unknown student';
    const supervisorName = supervisorSnapForNotify?.data()?.displayName || null;
    const submittedFileNames = files.map((f) => fixMulterFilenameEncoding(f.originalname));

    const dueDateForNotify: Date | null = milestoneData.dueDate?.toDate?.() ?? null;
    const timingText = { he: '', en: '' };
    if (dueDateForNotify) {
      const diffDays = Math.round((dueDateForNotify.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        timingText.he = `הוגש ${diffDays} ${diffDays === 1 ? 'יום' : 'ימים'} לפני המועד האחרון.`;
        timingText.en = `Submitted ${diffDays} day${diffDays === 1 ? '' : 's'} before the due date.`;
      } else if (diffDays < 0) {
        const lateDays = Math.abs(diffDays);
        timingText.he = `הוגש באיחור של ${lateDays} ${lateDays === 1 ? 'יום' : 'ימים'}.`;
        timingText.en = `Submitted ${lateDays} day${lateDays === 1 ? '' : 's'} late.`;
      } else {
        timingText.he = 'הוגש ביום המועד האחרון.';
        timingText.en = 'Submitted on the due date.';
      }
    }

    const staffBody = {
      he: [
        `${studentName} הגיש/ה את "${milestoneTitle.he}".`,
        projectTitle.he ? `פרויקט: ${projectTitle.he}` : null,
        supervisorName ? `מנחה: ${supervisorName}` : null,
        timingText.he || null,
        `קבצים: ${submittedFileNames.length ? submittedFileNames.join(', ') : 'לא צורפו קבצים'}`,
      ].filter(Boolean).join('\n'),
      en: [
        `${studentName} submitted "${milestoneTitle.en}".`,
        projectTitle.en ? `Project: ${projectTitle.en}` : null,
        supervisorName ? `Supervisor: ${supervisorName}` : null,
        timingText.en || null,
        `Files: ${submittedFileNames.length ? submittedFileNames.join(', ') : 'No files attached'}`,
      ].filter(Boolean).join('\n'),
    };

    // The supervisor is the one actually blocked on this (they must grade it
    // before the student can move on) — full multi-channel dispatch
    // (in-app + email + push + SMS, via notify.ts) rather than just an
    // in-app doc + push, so they see it even if they're not in the app.
    if (supervisorId) {
      await notifyUser({
        recipientId: supervisorId,
        type: 'milestone_submitted',
        titleHe: 'הגשה חדשה ממתינה לבדיקה 📤',
        titleEn: 'New Milestone Submission 📤',
        bodyHe:  `סטודנט הגיש את "${milestoneTitle.he}".`,
        bodyEn:  `A student submitted "${milestoneTitle.en}".`,
        relatedProjectId: projectId,
        relatedMilestoneId: milestoneId,
        emailData: { milestoneTitle, projectTitle },
        taskKind: 'milestone_action',
      });
    }

    // Coordinator and administrative-coordinator staff covering this
    // project's faculty/major also want to know a milestone came in, not
    // just the supervisor — same scope resolution notify.ts's callers use
    // elsewhere (defenseScheduling.ts, examinerEscalation.ts, etc.).
    //
    // Previously this stayed on a hand-rolled in-app+push-only path with no
    // email, on the theory that push already reached these staff. In
    // practice none of them carry an expoPushToken (that field is only ever
    // populated by the mobile app registering for Expo push — coordinators
    // and administrative coordinators work from the web dashboard), so push
    // silently no-opped and the only thing that ever landed was an unread
    // in-app bell they had no reason to go check — which is why this looked
    // like it worked (a Firestore doc *was* being written) but in practice
    // never actually notified anyone. Routed through notifyUser now, same
    // as the supervisor above, so they get a real email too; SMS stays off
    // to avoid fanning a paid channel out to every covering coordinator on
    // every single submission.
    const notifyStaffMilestoneSubmitted = (recipientId: string) => notifyUser({
      recipientId,
      type: 'milestone_submitted',
      titleHe: 'הגשה חדשה ממתינה לבדיקה 📤',
      titleEn: 'New Milestone Submission 📤',
      bodyHe:  staffBody.he,
      bodyEn:  staffBody.en,
      relatedProjectId: projectId,
      relatedMilestoneId: milestoneId,
      emailData: { milestoneTitle, projectTitle },
      taskKind: 'milestone_action',
      channels: { sms: false },
    });

    const projectScope = await resolveProjectScope(projectId);
    if (projectScope) {
      const [coordinatorIds, adminCoordinatorIds] = await Promise.all([
        resolveStaffForScope('coordinator', projectScope, supervisorId ? [supervisorId] : []),
        resolveStaffForScope('administrative_secretary', projectScope, supervisorId ? [supervisorId] : []),
      ]);
      const staffRecipientIds = [...new Set([...coordinatorIds, ...adminCoordinatorIds])].filter((id) => id !== supervisorId);
      await Promise.all(staffRecipientIds.map((id) => notifyStaffMilestoneSubmitted(id)));
    }

    return res.status(200).json({ success: true, message: 'Milestone submitted successfully.' });
  } catch (error: any) {
    console.error('submitMilestone error:', error);
    return res.status(500).json({ message: error.message || 'Failed to submit milestone.' });
  }
};

// PUT /api/milestones/:id
// Lets a coordinator/faculty_admin/administrative coordinator/system_admin adjust
// a milestone's due date — mirrors Milestonetimeline.tsx's own
// canCoordinatorAdjust gate. Modeled on defenseScheduling.ts's
// finalizeMatchedDate: validate role, write the update, notify the enrolled
// student(s). Overriding is allowed regardless of the milestone's current
// status — an emergency delay (illness, war, etc.) may need to push back a
// deadline even for a milestone already submitted or approved.
const UPDATE_MILESTONE_ROLES = ['coordinator', 'faculty_admin', 'administrative_secretary', 'system_admin'];
// P1 backlog item #12 — these two roles previously acted unilaterally
// (deadline_overridden was only ever audit-logged AFTER the write went
// through). They now need documented program_head/faculty_admin/system_admin
// sign-off first — see services/exceptionalActions.ts. faculty_admin/
// system_admin keep acting immediately: gating a senior role's own action
// behind its own approval would be circular.
const EXCEPTIONAL_ACTION_GATED_ROLES = ['coordinator', 'administrative_secretary'];

export const updateMilestoneByCoordinator = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const role = req.user?.role;
  const roles = req.user?.roles ?? [];

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ message: 'Invalid milestoneId.' });
  }
  if (!role || !(UPDATE_MILESTONE_ROLES.includes(role) || roles.some((r) => UPDATE_MILESTONE_ROLES.includes(r)))) {
    return res.status(403).json({ message: 'You do not have permission to update this milestone.' });
  }

  const updateScope = await resolveMilestoneScope(id);
  if (!updateScope) {
    return res.status(404).json({ message: 'Milestone not found.' });
  }
  if (!withinCoordinatorScope(req.user, updateScope) && !hasActionGrant(req.user, 'approve_milestones', updateScope)) {
    return res.status(403).json({ message: 'This milestone is outside your assigned scope.' });
  }

  const { dueDate, reason } = req.body;
  if (!dueDate) {
    return res.status(400).json({ message: 'Missing dueDate.' });
  }

  const parsedDate = new Date(dueDate);
  if (isNaN(parsedDate.getTime())) {
    return res.status(400).json({ message: 'Invalid dueDate.' });
  }

  try {
    if (EXCEPTIONAL_ACTION_GATED_ROLES.includes(role)) {
      if (typeof reason !== 'string' || !reason.trim()) {
        return res.status(400).json({ message: 'A documented reason is required to request this exceptional action.' });
      }
      const request = await requestExceptionalAction({
        type: 'deadline_override',
        payload: { milestoneId: id, dueDate: parsedDate.toISOString() },
        reason,
        facultyId: updateScope.facultyId,
        requestedBy: req.user!.uid,
        requestedByRole: role,
      });
      return res.status(202).json({
        success: true,
        pendingApproval: true,
        message: 'This deadline override requires program-head/faculty-admin approval before it takes effect.',
        request,
      });
    }

    const result = await applySingleDueDateOverride(id, parsedDate, typeof reason === 'string' ? reason : undefined, req.user!.uid, role);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('updateMilestoneByCoordinator error:', error);
    return res.status(500).json({ message: error.message || 'Failed to update milestone.' });
  }
};

// PUT /api/milestones/bulk-due-date
// Same permission/override rules as updateMilestoneByCoordinator above, but
// shifts one due date across every matching milestone at once — for
// faculty-wide delays (holidays, illness, war, etc.) instead of one project
// at a time. Body: { projectIds: string[], milestoneType?: string, dueDate: string, reason: string }.
// milestoneType narrows to one milestone type (e.g. "final_report"); omitted,
// every milestone across the given projects is shifted.
export const bulkUpdateMilestoneDueDates = async (req: AuthenticatedRequest, res: Response) => {
  const role = req.user?.role;
  const roles = req.user?.roles ?? [];

  if (!role || !(UPDATE_MILESTONE_ROLES.includes(role) || roles.some((r) => UPDATE_MILESTONE_ROLES.includes(r)))) {
    return res.status(403).json({ message: 'You do not have permission to bulk-update milestones.' });
  }

  const { projectIds, milestoneType, dueDate, reason } = req.body;
  if (!Array.isArray(projectIds) || projectIds.length === 0) {
    return res.status(400).json({ message: 'projectIds must be a non-empty array.' });
  }
  if (!dueDate) {
    return res.status(400).json({ message: 'Missing dueDate.' });
  }
  const parsedDate = new Date(dueDate);
  if (isNaN(parsedDate.getTime())) {
    return res.status(400).json({ message: 'Invalid dueDate.' });
  }

  // CRITICAL FIX: this endpoint used to check only the caller's ROLE, never
  // that the supplied projectIds actually belong to their own scope — unlike
  // its single-item sibling above (updateMilestoneByCoordinator), which
  // correctly calls resolveMilestoneScope + withinCoordinatorScope/
  // hasActionGrant. For coordinator/administrative coordinator this at least
  // routed through an exceptional-action approval that ALSO never
  // re-validated scope (see exceptionalActions.ts's decideExceptionalAction,
  // which executes the stored payload's projectIds as-is) — but faculty_admin
  // and system_admin bypass that approval gate entirely (see below), so for
  // them this previously executed immediately with zero scope check on the
  // project list at all. Every projectId is now resolved and checked before
  // ANY write happens — the whole batch is rejected (not silently trimmed)
  // if even one project is outside the caller's scope, so a caller always
  // knows to fix their input rather than getting a partial, unannounced result.
  const scopes = await Promise.all(projectIds.map((id) => resolveProjectScope(typeof id === 'string' ? id : null)));
  for (let i = 0; i < scopes.length; i++) {
    const scope = scopes[i];
    if (!scope) return res.status(404).json({ message: `Project not found: ${projectIds[i]}` });
    if (!withinCoordinatorScope(req.user, scope) && !hasActionGrant(req.user, 'approve_milestones', scope)) {
      return res.status(403).json({ message: `Project outside your assigned scope: ${projectIds[i]}` });
    }
  }

  try {
    if (EXCEPTIONAL_ACTION_GATED_ROLES.includes(role)) {
      if (typeof reason !== 'string' || !reason.trim()) {
        return res.status(400).json({ message: 'A documented reason is required to request this exceptional action.' });
      }
      // Faculty is resolved per-project at approval time by the underlying
      // apply function; the request itself is scoped by the requester's own
      // facultyId so it lands in the right approver's queue.
      const request = await requestExceptionalAction({
        type: 'bulk_deadline_override',
        payload: {
          projectIds,
          dueDate: parsedDate.toISOString(),
          ...(typeof milestoneType === 'string' && milestoneType ? { milestoneType } : {}),
        },
        reason,
        facultyId: req.user!.facultyId,
        requestedBy: req.user!.uid,
        requestedByRole: role,
      });
      return res.status(202).json({
        success: true,
        pendingApproval: true,
        message: 'This bulk deadline override requires program-head/faculty-admin approval before it takes effect.',
        request,
      });
    }

    const result = await applyBulkDueDateOverride(
      projectIds,
      typeof milestoneType === 'string' ? milestoneType : undefined,
      parsedDate,
      typeof reason === 'string' ? reason : undefined,
      req.user!.uid,
      role,
    );
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('bulkUpdateMilestoneDueDates error:', error);
    return res.status(error.message === 'No matching milestones found.' ? 404 : 500).json({ message: error.message || 'Failed to bulk-update milestones.' });
  }
};

export const approveMilestone = async (req:AuthenticatedRequest, res:Response) => {
  const { milestoneId } = req.params;
  if(!milestoneId || typeof milestoneId !== 'string'){
    return res.status(500).json({
      message: "Error milestone ID"
    })
  }
  await db.runTransaction(async (transaction) => {
    const milestoneRef = db.collection('milestones').doc(milestoneId);
    const milestoneSnap = await transaction.get(milestoneRef);
    
    // 1. Check if the document exists
    if (!milestoneSnap.exists) {
      throw new Error("Milestone document does not exist");
    }

    // 2. Safely extract the data
    const milestoneData = milestoneSnap.data();
    
    // 3. Ensure studentId exists before using it
    const studentId = milestoneData?.studentId; 
    if (!studentId) {
      throw new Error("Milestone is missing a valid studentId");
    }

    // 4. Proceed with the logic
    transaction.update(milestoneRef, {
      status: 'approved',
      approvedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    const notificationRef = db.collection('notifications').doc();
    transaction.set(notificationRef, {
      recipientId: studentId, // Now TypeScript knows this is safe
      type: 'milestone_approved',
      // ... content
    });
  });

  res.status(200).json({ message: 'Milestone approved' });
};

// GET /api/milestones  — fetch milestones by query params
export const getMilestonesByQuery = async (req: AuthenticatedRequest, res: Response) => {
  const requester = req.user;
  if (!requester) return res.status(401).json({ error: 'Unauthorized.' });

  // 🔑 FIX: Look for projectId in EITHER the query string OR the URL path params!
  const projectId = req.query.projectId || req.params.projectId;
  let { supervisorId, studentId, facultyId } = req.query as {
    supervisorId?: string; studentId?: string; facultyId?: string;
  };
  const statusFilterRaw = req.query.statusFilter || req.query['statusFilter[]'];
  // Set only for administrative coordinator below — Firestore 'in' query
  // instead of the single '==' facultyId the other faculty-manager roles use.
  let facultyIdIn: string[] | undefined;

  // This endpoint previously trusted these filters completely, so any
  // authenticated user (e.g. a student) could call it with no params at all
  // and get every milestone — and every grade — in the system. Every role
  // below is forced onto its own scope; client-supplied values for that
  // role's own filter are ignored rather than trusted.
  // Scope by the requester's full role set (roles[] plus primary role), not
  // just the primary role — a multi-role user (e.g. a coordinator who also
  // holds 'supervisor' as a secondary role) otherwise falls into the wrong
  // branch below, or none at all, and never sees milestones scoped to a role
  // they legitimately hold. Same pattern as auth.ts's getUserRoles/matchedRole
  // doc comment and the fix already applied in supervisorController.ts's
  // createSupervisorProject.
  const requesterRoles = getUserRoles(requester);
  if (requesterRoles.includes('student')) {
    studentId = requester.uid;
  } else if (requesterRoles.includes('supervisor') || requesterRoles.includes('secondary_supervisor')) {
    supervisorId = requester.uid;
  } else if (requesterRoles.includes('administrative_secretary')) {
    // Her facultyId field is always the literal string 'all' (see
    // CROSS_FACULTY_ROLES in userController.ts) — filtering on it directly,
    // like the other faculty-manager roles below, would silently match
    // zero real milestones, always (same root cause already fixed in
    // getProjectCoordinatorDashboard). Her real scope lives in
    // coordinatorScopes (per-degree, assigned via CoordinatorScopesModal).
    // Milestones don't carry a `major` field of their own (see
    // resolveMilestoneScope's own comment on this), so this scopes to her
    // assigned faculty/faculties, not down to the exact degree — the same
    // limitation that helper already accepts elsewhere.
    const scopeFacultyIds = [...new Set((requester.coordinatorScopes ?? []).map((s) => s.facultyId))];
    if (scopeFacultyIds.length === 0) {
      // No scope assigned yet — nothing to show (not "everything").
      return res.status(200).json({ milestones: [] });
    }
    facultyIdIn = scopeFacultyIds;
  } else if (requesterRoles.includes('coordinator')) {
    // No independent *FacultyIds extras field of its own — unchanged from
    // before (see facultyAdminController.ts's DELEGATE_ADMIN_ROLES, which
    // doesn't include coordinator).
    facultyId = requester.facultyId;
  } else if (requesterRoles.includes('faculty_admin') || requesterRoles.includes('program_head')) {
    // Own faculty plus any extras granted for that specific role (see
    // effectiveFacultyIds) — 'all' would only happen if a system_admin
    // explicitly set one of these roles' facultyId to 'all'.
    const role = matchedRole(requester, ['faculty_admin', 'program_head'])!;
    const field = role === 'faculty_admin' ? 'facultyAdminFacultyIds' : 'programHeadFacultyIds';
    const eff = effectiveFacultyIds(requester, field);
    if (eff === 'all') { /* unscoped, same as a cross-faculty role below */ }
    else facultyIdIn = eff;
  } else if (requesterRoles.includes('grad_school_head') || requesterRoles.includes('internal_examiner')) {
    // Used to be unconditionally cross-faculty by role alone; now scoped by
    // its own effective faculty set, same as faculty_admin/program_head —
    // 'all' (explicit, or a grandfathered legacy account) stays unscoped,
    // matching this role's original firestore.rules-aligned access level.
    const role = matchedRole(requester, ['grad_school_head', 'internal_examiner'])!;
    const field = role === 'grad_school_head' ? 'gradSchoolHeadFacultyIds' : 'internalExaminerFacultyIds';
    const eff = effectiveFacultyIds(requester, field);
    if (eff !== 'all') facultyIdIn = eff;
  } else if (!requesterRoles.includes('system_admin')) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  // system_admin may query broadly/unscoped by design.

  try {
    let q: any = db.collection('milestones');

    if (projectId) {
      q = q.where('projectId', '==', projectId);
    }
    if (supervisorId) {
      q = q.where('supervisorId', '==', supervisorId);
    }
    if (studentId) {
      q = q.where('studentIds', 'array-contains', studentId);
    }
    if (facultyIdIn) {
      q = q.where('facultyId', 'in', facultyIdIn);
    } else if (facultyId) {
      q = q.where('facultyId', '==', facultyId);
    }
    
    if (statusFilterRaw) {
      const statuses = Array.isArray(statusFilterRaw) ? statusFilterRaw : [statusFilterRaw];
      q = q.where('status', 'in', statuses);
    }
    console.log('🎯 Milestone query params:', { projectId, studentId, supervisorId, facultyId });
    const snap = await q.get();
    console.log('🎯 Milestones found:', snap.docs.length);
    const viewerRoles = requester.roles?.length ? requester.roles : [requester.role];
    const milestones = snap.docs.map((d: any) => {
      const data = d.data();
      console.log('  📌 Milestone:', d.id, {
        studentIds: data.studentIds,
        projectId: data.projectId,
        status: data.status,
        type: data.type,
      });
      return sanitizeMilestoneForViewer({
        id: d.id,
        ...data,
        // ✅ Convert ALL Timestamps to ISO strings so React Native can use them
        dueDate:      data.dueDate?.toDate?.()?.toISOString() ?? null,
        submittedAt:  data.submittedAt?.toDate?.()?.toISOString() ?? null,
        createdAt:    data.createdAt?.toDate?.()?.toISOString() ?? null,
        defenseDate:  data.defenseDate?.toDate?.()?.toISOString() ?? null,
        coordinatorApprovedAt: data.coordinatorApprovedAt?.toDate?.()?.toISOString() ?? null,
      }, requester.uid, viewerRoles);
    });
    
    return res.status(200).json({ milestones });
  } catch (e: any) {
    console.error("Milestone Controller Query Error: ", e);
    return res.status(500).json({ error: e.message });
  }
};


