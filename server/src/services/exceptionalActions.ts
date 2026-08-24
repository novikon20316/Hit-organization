// src/services/exceptionalActions.ts
//
// P1 backlog item #12 — coordinators previously acted unilaterally on
// deadline overrides (logAuditEvent only ran AFTER the write). This models
// that as a real pending-approval gate: a coordinator/administrative coordinator
// request is stored here instead of executing, and only a program_head/
// faculty_admin/system_admin decision actually runs the mutation (via
// services/deadlineOverride.ts) or rejects it.

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { logAuditEvent } from './auditLog.js';
import { applySingleDueDateOverride, applyBulkDueDateOverride } from './deadlineOverride.js';

export type ExceptionalActionType = 'deadline_override' | 'bulk_deadline_override';

export interface SingleDeadlinePayload {
  milestoneId: string;
  dueDate: string; // ISO
}
export interface BulkDeadlinePayload {
  projectIds: string[];
  milestoneType?: string;
  dueDate: string; // ISO
}

export interface ExceptionalActionRequest {
  id: string;
  type: ExceptionalActionType;
  payload: SingleDeadlinePayload | BulkDeadlinePayload;
  reason: string;
  facultyId: string;
  requestedBy: string;
  requestedByRole: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
}

function serialize(id: string, data: FirebaseFirestore.DocumentData): ExceptionalActionRequest {
  return {
    id,
    type: data.type,
    payload: data.payload,
    reason: data.reason ?? '',
    facultyId: data.facultyId ?? '',
    requestedBy: data.requestedBy,
    requestedByRole: data.requestedByRole,
    status: data.status,
    createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
    decidedBy: data.decidedBy ?? null,
    decidedAt: data.decidedAt?.toDate?.().toISOString() ?? null,
    decisionReason: data.decisionReason ?? null,
  };
}

export async function requestExceptionalAction(input: {
  type: ExceptionalActionType;
  payload: SingleDeadlinePayload | BulkDeadlinePayload;
  reason: string;
  facultyId: string;
  requestedBy: string;
  requestedByRole: string;
}): Promise<ExceptionalActionRequest> {
  const ref = await db.collection('exceptionalActionRequests').add({
    type: input.type,
    payload: input.payload,
    reason: input.reason,
    facultyId: input.facultyId,
    requestedBy: input.requestedBy,
    requestedByRole: input.requestedByRole,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
  });

  await logAuditEvent({
    userId: input.requestedBy,
    userRole: input.requestedByRole,
    action: 'exceptional_action_requested',
    entityType: 'exceptionalActionRequest',
    entityId: ref.id,
    newValue: { type: input.type, payload: input.payload },
    explanation: input.reason,
  });

  const snap = await ref.get();
  return serialize(ref.id, snap.data()!);
}

/** effectiveFacultyIds undefined/'all' returns every pending request (system_admin,
 *  or a faculty_admin/program_head/grad_school_head explicitly kept/set cross-faculty —
 *  see scopeAuthorization.ts's effectiveFacultyIds, computed by the caller). */
export async function listPendingExceptionalActions(effectiveFacultyIds?: string[] | 'all'): Promise<ExceptionalActionRequest[]> {
  let query: FirebaseFirestore.Query = db.collection('exceptionalActionRequests').where('status', '==', 'pending');
  if (effectiveFacultyIds && effectiveFacultyIds !== 'all') {
    query = query.where('facultyId', 'in', effectiveFacultyIds);
  }
  const snap = await query.get();
  return snap.docs.map((d) => serialize(d.id, d.data()));
}

