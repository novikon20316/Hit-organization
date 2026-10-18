// src/services/facultyMembership.ts
//
// "Does this user belong to, or work on, one of these faculties?" — shared by
// every per-faculty switch (impersonation protection in config/featureFlags.ts,
// per-faculty 2FA enforcement in services/twoFactorEnforcement.ts), so they
// always agree on who counts as e.g. Data Science staff.
//
// Matches by home faculty, program, assigned programs, coordinator scopes, or
// any per-role faculty list. An institution-wide account ('all') with no
// narrowing coordinator scope covers every faculty, so it counts too.

import { MAJORS_BY_FACULTY } from '../config/majors.js';

export function userBelongsToFaculties(u: Record<string, any>, facultyIds: readonly string[]): boolean {
  if (facultyIds.length === 0) return false;
  const ids = new Set(facultyIds);
  // Program slugs that belong to those faculties (data_science's only program
  // is also named data_science, but don't rely on that).
  const majors = new Set(facultyIds.flatMap((f) => MAJORS_BY_FACULTY[f] ?? []));
  const hit = (v: unknown) => typeof v === 'string' && (ids.has(v) || majors.has(v));

  if (hit(u.facultyId) || hit(u.major)) return true;
  if ((u.assignedMajors ?? []).some(hit)) return true;
  const scopes: Array<{ facultyId?: string; major?: string }> = u.coordinatorScopes ?? [];
  if (scopes.some((s) => hit(s?.facultyId) || hit(s?.major))) return true;
  const facultyLists = ['coordinatorScopeFacultyIds', 'facultyAdminFacultyIds', 'programHeadFacultyIds', 'gradSchoolHeadFacultyIds', 'internalExaminerFacultyIds'];
  if (facultyLists.some((k) => (u[k] ?? []).some(hit))) return true;
  if (u.facultyId === 'all' && scopes.length === 0) return true;
  return false;
}
