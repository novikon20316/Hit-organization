// backend/controllers/milestoneController.js
import admin from 'firebase-admin';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import multer from 'multer';
import { RequestHandler } from 'express';
import { v2 as cloudinary } from 'cloudinary';

const db = admin.firestore();

// ── Multer setup (memory storage — files available as buffers) ────────────────
const upload = multer({ storage: multer.memoryStorage() });
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

    await milestoneRef.update({
      status:         'submitted',
      submittedAt:    admin.firestore.FieldValue.serverTimestamp(),
      fileUrls,
      submissionNote: note,
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

const MILESTONE_TEMPLATES = [
  { type: 'research_proposal', nameHe: 'הצעת מחקר', nameEn: 'Research Proposal', days: 30 },
  { type: 'progress_report', nameHe: 'דו"ח התקדמות', nameEn: 'Progress Report', days: 120 },
  { type: 'final_report', nameHe: 'דו"ח מסכם', nameEn: 'Final Report', days: 210 },
  { type: 'defense', nameHe: 'בחינת הגנה', nameEn: 'Defense Exam', days: 240 }
];

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
  // 🔑 FIX: Look for projectId in EITHER the query string OR the URL path params!
  const projectId = req.query.projectId || req.params.projectId;
  const { supervisorId, studentId, facultyId } = req.query;
  const statusFilterRaw = req.query.statusFilter || req.query['statusFilter[]'];

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
export const initializeRoadMap = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { projectId, studentIds, facultyId, supervisorId } = req.body;
 
    if (!projectId || !studentIds || !supervisorId) {
      return res.status(400).json({ error: 'Missing required fields: projectId, studentIds, supervisorId.' });
    }
 
    const batch    = db.batch();
    const baseDate = new Date();
 
    for (const template of MILESTONE_TEMPLATES) {
      const dueDate = new Date();
      dueDate.setDate(baseDate.getDate() + template.days);
 
      const milestoneRef = db.collection('milestones').doc();
      batch.set(milestoneRef, {
        projectId,
        studentIds,
        facultyId:       facultyId || 'computer_science',
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
        examinerIds:     [],
        examiner1Score:  null,
        examiner2Score:  null,
      });
    }
 
    await batch.commit();
    return res.status(200).json({ success: true, message: 'Roadmap initialized.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};