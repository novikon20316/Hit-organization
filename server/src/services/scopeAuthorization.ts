// src/services/scopeAuthorization.ts
//
// Resource-scope-aware authorization for the "detailed permissions" model
// (config/permissionScopes.ts's ScopeRule/CoordinatorScope) — DISTINCT from
// services/permissions.ts's static role->permission PERMISSION_MAP, which
// stays untouched (see that file's own header comment for why it's
// deliberately left unwired).
//
// This file answers a different question: given a user who may hold any
// number of per-scope grants (facultyId -> optional major -> optional degree
// level -> optional process type), does a specific action/view apply to a
// specific resource (a project, milestone, or user)? All checks here are
// ADDITIVE — they widen who is allowed to act, layered on top of whatever
// role/ownership check already gates an endpoint; they never narrow existing
// access for a role that already had it (except withinCoordinatorScope's
// facultyId baseline, which restores a pre-existing implicit contract that
// write endpoints had never actually enforced — see the endpoints wiring
// this in for the "why").

import { db } from '../config/firebase.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import type { ActionType, ViewType, ScopeDescriptor } from '../config/permissionScopes.js';
import { VALID_SCOPE_FACULTY_IDS } from '../config/permissionScopes.js';
import type { ChainRole } from './workflowTemplates.js';

export type AuthUser = NonNullable<AuthenticatedRequest['user']>;

export interface ResourceScope {
  facultyId: string;
  major?: string;
  degreeLevel?: 'bachelors' | 'masters';
  processType?: 'thesis' | 'project';
}

function isSystemAdmin(user: AuthUser): boolean {
  return user.role === 'system_admin' || user.roles.includes('system_admin');
}

/** Does `descriptor` (a granted scope) cover `resource` (the thing being acted on)?
 *  Any narrowing field left unset on the descriptor is a wildcard for that axis.
 *  A resource with no major/degreeLevel/processType set of its own (e.g. a project
 *  open to every major) is treated as within scope regardless of the descriptor's
 *  narrowing on that axis — it's institution-wide on that axis, not out of scope. */
export function scopeMatches(descriptor: ScopeDescriptor, resource: ResourceScope): boolean {
  if (descriptor.facultyId !== 'all' && descriptor.facultyId !== resource.facultyId) return false;
  if (descriptor.major && resource.major && descriptor.major !== resource.major) return false;
  if (descriptor.degreeLevel && resource.degreeLevel && descriptor.degreeLevel !== resource.degreeLevel) return false;
  if (descriptor.degreeLevel === 'masters' && descriptor.processType && resource.processType && descriptor.processType !== resource.processType) {
    return false;
  }
  return true;
}

/** True if `user` holds a permissionRule granting `action` (or 'all_actions') over `resource`. system_admin always true. */
export function hasActionGrant(user: AuthUser | undefined, action: ActionType, resource: ResourceScope): boolean {
  if (!user) return false;
  if (isSystemAdmin(user)) return true;
  return user.permissionRules.some(
    (rule) => scopeMatches(rule, resource) && (rule.actions.includes(action) || rule.actions.includes('all_actions'))
  );
}

/** Enumerates every facultyId `user` may exercise `action` in — the faculty
 *  checkbox options for the multi-faculty Add Project flow. Unlike
 *  hasActionGrant (which answers "does this one candidate resource match"),
 *  this lists every match. system_admin gets every real faculty (never the
 *  'all' sentinel itself, which isn't a postable faculty). Everyone else
 *  starts from their own facultyId (mirrors createAdminProject's existing
 *  withinOwnFaculty bypass — no explicit grant needed for a staff member's
 *  own faculty) plus whatever permissionRules explicitly grant the action,
 *  expanding a rule's facultyId:'all' to every real faculty. */
export function grantedFacultyIdsFor(user: AuthUser | undefined, action: ActionType): string[] {
  if (!user) return [];
  const realFacultyIds = VALID_SCOPE_FACULTY_IDS.filter((id) => id !== 'all');
  if (isSystemAdmin(user)) return realFacultyIds;

  const ids = new Set<string>();
  if (user.facultyId && user.facultyId !== 'all') ids.add(user.facultyId);
  for (const rule of user.permissionRules) {
    if (!(rule.actions.includes(action) || rule.actions.includes('all_actions'))) continue;
    if (rule.facultyId === 'all') realFacultyIds.forEach((id) => ids.add(id));
    else ids.add(rule.facultyId);
  }
  return [...ids];
}

