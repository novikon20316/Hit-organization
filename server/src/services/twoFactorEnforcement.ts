// src/services/twoFactorEnforcement.ts
//
// A system_admin can announce that two-factor authentication is about to
// become mandatory for staff (non-student) accounts, giving each a grace
// period (default 7 days) to set it up before being hard-blocked. Students
// are never subject to this. Same lazy-expiry shape as
// maintenanceStatus.ts (one global doc, compared against Date.now() at read
// time — no scheduler needed): a single system/twoFactorEnforcement doc holds
// `active` + `deadline`, and both the server-side gate
// (middleware/auth.ts's verifyToken) and each client's own nudge screen
// derive "is this user currently required to finish 2FA setup" from the same
// isTwoFactorSetupRequired() below, so there's exactly one place that answers
// that question.

import { db } from '../config/firebase.js';
import { Timestamp } from 'firebase-admin/firestore';
import { userBelongsToFaculties } from './facultyMembership.js';

const ENFORCEMENT_DOC = db.collection('system').doc('twoFactorEnforcement');

// Mirrors web/lib/roles.ts's STAFF_ROLES exactly (this repo duplicates role
// lists per package rather than sharing one — see permissionScopes.ts's
// ADMIN_TIER_ROLES for the same pattern). Everyone except 'student'.
export const STAFF_ROLES = [
  'supervisor', 'secondary_supervisor', 'coordinator', 'faculty_admin',
  'program_head', 'division_head', 'dean', 'administrative_secretary',
  'grad_school_head', 'school_head', 'internal_examiner', 'system_admin',
];

// Checks the full roles[] array, not just the singular `role` field — a
// student who's also been granted an additional staff role still counts as
// staff (see feedback_multirole_role_singular_vs_array.md).
export function isStaffMember(role: string | undefined, roles: string[] = []): boolean {
  if (role && STAFF_ROLES.includes(role)) return true;
  return roles.some((r) => STAFF_ROLES.includes(r));
}

/** Who the policy covers. 'staff' is the original behavior (and what an
 *  older client that doesn't send it gets). */
export type TwoFactorAudience = 'staff' | 'students' | 'both';
export const TWO_FACTOR_AUDIENCES: readonly TwoFactorAudience[] = ['staff', 'students', 'both'];

export function isStudentAccount(role: string | undefined, roles: string[] = []): boolean {
  return role === 'student' || roles.includes('student');
}

export interface TwoFactorEnforcementStatus {
  active: boolean;
  announcedAt: Timestamp | null;
  deadline: Timestamp | null;
  createdBy: string | null;
  /** Faculties the policy applies to (their staff only — see
   *  facultyMembership.ts). Empty = every staff member, the original
   *  behavior. */
  facultyIds: string[];
  audience: TwoFactorAudience;
}

const INACTIVE: TwoFactorEnforcementStatus = { active: false, announcedAt: null, deadline: null, createdBy: null, facultyIds: [], audience: 'staff' };

/** Fails open (reports inactive) on a read error — an unreachable DB should
 *  never turn into every user worldwide getting hard-blocked. */
export async function readTwoFactorEnforcementStatus(): Promise<TwoFactorEnforcementStatus> {
  try {
    const snap = await ENFORCEMENT_DOC.get();
    if (!snap.exists) return INACTIVE;
    const data = snap.data();
    if (!data) return INACTIVE;
    return {
      active: data.active ?? false,
      announcedAt: data.announcedAt ?? null,
      deadline: data.deadline ?? null,
      createdBy: data.createdBy ?? null,
      facultyIds: Array.isArray(data.facultyIds) ? data.facultyIds.filter((f: unknown) => typeof f === 'string') : [],
      audience: TWO_FACTOR_AUDIENCES.includes(data.audience) ? data.audience : 'staff',
    };
  } catch (err) {
    console.error('readTwoFactorEnforcementStatus error:', err);
    return INACTIVE;
  }
}

export async function activateTwoFactorEnforcement(
  createdBy: string,
  graceDays: number,
  facultyIds: string[] = [],
  audience: TwoFactorAudience = 'staff',
): Promise<TwoFactorEnforcementStatus> {
  const announcedAt = Timestamp.now();
  const deadline = Timestamp.fromMillis(Date.now() + graceDays * 24 * 60 * 60 * 1000);
  await ENFORCEMENT_DOC.set({ active: true, announcedAt, deadline, createdBy, facultyIds, audience });
  return { active: true, announcedAt, deadline, createdBy, facultyIds, audience };
}

/** Is this user covered by the policy at all (deadline aside)? By audience
 *  (staff / students / both — an account holding both a student and a staff
 *  role counts as both), then, when the policy names faculties, only people
 *  of those faculties (facultyMembership.ts). */
export function isSubjectToTwoFactorEnforcement(user: Record<string, any>, status: TwoFactorEnforcementStatus): boolean {
  const roles: string[] = user.roles ?? [];
  const staff = isStaffMember(user.role, roles);
  const student = isStudentAccount(user.role, roles);
  const inAudience =
    status.audience === 'both' ? staff || student
    : status.audience === 'students' ? student
    : staff;
  if (!inAudience) return false;
  if (status.facultyIds.length === 0) return true;
  // Institution-wide ('all') accounts aren't Data Science staff just because
  // they can see every faculty — only people actually of the named faculties.
  return userBelongsToFaculties(user, status.facultyIds, { includeInstitutionWide: false });
}

/** merge:true so cancelling an enforcement that was never activated (doc
 *  doesn't exist yet) doesn't throw NOT_FOUND — same convention as
 *  maintenanceStatus.ts's clearMaintenanceStatus. */
export async function deactivateTwoFactorEnforcement(): Promise<void> {
  await ENFORCEMENT_DOC.set({ active: false }, { merge: true });
}

/**
 * Single source of truth for "is this specific user currently required to
 * finish 2FA setup" — used both by the real server-side gate
 * (middleware/auth.ts) and by GET /api/users/me's computed
 * `twoFactorSetupRequired` field, which each client's own routing gate reads
 * to decide whether to force the setup screen. Scoped by the policy's
 * audience (staff by default; students and/or staff when chosen) and
 * optional faculty list — see isSubjectToTwoFactorEnforcement. Among those
 * covered, applies to every role including
 * system_admin, UNLESS a system_admin has explicitly exempted this specific
 * account (users/{uid}.twoFactorExempt — see setTwoFactorExempt) —
 * enforcement itself never spares anyone on its own; only a deliberate admin
 * action, or not being staff at all, does.
 */
export async function isTwoFactorSetupRequired(
  totpEnabled: boolean,
  exempt: boolean,
  role?: string,
  roles: string[] = [],
  /** The full user doc — needed when the policy is limited to faculties. */
  user?: Record<string, any>,
): Promise<boolean> {
  if (totpEnabled) return false;
  if (exempt) return false;
  const status = await readTwoFactorEnforcementStatus();
  if (!status.active || !status.deadline) return false;
  if (Date.now() < status.deadline.toMillis()) return false;
  return isSubjectToTwoFactorEnforcement(user ?? { role, roles }, status);
}

/** system_admin-only: discards (exempt=true) or re-enforces (exempt=false)
 *  the 2FA requirement for one specific user — persists until explicitly
 *  changed again, no automatic expiry. This is the ONLY way a user can be
 *  spared from an active enforcement policy. */
export async function setTwoFactorExempt(uid: string, exempt: boolean): Promise<void> {
  await db.collection('users').doc(uid).update({ twoFactorExempt: exempt });
}
