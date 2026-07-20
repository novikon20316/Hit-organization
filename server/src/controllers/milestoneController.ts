// backend/controllers/milestoneController.js
import admin from 'firebase-admin';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import multer from 'multer';
import { RequestHandler } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { logAuditEvent } from '../services/auditLog.js';
import { deriveProcessType, getActiveMilestonesFor } from '../services/workflowTemplates.js';
import { hasActionGrant, withinCoordinatorScope, resolveMilestoneScope } from '../services/scopeAuthorization.js';
import { buildRevisionArchiveUpdate } from '../services/milestoneRevisions.js';

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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_MILESTONE_MIME_TYPES.has(file.mimetype));
  },
});
export const uploadMiddleware: RequestHandler = upload.array('files') as unknown as RequestHandler;


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

    // ── Upload files to Cloudinary ──────────────────────────────────────────
    const fileUrls: string[] = [];

    for (const file of files) {
      const base64 = file.buffer.toString('base64');
      const dataUri = `data:${file.mimetype};base64,${base64}`;

      const result = await cloudinary.uploader.upload(dataUri, {
        resource_type: 'raw',
        folder: 'milestones',
      });

      fileUrls.push(result.secure_url);
    }

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

    const MILESTONE_ORDER = ['research_proposal', 'progress_report', 'final_report', 'defense'];
    const thisTypeIndex = MILESTONE_ORDER.indexOf(milestoneData.type);

    if (thisTypeIndex > 0) {
      // Fetch all milestones for this student on the same project
      const previousSnap = await db.collection('milestones')
        .where('projectId', '==', milestoneData.projectId)
        .where('studentIds',  'array-contains', studentId)
        .get();

      const allPrevCompleted = previousSnap.docs
        .filter(d => MILESTONE_ORDER.indexOf(d.data().type) < thisTypeIndex)
        .every(d => d.data().status === 'completed');

      if (!allPrevCompleted)
        return res.status(400).json({ message: 'Previous milestones must be completed before submitting this one.' });
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
      ...(archiveUpdate ?? {}),
    });

    // ── Notify supervisor ───────────────────────────────────────────────────
    const supervisorId  = milestoneData.supervisorId ?? null;
    const projectId     = milestoneData.projectId    ?? null;

    if (supervisorId) {
      const supervisorSnap = await db.collection('users').doc(supervisorId).get();
      const pushToken = supervisorSnap.data()?.expoPushToken ?? null;

      await db.collection('notifications').add({
        recipientId:        supervisorId,
        type:               'milestone_submitted',
        titleHe:            'הגשה חדשה ממתינה לבדיקה 📤',
        titleEn:            'New Milestone Submission 📤',
        bodyHe:             `סטודנט הגיש את "${milestoneData.nameHe ?? milestoneData.type}".`,
        bodyEn:             `A student submitted "${milestoneData.nameEn ?? milestoneData.type}".`,
        isRead:             false,
        relatedProjectId:   projectId,
        relatedMilestoneId: milestoneId,
        createdAt:          admin.firestore.FieldValue.serverTimestamp(),
      });

      if (pushToken) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to:    pushToken,
            title: '📤 New Milestone Submission',
            body:  `A student submitted "${milestoneData.nameEn ?? milestoneData.type}".`,
            data:  { projectId, milestoneId },
          }),
        });
      }
    }

    return res.status(200).json({ success: true, message: 'Milestone submitted successfully.' });
  } catch (error: any) {
    console.error('submitMilestone error:', error);
    return res.status(500).json({ message: error.message || 'Failed to submit milestone.' });
  }
};

