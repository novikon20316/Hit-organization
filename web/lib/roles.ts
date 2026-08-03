// lib/roles.ts
// Ported from mobile/firebase/roles.ts — single source of truth for:
//   • Role string literals (must match Firestore `users.role` field)
//   • Permission matrix (what each role can do)
//   • Route/home helpers (used by the web app shell after login)
//   • The Firestore user document shape
//
// Keep this in sync with the mobile copy by hand for now — it's small and
// changes rarely (adding a role/permission is a deliberate, reviewed change).

import type { AppRole, FacultyId } from './i18n';

export type { AppRole, FacultyId };

// ─────────────────────────────────────────────────────────────────────────────
// ROLE CONSTANTS
// These string literals MUST match exactly what is stored in Firestore.
// External examiners are NOT a role — they use tokenised links (see below).
// ─────────────────────────────────────────────────────────────────────────────

export const ROLES = {
  STUDENT:               'student',
  SUPERVISOR:            'supervisor',
  SECONDARY_SUPERVISOR:  'secondary_supervisor',
  COORDINATOR:           'coordinator',
  FACULTY_ADMIN:         'faculty_admin',
  PROGRAM_HEAD:          'program_head',
  PROJECT_COORDINATOR:   'administrative_secretary',
  GRAD_SCHOOL_HEAD:      'grad_school_head',
  INTERNAL_EXAMINER:     'internal_examiner',
  SYSTEM_ADMIN:          'system_admin',
} as const satisfies Record<string, AppRole>;

// All non-student, non-examiner staff roles
export const STAFF_ROLES: AppRole[] = [
  'supervisor',
  'secondary_supervisor',
  'coordinator',
  'faculty_admin',
  'program_head',
  'administrative_secretary',
  'grad_school_head',
  'internal_examiner',
  'system_admin',
];

// Roles a delegate (faculty_admin/program_head/grad_school_head) can create
// or edit for someone else — STAFF_ROLES minus the admin tier itself
// (system_admin/faculty_admin/program_head/grad_school_head — see
// server/src/config/permissionScopes.ts's ADMIN_TIER_ROLES, which a delegate
// may never touch) and minus 'student' (self-registration only, not
// admin-created here).
export const DELEGATE_MANAGEABLE_ROLES: AppRole[] = [
  'coordinator',
  'supervisor',
  'secondary_supervisor',
  'administrative_secretary',
  'internal_examiner',
];

// Roles that can approve at grad-school level
export const GRAD_SCHOOL_APPROVERS: AppRole[] = ['grad_school_head', 'system_admin'];

// Roles with cross-faculty visibility — created with facultyId 'all'.
export const CROSS_FACULTY_ROLES: AppRole[] = [
  'grad_school_head',
  'internal_examiner',
  'system_admin',
  'administrative_secretary',
];

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION MATRIX
// Each key is an action; value is the set of roles allowed to perform it.
// Use hasPermission() at runtime rather than checking roles directly.
// ─────────────────────────────────────────────────────────────────────────────

export type Permission =
  | 'create_project' | 'publish_project' | 'apply_to_project' | 'view_all_projects'
  | 'view_own_project' | 'view_faculty_projects'
  | 'open_process_file' | 'close_process_file' | 'view_process_file'
  | 'edit_process_status' | 'pause_process_clock'
  | 'submit_milestone' | 'grade_milestone' | 'approve_milestone_coordinator'
  | 'approve_milestone_grad_school' | 'reopen_milestone' | 'override_deadline'
  | 'submit_proposal' | 'approve_proposal_supervisor' | 'approve_proposal_faculty'
  | 'approve_proposal_grad_school'
  | 'assign_supervisor' | 'approve_supervisor' | 'propose_supervisor'
  | 'propose_examiners' | 'approve_examiners_faculty' | 'approve_examiners_grad_school'
  | 'send_examiner_invitation' | 'view_examiner_database' | 'edit_examiner_database'
  | 'enter_grade' | 'approve_grade_coordinator' | 'approve_grade_grad_school'
  | 'change_grade_after_approval' | 'transfer_grade_to_maklol' | 'view_all_grades'
  | 'view_templates' | 'create_template' | 'edit_template' | 'approve_template_grad_school'
  | 'view_faculty_reports' | 'view_cross_faculty_reports' | 'export_reports'
  | 'manage_users' | 'manage_system_config' | 'view_audit_log' | 'toggle_maintenance'
  | 'send_message' | 'view_own_messages';

