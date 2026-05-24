// backend/controllers/milestoneController.js
import admin from 'firebase-admin';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';

const db = admin.firestore();

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

    const snap = await q.get();
    const milestones = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    
    return res.status(200).json({ milestones });
  } catch (e: any) {
    console.error("Milestone Controller Query Error: ", e);
    return res.status(500).json({ error: e.message });
  }
};

// POST /api/milestones/submit — student submits a milestone
export const submitMilestone = async (req:AuthenticatedRequest, res:Response) => {
  const { projectId, milestoneType, fileUrl, comments } = req.body;
  if (!projectId || !milestoneType || !fileUrl) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  try {
    const snap = await db.collection('milestones')
      .where('projectId', '==', projectId)
      .where('type',      '==', milestoneType)
      .limit(1)
      .get();
    if (snap.empty || !snap.docs[0]) 
      return res.status(404).json({ error: 'Milestone not found.' });
    await snap.docs[0].ref.update({
      status:         'submitted',
      fileUrls:       [fileUrl],
      submissionNote: comments ?? '',
      submittedAt:    admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.status(200).json({ success: true });
  } catch (e: any) {
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