/** True if `user` holds a permissionRule granting `view` over `resource`. system_admin always true. */
export function hasViewGrant(user: AuthUser | undefined, view: ViewType, resource: ResourceScope): boolean {
  if (!user) return false;
  if (isSystemAdmin(user)) return true;
  return user.permissionRules.some((rule) => scopeMatches(rule, resource) && rule.view.includes(view));
}

/**
 * True if `resource` falls within `user`'s coordinator scope. system_admin
 * always true. If the user has explicit coordinatorScopes configured, the
 * resource must match at least one. Otherwise falls back to the implicit
 * contract every coordinator-facing dashboard already assumes: confined to
 * their own facultyId (or 'all' for cross-faculty accounts like
 * administrative coordinator) — a baseline the write endpoints below never
 * actually enforced until now.
 */
export function withinCoordinatorScope(user: AuthUser | undefined, resource: ResourceScope): boolean {
  if (!user) return false;
  if (isSystemAdmin(user)) return true;
  if (user.coordinatorScopes.length > 0) {
    return user.coordinatorScopes.some((scope) => scopeMatches(scope, resource));
  }
  // facultyId 'all' is how cross-faculty roles (administrative coordinator,
  // grad_school_head, internal_examiner, system_admin — see CROSS_FACULTY_ROLES
  // in userController.ts) are provisioned; it is not a real faculty and must
  // never satisfy this fallback. Without an explicit coordinatorScopes entry,
  // an 'all'-provisioned account has no assigned degree yet — deny rather than
  // silently granting institution-wide access. Only a real single facultyId
  // (the 'coordinator' role's own baseline) may fall back this way.
  return user.facultyId !== 'all' && user.facultyId === resource.facultyId;
}

/** Resolves a project doc's scope-relevant fields for scope-matching against
 *  a ScopeRule/CoordinatorScope. Returns null if the project doesn't exist. */
export async function resolveProjectScope(projectId: string | undefined | null): Promise<ResourceScope | null> {
  if (!projectId) return null;
  const snap = await db.collection('projects').doc(projectId).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  return {
    facultyId: data.facultyId ?? '',
    major: data.major || undefined,
    degreeLevel: data.degreeType || undefined,
    processType: data.projectType || undefined,
  };
}

/** Resolves an abstract chain role (see workflowTemplates.ts's ChainRole) to
 *  concrete candidate uids for a resource scope — "any one suffices"
 *  semantics, matching the existing convention of fanning out to every match
 *  rather than picking one. Replaces the ad hoc "notify coordinators" queries
 *  in defenseScheduling.ts/examinerEscalation.ts/notificationScheduler.ts,
 *  each of which only matched a plain facultyId equality and so silently
 *  missed administrative coordinator-style accounts whose real scope lives in
 *  coordinatorScopes instead of facultyId. */
export async function resolveStaffForScope(
  role: ChainRole,
  resource: ResourceScope,
  projectSupervisorIds: string[]
): Promise<string[]> {
  if (role === 'supervisor') return [...new Set(projectSupervisorIds.filter(Boolean))];

  const uids = new Set<string>();

  const roleSnap = await db.collection('users').where('roles', 'array-contains', role).get();
  roleSnap.docs.forEach((doc) => {
    const data = doc.data();
    const descriptor: ScopeDescriptor = { facultyId: data.facultyId ?? '' };
    const coordinatorScopes: ScopeDescriptor[] = data.coordinatorScopes ?? [];
    if (scopeMatches(descriptor, resource) || coordinatorScopes.some((scope) => scopeMatches(scope, resource))) {
      uids.add(doc.id);
    }
  });

  // system_admin always included, matching the isSystemAdmin() bypass
  // convention used by every other function in this file.
  const adminSnap = await db.collection('users').where('roles', 'array-contains', 'system_admin').get();
  adminSnap.docs.forEach((doc) => uids.add(doc.id));

  return [...uids];
}

/** Resolves a milestone's scope for scope-matching, preferring its parent
 *  project's major/degreeLevel/processType (milestones don't carry those
 *  fields themselves) and falling back to just the milestone's own facultyId
 *  if the project lookup fails. Returns null if the milestone doesn't exist. */
export async function resolveMilestoneScope(milestoneId: string): Promise<ResourceScope | null> {
  const snap = await db.collection('milestones').doc(milestoneId).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  const projectScope = await resolveProjectScope(data.projectId);
  return projectScope ?? { facultyId: data.facultyId ?? '' };
}
