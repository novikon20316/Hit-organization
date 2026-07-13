// src/controllers/facultyTemplateController.ts
//
// Handles project templates that supervisors propose and faculty admins manage.
// A "faculty template" is a pre-approved project blueprint that supervisors can
// submit for faculty review, and faculty admins can approve/reject/publish.
//
// Endpoints served:
//   GET    /api/faculty-templates/dashboard?facultyId=xxx   → getFacultyTemplateDashboard
//   GET    /api/faculty-templates                           → (same handler, no facultyId filter)
//   POST   /api/faculty-templates                           → createFacultyTemplate
//   PUT    /api/faculty-templates/:templateId               → updateFacultyTemplate
//   DELETE /api/faculty-templates/:templateId               → deleteFacultyTemplate
//   POST   /api/faculty-templates/proposals/:templateId/approve → approveTemplateProposal
//   POST   /api/faculty-templates/proposals/:templateId/reject  → rejectTemplateProposal

import admin from 'firebase-admin';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { logAuditEvent } from '../services/auditLog.js';

const db = admin.firestore();

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/faculty-templates/dashboard?facultyId=xxx
 * Returns all templates for the given faculty, split into approved templates
 * and pending proposals awaiting review.
 * Called by Facultytemplatemanager.tsx on mount.
 */
