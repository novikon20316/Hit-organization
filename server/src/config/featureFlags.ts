// src/config/featureFlags.ts
//
// Temporary debug-tooling flags — not meant to live long-term. Flip to
// `false` (and redeploy) to kill the feature instantly without a code
// revert.

import { MAJORS_BY_FACULTY } from './majors.js';

// system_admin "impersonate user" (see adminController.ts's impersonateUser)
// — lets a system_admin sign in as another user from the web Users tab for
// debugging. Turn off once the current debugging push is done.
export const IMPERSONATION_ENABLED = true;

// Faculties whose users are REAL people already using the system — no one
// in them may be impersonated, even while IMPERSONATION_ENABLED is on.
// Other faculties are still test-only. Add a faculty here when it goes live.
export const IMPERSONATION_PROTECTED_FACULTIES: readonly string[] = ['data_science'];

/** True when a user belongs to, or works on, a protected faculty — by home
 *  faculty, program, assigned programs, coordinator scopes, or any per-role
 *  faculty list. An institution-wide account ('all') with no narrowing
 *  scope covers every faculty, so it counts as protected too. */
export function isImpersonationProtected(u: Record<string, any>): boolean {
  const protectedIds = new Set(IMPERSONATION_PROTECTED_FACULTIES);
  // Program slugs that belong to a protected faculty (data_science's only
  // program is also named data_science, but don't rely on that).
  const protectedMajors = new Set(IMPERSONATION_PROTECTED_FACULTIES.flatMap((f) => MAJORS_BY_FACULTY[f] ?? []));
  const hit = (v: unknown) => typeof v === 'string' && (protectedIds.has(v) || protectedMajors.has(v));

  if (hit(u.facultyId) || hit(u.major)) return true;
  if ((u.assignedMajors ?? []).some(hit)) return true;
  const scopes: Array<{ facultyId?: string; major?: string }> = u.coordinatorScopes ?? [];
  if (scopes.some((s) => hit(s?.facultyId) || hit(s?.major))) return true;
  const facultyLists = ['coordinatorScopeFacultyIds', 'facultyAdminFacultyIds', 'programHeadFacultyIds', 'gradSchoolHeadFacultyIds', 'internalExaminerFacultyIds'];
  if (facultyLists.some((k) => (u[k] ?? []).some(hit))) return true;
  if (u.facultyId === 'all' && scopes.length === 0) return true;
  return false;
}