export const PERMISSION_MAP: Record<Permission, AppRole[]> = {
  create_project:                ['supervisor', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  publish_project:               ['supervisor', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  apply_to_project:              ['student'],
  view_all_projects:             ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'],
  view_own_project:              ['student', 'supervisor', 'secondary_supervisor'],
  view_faculty_projects:         ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'internal_examiner'],

  open_process_file:             ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  close_process_file:            ['coordinator', 'faculty_admin', 'program_head', 'grad_school_head', 'system_admin'],
  view_process_file:             ['supervisor', 'secondary_supervisor', 'coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'internal_examiner', 'system_admin'],
  edit_process_status:           ['coordinator', 'faculty_admin', 'program_head', 'system_admin'],
  pause_process_clock:           ['coordinator', 'faculty_admin', 'program_head', 'grad_school_head', 'system_admin'],

  submit_milestone:              ['student'],
  grade_milestone:               ['supervisor', 'secondary_supervisor', 'internal_examiner'],
  approve_milestone_coordinator: ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  approve_milestone_grad_school: ['grad_school_head', 'system_admin'],
  reopen_milestone:              ['coordinator', 'faculty_admin', 'program_head', 'system_admin'],
  override_deadline:             ['coordinator', 'faculty_admin', 'program_head', 'system_admin'],

  submit_proposal:               ['student'],
  approve_proposal_supervisor:   ['supervisor', 'secondary_supervisor'],
  approve_proposal_faculty:      ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary'],
  approve_proposal_grad_school:  ['grad_school_head', 'system_admin'],

  assign_supervisor:             ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  approve_supervisor:            ['grad_school_head', 'system_admin'],
  propose_supervisor:            ['student', 'supervisor'],

  propose_examiners:             ['supervisor', 'secondary_supervisor'],
  approve_examiners_faculty:     ['coordinator', 'faculty_admin', 'program_head'],
  approve_examiners_grad_school: ['grad_school_head', 'system_admin'],
  send_examiner_invitation:      ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  view_examiner_database:        ['supervisor', 'secondary_supervisor', 'coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'internal_examiner', 'system_admin'],
  edit_examiner_database:        ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'],

  enter_grade:                   ['supervisor', 'secondary_supervisor', 'internal_examiner'],
  approve_grade_coordinator:     ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary'],
  approve_grade_grad_school:     ['grad_school_head', 'system_admin'],
  change_grade_after_approval:   ['grad_school_head', 'system_admin'],
  transfer_grade_to_maklol:      ['coordinator', 'faculty_admin', 'grad_school_head', 'system_admin'],
  view_all_grades:               ['coordinator', 'faculty_admin', 'program_head', 'grad_school_head', 'system_admin'],

  view_templates:                ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'],
  create_template:               ['faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  edit_template:                 ['faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  approve_template_grad_school:  ['grad_school_head', 'system_admin'],

  view_faculty_reports:          ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  view_cross_faculty_reports:    ['grad_school_head', 'system_admin'],
  export_reports:                ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'],

  manage_users:                  ['faculty_admin', 'system_admin'],
  manage_system_config:          ['system_admin'],
  view_audit_log:                ['coordinator', 'faculty_admin', 'program_head', 'grad_school_head', 'system_admin'],
  toggle_maintenance:            ['system_admin'],

  send_message:                  ['student', 'supervisor', 'secondary_supervisor', 'coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'internal_examiner', 'system_admin'],
  view_own_messages:             ['student', 'supervisor', 'secondary_supervisor', 'coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'internal_examiner', 'system_admin'],
};

// ─────────────────────────────────────────────────────────────────────────────
// RUNTIME HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Check if a role has a given permission. system_admin bypasses all checks. */
export function hasPermission(role: AppRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  if (role === 'system_admin') return true;
  return PERMISSION_MAP[permission]?.includes(role) ?? false;
}

export function isStaff(role: AppRole | undefined): boolean {
  if (!role) return false;
  return STAFF_ROLES.includes(role);
}

export function isCrossFaculty(role: AppRole | undefined): boolean {
  if (!role) return false;
  return CROSS_FACULTY_ROLES.includes(role);
}

export function isGradSchoolApprover(role: AppRole | undefined): boolean {
  if (!role) return false;
  return GRAD_SCHOOL_APPROVERS.includes(role);
}

/** All distinct roles a user holds — primary `role` plus `roles[]`, deduped.
 *  Use this (not `userData.role` alone) anywhere a multi-role user's full
 *  set of roles matters, e.g. the role switcher. */
export function getUserRoles(userData: { role?: AppRole; roles?: AppRole[] } | null | undefined): AppRole[] {
  if (!userData) return [];
  const set = new Set<AppRole>();
  if (userData.role) set.add(userData.role);
  (userData.roles ?? []).forEach((r) => set.add(r));
  return Array.from(set);
}

/**
 * Web equivalent of mobile's getHomeRoute — same destinations, translated to
 * Next.js App Router paths (mirrors mobile's expo-router segments 1:1 so the
 * two codebases' URL shapes stay easy to reason about together).
 */
export function getHomeRoute(role: AppRole | undefined): string {
  switch (role) {
    case 'student':                  return '/student/home';
    case 'supervisor':                return '/supervisor/dashboard';
    case 'secondary_supervisor':      return '/supervisor/dashboard';
    case 'coordinator':                return '/coordinator/home';
    case 'faculty_admin':              return '/faculty_admin/dashboard';
    case 'program_head':               return '/program_head/dashboard';
    case 'administrative_secretary':   return '/administrative_coordinator/dashboard';
    case 'grad_school_head':           return '/grad_school_head/dashboard';
    case 'internal_examiner':          return '/examinor/home';
    case 'system_admin':               return '/admin/panel';
    default:                           return '/login';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FIRESTORE USER DOCUMENT SHAPE — must match server/src & mobile exactly
// ─────────────────────────────────────────────────────────────────────────────

export interface UserDoc {
  uid: string;
  email: string;
  displayName: string;
  displayNameHe: string;
  displayNameEn: string;
  role: AppRole;
  facultyId: FacultyId;
  additionalRoles: AppRole[];
  /** The array server/src/middleware/auth.ts actually populates req.user.roles
   *  from, and what admin endpoints (disableUser2FA, eraseUserBySystemAdmin,
   *  role-update) read/write for multi-role checks — e.g. a supervisor who's
   *  also a secondary_supervisor. Distinct from `additionalRoles` above,
   *  which the factory sets but nothing appears to read for permission
   *  checks. Prefer this field for anything role-gating related. */
  roles?: AppRole[];
  degreeType: 'bachelors' | 'masters' | null;
  yearOfStudy: number | null;
  studentId: string | null;
  major: string | null;
  supervisorId?: string | null;
  activeProjectId?: string | null;
  isActive: boolean;
  profileComplete: boolean;
  hasActiveProject: boolean;
  mustChangePassword?: boolean;
  language: 'he' | 'en';
  expoPushToken: string | null;
  createdAt?: unknown;
  lastLoginAt?: unknown;
  isEligibleForProcess: boolean;
  /** Set by server/src/services/accountDeletion.ts's requestDeletion() —
   *  either self-service (users/delete-account/request) or the automatic
   *  graduation sweep. Account stays loginable during the grace period
   *  (isActive is untouched); see useRequireRole's redirect. */
  pendingDeletion?: boolean;
  deletionReason?: 'self_requested' | 'graduated';
  /** Firestore Timestamp — arrives over the REST API as `{ _seconds,
   *  _nanoseconds }`, not a client Timestamp instance; parse defensively. */
  deletionScheduledFor?: unknown;
  /** Mirrors mobile's post-login nudge condition (app/(auth)/login.tsx) —
   *  when false/undefined, the user hasn't set up 2FA yet. */
  totp_enabled?: boolean;
  /** Only meaningful for supervisor/secondary_supervisor — restricts them to
   *  specific majors within their own facultyId. Empty/unset means
   *  unrestricted (all majors in their faculty). See
   *  server/src/controllers/adminController.ts. */
  assignedMajors?: string[];
  /** Narrows a CROSS-FACULTY account's (facultyId 'all' — e.g. system_admin)
   *  supervisor-like role down to specific faculties. By default such an
   *  account is a supervisor option in EVERY faculty — this only ever
   *  restricts that, never grants beyond it. Empty/unset means "available
   *  everywhere" — the common case. Not meaningful for a plain
   *  single-faculty supervisor (their own facultyId already scopes them
   *  correctly). See server/src/controllers/adminController.ts. */
  supervisorFacultyIds?: string[];
  /** Elastic per-user scope-rule grants (system_admin-managed) — see
   *  lib/permissions.ts. Empty/unset means no granular grants beyond the
   *  account's role. */
  permissionRules?: import('./permissions').ScopeRule[];
  /** A coordinator's own operational scope narrowing beyond their facultyId —
   *  see lib/permissions.ts. Empty/unset means unrestricted within their
   *  facultyId (the pre-existing behavior). */
  coordinatorScopes?: import('./permissions').CoordinatorScope[];
}

export const VALID_ROLES: AppRole[] = [
  'student', 'supervisor', 'secondary_supervisor', 'coordinator', 'faculty_admin',
  'program_head', 'administrative_secretary', 'grad_school_head', 'internal_examiner', 'system_admin',
];

export const VALID_FACULTY_IDS: FacultyId[] = [
  'sciences', 'electrical', 'industrial', 'learning_tech', 'medical_tech', 'design', 'data_science', 'all',
];

export function isValidRole(value: unknown): value is AppRole {
  return typeof value === 'string' && VALID_ROLES.includes(value as AppRole);
}

export function isValidFacultyId(value: unknown): value is FacultyId {
  return typeof value === 'string' && VALID_FACULTY_IDS.includes(value as FacultyId);
}