export const getFacultyTemplateDashboard = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;

  if (!uid) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  // facultyId can come from the query string (manager screen) or fall back to
  // the authenticated user's own facultyId
  let { facultyId } = req.query as { facultyId?: string };

  try {
    // If no facultyId provided in query, derive it from the user document
    if (!facultyId) {
      const userSnap = await db.collection('users').doc(uid).get();
      if (!userSnap.exists) {
        return res.status(404).json({ message: 'User not found.' });
      }
      facultyId = userSnap.data()?.facultyId;
    }

    if (!facultyId) {
      return res.status(400).json({ message: 'facultyId could not be resolved.' });
    }

    const snap = await db.collection('facultyTemplates')
      .where('facultyId', '==', facultyId)
      .orderBy('createdAt', 'desc')
      .get();

    const templates = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    // Split into approved/published templates and pending proposals
    const approved = templates.filter((t: any) => t.status === 'approved' || t.status === 'published');
    const proposals = templates.filter((t: any) => t.status === 'pending' || t.status === 'rejected');

    return res.status(200).json({
      facultyId,
      templates: approved,
      proposals,
      counts: {
        total: templates.length,
        approved: approved.length,
        pending: proposals.filter((t: any) => t.status === 'pending').length,
        rejected: proposals.filter((t: any) => t.status === 'rejected').length,
      },
    });
  } catch (error: any) {
    console.error('getFacultyTemplateDashboard error:', error);
    return res.status(500).json({ message: 'Failed to load faculty template dashboard.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/faculty-templates
 * Creates a new template proposal. Supervisors submit proposals; faculty admins
 * submit pre-approved templates (status set based on caller's role).
 * Body: { titleHe, titleEn, descriptionHe?, descriptionEn?, skills?, degree, type, supervisorId? }
 * Called by Facultytemplatemanager.tsx.
 */
export const createFacultyTemplate = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;

  if (!uid) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  const {
    titleHe, titleEn,
    descriptionHe, descriptionEn,
    skills, degree, type,
    supervisorId,
  } = req.body;

  if (!titleHe || !titleEn || !degree || !type) {
    return res.status(400).json({
      message: 'Missing required fields: titleHe, titleEn, degree, type.',
    });
  }

  try {
    // Resolve caller's role and faculty
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const userData = userSnap.data()!;
    const callerRole: string = userData.role ?? '';
    const facultyId: string = userData.facultyId ?? '';

    // Faculty admins create pre-approved templates; supervisors submit proposals
    const initialStatus = ['faculty_admin', 'system_admin'].includes(callerRole)
      ? 'approved'
      : 'pending';

    const templateRef = db.collection('facultyTemplates').doc();
    await templateRef.set({
      titleHe: titleHe.trim(),
      titleEn: titleEn.trim(),
      descriptionHe: descriptionHe?.trim() ?? '',
      descriptionEn: descriptionEn?.trim() ?? '',
      skills: skills ?? '',
      degree,
      type,
      facultyId,
      supervisorId: supervisorId ?? uid,
      createdBy: uid,
      status: initialStatus,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // If a supervisor submitted a proposal, notify faculty admin(s)
    if (initialStatus === 'pending') {
      const adminsSnap = await db.collection('users')
        .where('role', '==', 'faculty_admin')
        .where('facultyId', '==', facultyId)
        .get();

      const batch = db.batch();
      adminsSnap.docs.forEach((adminDoc) => {
        const notifRef = db.collection('notifications').doc();
        batch.set(notifRef, {
          recipientId: adminDoc.id,
          type: 'template_proposal_submitted',
          titleHe: 'הצעת תבנית פרויקט חדשה',
          titleEn: 'New project template proposal',
          bodyHe: `מנחה הגיש הצעת תבנית: "${titleEn}".`,
          bodyEn: `A supervisor submitted a template proposal: "${titleEn}".`,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          relatedTemplateId: templateRef.id,
          chatId: null,
        });
      });
      await batch.commit();
    }

    return res.status(201).json({
      success: true,
      id: templateRef.id,
      status: initialStatus,
      message: initialStatus === 'approved'
        ? 'Template created and published.'
        : 'Proposal submitted for faculty review.',
    });
  } catch (error: any) {
    console.error('createFacultyTemplate error:', error);
    return res.status(500).json({ message: 'Failed to create faculty template.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * PUT /api/faculty-templates/:templateId
 * Updates an existing template. Only the creator or a faculty admin may edit.
 * Body: any subset of { titleHe, titleEn, descriptionHe, descriptionEn, skills, degree, type }
 * Called by Facultytemplatemanager.tsx when saving edits.
 */
export const updateFacultyTemplate = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const { templateId } = req.params;

  if (!uid) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }
  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ message: 'Invalid or missing templateId.' });
  }

  const {
    titleHe, titleEn,
    descriptionHe, descriptionEn,
    skills, degree, type,
  } = req.body;

  try {
    const templateRef = db.collection('facultyTemplates').doc(templateId);
    const templateSnap = await templateRef.get();

    if (!templateSnap.exists) {
      return res.status(404).json({ message: 'Template not found.' });
    }

    const templateData = templateSnap.data()!;

    // Resolve caller's role for authorization
    const userSnap = await db.collection('users').doc(uid).get();
    const callerRole: string = userSnap.data()?.role ?? '';
    const isAdmin = ['faculty_admin', 'system_admin'].includes(callerRole);
    const isCreator = templateData.createdBy === uid;

    if (!isAdmin && !isCreator) {
      return res.status(403).json({ message: 'Forbidden: you can only edit your own templates.' });
    }

    // Build update payload — only include fields that were actually sent
    const updates: Record<string, any> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (titleHe !== undefined) updates.titleHe = titleHe.trim();
    if (titleEn !== undefined) updates.titleEn = titleEn.trim();
    if (descriptionHe !== undefined) updates.descriptionHe = descriptionHe.trim();
    if (descriptionEn !== undefined) updates.descriptionEn = descriptionEn.trim();
    if (skills !== undefined) updates.skills = skills;
    if (degree !== undefined) updates.degree = degree;
    if (type !== undefined) updates.type = type;

    await templateRef.update(updates);

    return res.status(200).json({ success: true, message: 'Template updated.' });
  } catch (error: any) {
    console.error('updateFacultyTemplate error:', error);
    return res.status(500).json({ message: 'Failed to update template.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * DELETE /api/faculty-templates/:templateId
 * Permanently deletes a template. Only the creator or a faculty admin may delete.
 * Called by Facultytemplatemanager.tsx.
 */
export const deleteFacultyTemplate = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const { templateId } = req.params;

  if (!uid) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }
  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ message: 'Invalid or missing templateId.' });
  }

  try {
    const templateRef = db.collection('facultyTemplates').doc(templateId);
    const templateSnap = await templateRef.get();

    if (!templateSnap.exists) {
      return res.status(404).json({ message: 'Template not found.' });
    }

    const templateData = templateSnap.data()!;

    const userSnap = await db.collection('users').doc(uid).get();
    const callerRole: string = userSnap.data()?.role ?? '';
    const isAdmin = ['faculty_admin', 'system_admin'].includes(callerRole);
    const isCreator = templateData.createdBy === uid;

    if (!isAdmin && !isCreator) {
      return res.status(403).json({ message: 'Forbidden: you can only delete your own templates.' });
    }

    await templateRef.delete();

    return res.status(200).json({ success: true, message: 'Template deleted.' });
  } catch (error: any) {
    console.error('deleteFacultyTemplate error:', error);
    return res.status(500).json({ message: 'Failed to delete template.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/faculty-templates/proposals/:templateId/approve
 * Faculty admin approves a supervisor's pending template proposal.
 * Body: { note?: string }
 * Notifies the supervisor who submitted the proposal.
 * Called by Facultytemplatemanager.tsx.
 */
export const approveTemplateProposal = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const { templateId } = req.params;
  const { note } = req.body;

  if (!uid) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }
  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ message: 'Invalid or missing templateId.' });
  }

  try {
    // Only faculty admins and system admins may approve proposals
    const userSnap = await db.collection('users').doc(uid).get();
    const callerRole: string = userSnap.data()?.role ?? '';

    if (!['faculty_admin', 'system_admin'].includes(callerRole)) {
      return res.status(403).json({ message: 'Forbidden: only faculty admins can approve proposals.' });
    }

    const templateRef = db.collection('facultyTemplates').doc(templateId);
    const templateSnap = await templateRef.get();

    if (!templateSnap.exists) {
      return res.status(404).json({ message: 'Template proposal not found.' });
    }

    const templateData = templateSnap.data()!;

    if (templateData.status !== 'pending') {
      return res.status(400).json({ message: `Proposal is already "${templateData.status}".` });
    }

    const batch = db.batch();

    // 1. Approve the template
    batch.update(templateRef, {
      status: 'approved',
      approvedBy: uid,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      adminNote: note ?? null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 2. Notify the supervisor who created the proposal
    const supervisorId: string | null = templateData.createdBy ?? null;
    if (supervisorId) {
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        recipientId: supervisorId,
        type: 'template_proposal_approved',
        titleHe: 'הצעת תבנית אושרה',
        titleEn: 'Template proposal approved',
        bodyHe: `הצעת התבנית "${templateData.titleEn}" אושרה על ידי הפקולטה.`,
        bodyEn: `Your template proposal "${templateData.titleEn}" has been approved.`,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        relatedTemplateId: templateId,
        chatId: null,
      });
    }

    await batch.commit();

    await logAuditEvent({
      userId: uid,
      userRole: callerRole,
      action: 'template_proposal_approved',
      entityType: 'facultyTemplate',
      entityId: templateId,
      oldValue: { status: 'pending' },
      newValue: { status: 'approved' },
      explanation: note,
    });

    return res.status(200).json({ success: true, message: 'Proposal approved.' });
  } catch (error: any) {
    console.error('approveTemplateProposal error:', error);
    return res.status(500).json({ message: 'Failed to approve template proposal.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/faculty-templates/proposals/:templateId/reject
 * Faculty admin rejects a supervisor's pending template proposal.
 * Body: { reason: string }
 * Notifies the supervisor who submitted the proposal.
 * Called by Facultytemplatemanager.tsx.
 */
export const rejectTemplateProposal = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const { templateId } = req.params;
  const { reason } = req.body;

  if (!uid) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }
  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ message: 'Invalid or missing templateId.' });
  }
  if (!reason || typeof reason !== 'string') {
    return res.status(400).json({ message: 'A rejection reason is required.' });
  }

  try {
    const userSnap = await db.collection('users').doc(uid).get();
    const callerRole: string = userSnap.data()?.role ?? '';

    if (!['faculty_admin', 'system_admin'].includes(callerRole)) {
      return res.status(403).json({ message: 'Forbidden: only faculty admins can reject proposals.' });
    }

    const templateRef = db.collection('facultyTemplates').doc(templateId);
    const templateSnap = await templateRef.get();

    if (!templateSnap.exists) {
      return res.status(404).json({ message: 'Template proposal not found.' });
    }

    const templateData = templateSnap.data()!;

    if (templateData.status !== 'pending') {
      return res.status(400).json({ message: `Proposal is already "${templateData.status}".` });
    }

    const batch = db.batch();

    // 1. Reject the template, preserving the reason so the supervisor can revise
    batch.update(templateRef, {
      status: 'rejected',
      rejectedBy: uid,
      rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      rejectionReason: reason,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 2. Notify the supervisor
    const supervisorId: string | null = templateData.createdBy ?? null;
    if (supervisorId) {
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        recipientId: supervisorId,
        type: 'template_proposal_rejected',
        titleHe: 'הצעת תבנית נדחתה',
        titleEn: 'Template proposal rejected',
        bodyHe: `הצעת התבנית "${templateData.titleEn}" נדחתה. סיבה: ${reason}`,
        bodyEn: `Your template proposal "${templateData.titleEn}" was rejected. Reason: ${reason}`,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        relatedTemplateId: templateId,
        chatId: null,
      });
    }

    await batch.commit();

    await logAuditEvent({
      userId: uid,
      userRole: callerRole,
      action: 'template_proposal_rejected',
      entityType: 'facultyTemplate',
      entityId: templateId,
      oldValue: { status: 'pending' },
      newValue: { status: 'rejected' },
      explanation: reason,
    });

    return res.status(200).json({ success: true, message: 'Proposal rejected.' });
  } catch (error: any) {
    console.error('rejectTemplateProposal error:', error);
    return res.status(500).json({ message: 'Failed to reject template proposal.' });
  }
};