export async function decideExceptionalAction(
  requestId: string,
  decision: 'approved' | 'rejected',
  decidedBy: string,
  decidedByRole: string,
  decisionReason: string | undefined,
  deciderEffectiveFacultyIds: string[] | 'all',
): Promise<ExceptionalActionRequest> {
  const ref = db.collection('exceptionalActionRequests').doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Exceptional action request not found.');
  const data = snap.data()!;
  if (data.status !== 'pending') throw new Error('This request has already been decided.');

  // CRITICAL FIX: the controller used to only ever check the decider's ROLE
  // (program_head/faculty_admin/...), never that this specific request's
  // own facultyId actually matches theirs — a program_head in Faculty A
  // could approve/reject a request queued for Faculty B. Now checks the
  // decider's actual effective faculty set (own faculty + any extras granted
  // for their role, or 'all' for system_admin/an explicitly cross-faculty
  // account) — see scopeAuthorization.ts's effectiveFacultyIds.
  if (deciderEffectiveFacultyIds !== 'all' && !deciderEffectiveFacultyIds.includes(data.facultyId)) {
    throw new Error('This request is outside your faculty.');
  }

  if (decision === 'rejected') {
    if (!decisionReason || !decisionReason.trim()) {
      throw new Error('A reason is required to reject an exceptional action request.');
    }
    await ref.update({
      status: 'rejected',
      decidedBy,
      decidedAt: admin.firestore.FieldValue.serverTimestamp(),
      decisionReason,
    });
    await logAuditEvent({
      userId: decidedBy,
      userRole: decidedByRole,
      action: 'exceptional_action_rejected',
      entityType: 'exceptionalActionRequest',
      entityId: requestId,
      explanation: decisionReason,
    });
    await notifyRequester(data, 'rejected', decisionReason);
    const updated = await ref.get();
    return serialize(requestId, updated.data()!);
  }

  // Approved — actually execute the underlying action now.
  if (data.type === 'deadline_override') {
    const payload = data.payload as SingleDeadlinePayload;
    await applySingleDueDateOverride(payload.milestoneId, new Date(payload.dueDate), data.reason, data.requestedBy, data.requestedByRole);
  } else if (data.type === 'bulk_deadline_override') {
    const payload = data.payload as BulkDeadlinePayload;
    await applyBulkDueDateOverride(payload.projectIds, payload.milestoneType, new Date(payload.dueDate), data.reason, data.requestedBy, data.requestedByRole);
  } else {
    throw new Error(`Unknown exceptional action type: ${data.type}`);
  }

  await ref.update({
    status: 'approved',
    decidedBy,
    decidedAt: admin.firestore.FieldValue.serverTimestamp(),
    decisionReason: decisionReason ?? null,
  });
  await logAuditEvent({
    userId: decidedBy,
    userRole: decidedByRole,
    action: 'exceptional_action_approved',
    entityType: 'exceptionalActionRequest',
    entityId: requestId,
    explanation: decisionReason,
  });
  await notifyRequester(data, 'approved', decisionReason);

  const updated = await ref.get();
  return serialize(requestId, updated.data()!);
}

async function notifyRequester(
  data: FirebaseFirestore.DocumentData,
  decision: 'approved' | 'rejected',
  decisionReason: string | undefined,
): Promise<void> {
  try {
    await db.collection('notifications').add({
      recipientId: data.requestedBy,
      type: 'general',
      titleHe: decision === 'approved' ? '✅ בקשה חריגה אושרה' : '❌ בקשה חריגה נדחתה',
      titleEn: decision === 'approved' ? '✅ Exceptional Action Approved' : '❌ Exceptional Action Rejected',
      bodyHe: decision === 'approved'
        ? 'הבקשה שהגשת לשינוי תאריך יעד חריג אושרה על ידי ראש התוכנית/הפקולטה.'
        : `הבקשה שהגשת לשינוי תאריך יעד חריג נדחתה. סיבה: ${decisionReason ?? ''}`,
      bodyEn: decision === 'approved'
        ? 'Your exceptional deadline-override request was approved.'
        : `Your exceptional deadline-override request was rejected. Reason: ${decisionReason ?? ''}`,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      // EXCEPTIONAL_ACTION_GATED_ROLES (milestoneController.ts) only ever
      // lets coordinator/administrative_secretary request one — both
      // resolve to the same targetScreenFor(role, 'deadline_examiner')
      // destination.
      targetScreen: 'coordinator_deadlines',
    });
  } catch (err) {
    console.error('notifyRequester (exceptionalActions) failed:', err);
  }
}