// PUT /api/milestones/:id
// Lets a coordinator/faculty_admin/administrative_secretary/system_admin adjust
// a milestone's due date — mirrors Milestonetimeline.tsx's own
// canCoordinatorAdjust gate. Modeled on defenseScheduling.ts's
// finalizeMatchedDate: validate role, write the update, notify the enrolled
// student(s). Overriding is allowed regardless of the milestone's current
// status — an emergency delay (illness, war, etc.) may need to push back a
// deadline even for a milestone already submitted or approved.
const UPDATE_MILESTONE_ROLES = ['coordinator', 'faculty_admin', 'administrative_secretary', 'system_admin'];

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
    const milestoneRef = db.collection('milestones').doc(id);
    const milestoneSnap = await milestoneRef.get();
    if (!milestoneSnap.exists) {
      return res.status(404).json({ message: 'Milestone not found.' });
    }
    const milestoneData = milestoneSnap.data()!;
    const previousDueDate = milestoneData.dueDate ?? null;

    await milestoneRef.update({
      dueDate: admin.firestore.Timestamp.fromDate(parsedDate),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await logAuditEvent({
      userId: req.user!.uid,
      userRole: role,
      action: 'deadline_overridden',
      entityType: 'milestone',
      entityId: id,
      oldValue: { dueDate: previousDueDate?.toDate?.()?.toISOString?.() ?? previousDueDate },
      newValue: { dueDate: parsedDate.toISOString() },
      explanation: typeof reason === 'string' ? reason : undefined,
    });

    // Notification failures must never mask the due-date update above, which
    // has already committed by this point — same defensive pattern as
    // maybeOpenDefenseScheduling() in coordinatorController.ts.
    const studentIds: string[] = milestoneData.studentIds ?? [];
    try {
      await Promise.all(studentIds.map((studentId) =>
        db.collection('notifications').add({
          recipientId: studentId,
          type: 'milestone_date_adjusted',
          titleHe: 'תאריך יעד עודכן 📅',
          titleEn: 'Milestone Due Date Updated 📅',
          bodyHe: `תאריך היעד עבור "${milestoneData.nameHe ?? milestoneData.type}" עודכן.`,
          bodyEn: `The due date for "${milestoneData.nameEn ?? milestoneData.type}" was updated.`,
          isRead: false,
          relatedProjectId: milestoneData.projectId ?? null,
          relatedMilestoneId: id,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      ));
    } catch (notifyError) {
      console.error(`Failed to notify students of due-date change for milestone ${id}:`, notifyError);
    }

    return res.status(200).json({ success: true, message: 'Milestone due date updated.' });
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

  try {
    // Firestore 'in' queries cap at 30 values — chunk projectIds accordingly.
    const CHUNK_SIZE = 30;
    const chunks: string[][] = [];
    for (let i = 0; i < projectIds.length; i += CHUNK_SIZE) {
      chunks.push(projectIds.slice(i, i + CHUNK_SIZE));
    }

    const snaps = await Promise.all(chunks.map((chunk) => {
      let q: FirebaseFirestore.Query = db.collection('milestones').where('projectId', 'in', chunk);
      if (typeof milestoneType === 'string' && milestoneType) {
        q = q.where('type', '==', milestoneType);
      }
      return q.get();
    }));
    const docs = snaps.flatMap((s) => s.docs);

    if (docs.length === 0) {
      return res.status(404).json({ message: 'No matching milestones found.' });
    }

    const affected = docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ref: doc.ref,
        projectId: data.projectId as string | undefined,
        studentIds: (data.studentIds ?? []) as string[],
        nameHe: data.nameHe as string | undefined,
        nameEn: data.nameEn as string | undefined,
        type: data.type as string | undefined,
        previousDueDate: data.dueDate ?? null,
      };
    });

    // Firestore batches cap at 500 writes — chunk into multiple batches.
    const BATCH_LIMIT = 450;
    let batch = db.batch();
    let opsInBatch = 0;
    const commits: Promise<unknown>[] = [];
    for (const m of affected) {
      batch.update(m.ref, {
        dueDate: admin.firestore.Timestamp.fromDate(parsedDate),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      opsInBatch++;
      if (opsInBatch >= BATCH_LIMIT) {
        commits.push(batch.commit());
        batch = db.batch();
        opsInBatch = 0;
      }
    }
    if (opsInBatch > 0) commits.push(batch.commit());
    await Promise.all(commits);

    await Promise.all(affected.map((m) =>
      logAuditEvent({
        userId: req.user!.uid,
        userRole: role,
        action: 'deadline_overridden',
        entityType: 'milestone',
        entityId: m.id,
        oldValue: { dueDate: m.previousDueDate?.toDate?.()?.toISOString?.() ?? m.previousDueDate },
        newValue: { dueDate: parsedDate.toISOString() },
        explanation: typeof reason === 'string' ? reason : undefined,
      })
    ));

    // Notification failures must never mask the due-date updates above, which
    // have already committed by this point — same defensive pattern as
    // updateMilestoneByCoordinator.
    try {
      await Promise.all(affected.flatMap((m) =>
        m.studentIds.map((studentId) =>
          db.collection('notifications').add({
            recipientId: studentId,
            type: 'milestone_date_adjusted',
            titleHe: 'תאריך יעד עודכן 📅',
            titleEn: 'Milestone Due Date Updated 📅',
            bodyHe: `תאריך היעד עבור "${m.nameHe ?? m.type}" עודכן.`,
            bodyEn: `The due date for "${m.nameEn ?? m.type}" was updated.`,
            isRead: false,
            relatedProjectId: m.projectId ?? null,
            relatedMilestoneId: m.id,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          })
        )
      ));
    } catch (notifyError) {
      console.error('Failed to notify students of bulk due-date change:', notifyError);
    }

    return res.status(200).json({
      success: true,
      message: `Updated ${affected.length} milestone(s).`,
      updatedCount: affected.length,
    });
  } catch (error: any) {
    console.error('bulkUpdateMilestoneDueDates error:', error);
    return res.status(500).json({ message: error.message || 'Failed to bulk-update milestones.' });
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

// Cross-faculty / faculty-manager taxonomy mirrors firestore.rules' isCrossFaculty()
// / isFacultyManager() helpers — keep in sync with mobile/firestore.rules.
const MILESTONE_QUERY_CROSS_FACULTY_ROLES = ['grad_school_head', 'internal_examiner', 'system_admin'];
const MILESTONE_QUERY_FACULTY_MANAGER_ROLES = ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary'];

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

  // This endpoint previously trusted these filters completely, so any
  // authenticated user (e.g. a student) could call it with no params at all
  // and get every milestone — and every grade — in the system. Every role
  // below is forced onto its own scope; client-supplied values for that
  // role's own filter are ignored rather than trusted.
  if (requester.role === 'student') {
    studentId = requester.uid;
  } else if (requester.role === 'supervisor' || requester.role === 'secondary_supervisor') {
    supervisorId = requester.uid;
  } else if (MILESTONE_QUERY_FACULTY_MANAGER_ROLES.includes(requester.role)) {
    facultyId = requester.facultyId;
  } else if (!MILESTONE_QUERY_CROSS_FACULTY_ROLES.includes(requester.role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  // Cross-faculty roles (grad_school_head, internal_examiner, system_admin) may
  // query broadly/unscoped by design — matches their firestore.rules access level.

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
    if (facultyId) {
      q = q.where('facultyId', '==', facultyId);
    }
    
    if (statusFilterRaw) {
      const statuses = Array.isArray(statusFilterRaw) ? statusFilterRaw : [statusFilterRaw];
      q = q.where('status', 'in', statuses);
    }
    console.log('🎯 Milestone query params:', { projectId, studentId, supervisorId, facultyId });
    const snap = await q.get();
    console.log('🎯 Milestones found:', snap.docs.length);
    const milestones = snap.docs.map((d: any) => {
      const data = d.data();
      console.log('  📌 Milestone:', d.id, {
        studentIds: data.studentIds,
        projectId: data.projectId,
        status: data.status,
        type: data.type,
      });
      return {
        id: d.id,
        ...data,
        // ✅ Convert ALL Timestamps to ISO strings so React Native can use them
        dueDate:      data.dueDate?.toDate?.()?.toISOString() ?? null,
        submittedAt:  data.submittedAt?.toDate?.()?.toISOString() ?? null,
        createdAt:    data.createdAt?.toDate?.()?.toISOString() ?? null,
        defenseDate:  data.defenseDate?.toDate?.()?.toISOString() ?? null,
        coordinatorApprovedAt: data.coordinatorApprovedAt?.toDate?.()?.toISOString() ?? null,
      };
    });
    
    return res.status(200).json({ milestones });
  } catch (e: any) {
    console.error("Milestone Controller Query Error: ", e);
    return res.status(500).json({ error: e.message });
  }
};

// ─── Initialize roadmap ───────────────────────────────────────────────────────
const ROADMAP_INIT_ROLES = [
  'supervisor', 'secondary_supervisor', 'coordinator', 'administrative_secretary',
  'faculty_admin', 'program_head', 'grad_school_head', 'system_admin',
];

export const initializeRoadMap = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user?.role || !ROADMAP_INIT_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  try {
    const { projectId, studentIds, facultyId, supervisorId } = req.body;

    if (!projectId || !studentIds || !supervisorId || !facultyId) {
      return res.status(400).json({ error: 'Missing required fields: projectId, studentIds, supervisorId, facultyId.' });
    }

    // Same faculty-configurable workflow-template lookup used by the live
    // enrollment path (services/projectEnrollment.ts) — see
    // services/workflowTemplates.ts. Falls back to the app's long-standing
    // defaults if this faculty/process type has no approved template yet.
    const projectSnap = await db.collection('projects').doc(projectId).get();
    const projectData = projectSnap.data() ?? {};
    const processType = deriveProcessType(projectData.degreeType, projectData.projectType);
    const milestoneTemplates = await getActiveMilestonesFor(facultyId, processType);

    const batch    = db.batch();
    const baseDate = new Date();

    for (const template of milestoneTemplates) {
      const dueDate = new Date();
      dueDate.setDate(baseDate.getDate() + template.dueDaysFromStart);

      const milestoneRef = db.collection('milestones').doc();
      batch.set(milestoneRef, {
        projectId,
        studentIds,
        facultyId,
        supervisorId,
        type:            template.type,
        nameHe:          template.nameHe,
        nameEn:          template.nameEn,
        status:          'pending',
        dueDate:         admin.firestore.Timestamp.fromDate(dueDate),
        createdAt:       admin.firestore.FieldValue.serverTimestamp(),
        supervisorScore: null,
        finalGrade:      null,
        fileUrls:        [],
        ...(template.requiresExaminers
          ? { examinerIds: [], examiner1Score: null, examiner2Score: null }
          : {}),
      });
    }

    await batch.commit();
    return res.status(200).json({ success: true, message: 'Roadmap initialized.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

