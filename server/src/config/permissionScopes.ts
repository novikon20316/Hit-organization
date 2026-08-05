// src/config/permissionScopes.ts
//
// Server-side mirror of web/lib/permissions.ts / mobile/constants/permissions.ts's
// elastic scope-rule model — keep in sync (same convention as VALID_MAJORS/
// MAJORS_BY_FACULTY in majors.ts mirroring the client faculty lists).
//
// A user account can hold any number of ScopeRules, each narrowing a
// Faculty -> optional Major -> optional Degree Level -> optional Process Type
// (thesis/project, master's only), with its own View/Action permission
// grants. CoordinatorScope reuses the same narrowing shape without grants
// (a coordinator already has full standard actions within their scope).
//
// See server/src/services/scopeAuthorization.ts for the matching/enforcement
// logic built on top of these types.

import { MAJORS_BY_FACULTY } from './majors.js';

export type DegreeLevel = 'bachelors' | 'masters';
export type ProcessType = 'thesis' | 'project';

export type ViewType = 'users' | 'projects' | 'grades' | 'milestones' | 'reports';

export const VIEW_TYPES: ViewType[] = ['users', 'projects', 'grades', 'milestones', 'reports'];

export type ActionType =
  | 'add_users'
  | 'edit_users'
  | 'delete_users'
  | 'add_projects'
  | 'edit_projects'
  | 'delete_projects'
  | 'edit_grades'
  | 'approve_grades'
  | 'approve_milestones'
  | 'assign_supervisor_examiner'
  | 'approve_templates'
  | 'all_actions';

export const ACTION_TYPES: ActionType[] = [
  'add_users', 'edit_users', 'delete_users',
  'add_projects', 'edit_projects', 'delete_projects',
  'edit_grades', 'approve_grades', 'approve_milestones',
  'assign_supervisor_examiner', 'approve_templates', 'all_actions',
];

// Same faculty keys as MAJORS_BY_FACULTY plus 'all' (cross-faculty scope) —
// mirrors web/lib/roles.ts's VALID_FACULTY_IDS.
export const VALID_SCOPE_FACULTY_IDS: string[] = [...Object.keys(MAJORS_BY_FACULTY), 'all'];

// Roles that sit at or above the delegate tier — a delegate (whether acting
// via role name or a permissionRules grant) may never create/promote/erase/
// grant-permissions-to one of these accounts; only system_admin can touch
// them. Single source of truth — previously duplicated verbatim in both
// adminController.ts and facultyAdminController.ts.
export const ADMIN_TIER_ROLES = ['system_admin', 'faculty_admin', 'program_head', 'grad_school_head'];

// The three roles that can now self-serve day-to-day staff management
// within their own organizational scope (faculty_admin/program_head: their
// own facultyId; grad_school_head: cross-faculty) instead of requiring
// system_admin to do it for them — system_admin remains the backup for
// admin-tier accounts (ADMIN_TIER_ROLES, above) and DELEGATE_RESTRICTED_ACTIONS.
export const DELEGATE_ADMIN_ROLES = ['faculty_admin', 'program_head', 'grad_school_head'];

// Even within their own scope, a delegate can never grant these two —
// wiping out a user's access entirely, or handing over blanket all-actions
// power, stays a system_admin-only move.
export const DELEGATE_RESTRICTED_ACTIONS: ActionType[] = ['delete_users', 'all_actions'];

export interface ScopeDescriptor {
  facultyId: string;
  major?: string;
  degreeLevel?: DegreeLevel;
  processType?: ProcessType;
}

export interface ScopeRule extends ScopeDescriptor {
  id: string;
  view: ViewType[];
  actions: ActionType[];
}

export interface CoordinatorScope extends ScopeDescriptor {
  id: string;
}

/** Validates a single ScopeDescriptor's narrowing fields (facultyId/major/degreeLevel/processType). Returns an error message, or null if valid. */
export function validateScopeDescriptor(scope: unknown): string | null {
  if (!scope || typeof scope !== 'object') return 'Scope must be an object.';
  const s = scope as Record<string, unknown>;

  if (typeof s.facultyId !== 'string' || !VALID_SCOPE_FACULTY_IDS.includes(s.facultyId)) {
    return `Invalid facultyId: ${String(s.facultyId)}`;
  }
  if (s.major !== undefined) {
    if (typeof s.major !== 'string' || !(MAJORS_BY_FACULTY[s.facultyId] ?? []).includes(s.major)) {
      return `Invalid major "${String(s.major)}" for faculty "${s.facultyId}".`;
    }
  }
  if (s.degreeLevel !== undefined && s.degreeLevel !== 'bachelors' && s.degreeLevel !== 'masters') {
    return `Invalid degreeLevel: ${String(s.degreeLevel)}`;
  }
  if (s.processType !== undefined) {
    if (s.processType !== 'thesis' && s.processType !== 'project') {
      return `Invalid processType: ${String(s.processType)}`;
    }
    if (s.degreeLevel !== 'masters') {
      return 'processType is only valid when degreeLevel is "masters".';
    }
  }
  return null;
}

/** Validates a full ScopeRule (descriptor + id + view + actions). Returns an error message, or null if valid. */
export function validateScopeRule(rule: unknown): string | null {
  const descriptorError = validateScopeDescriptor(rule);
  if (descriptorError) return descriptorError;

  const r = rule as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return 'ScopeRule is missing an id.';
  if (!Array.isArray(r.view) || !r.view.every((v: unknown) => VIEW_TYPES.includes(v as ViewType))) {
    return 'ScopeRule has an invalid view array.';
  }
  if (!Array.isArray(r.actions) || !r.actions.every((a: unknown) => ACTION_TYPES.includes(a as ActionType))) {
    return 'ScopeRule has an invalid actions array.';
  }
  return null;
}

/** Validates a full CoordinatorScope (descriptor + id). Returns an error message, or null if valid. */
export function validateCoordinatorScope(scope: unknown): string | null {
  const descriptorError = validateScopeDescriptor(scope);
  if (descriptorError) return descriptorError;

  const s = scope as Record<string, unknown>;
  if (typeof s.id !== 'string' || !s.id) return 'CoordinatorScope is missing an id.';
  return null;
}
