// lib/roleFacultyPicker.ts
//
// Which roles get the "additional faculties (optional)" picker in
// EditUserModal, and which UserDoc field backs each one — see
// server/src/services/scopeAuthorization.ts's effectiveFacultyIds for the
// additive/restrictive semantics this drives. Generalizes what used to be
// two hardcoded blocks (supervisor/secondary_supervisor only) to any role
// that holds one of these fields.
//
// coordinator/administrative_secretary are deliberately absent — they
// already have real per-faculty(+major) scoping via coordinatorScopes,
// exposed through the separate "Coordinator Scope"/"Subject Responsibility"
// button; a second, cruder faculty-only picker here would just conflict
// with it. student/system_admin have no such concept either.

import type { AppRole } from './roles';

export type RoleFacultyField =
  | 'supervisorFacultyIds'
  | 'secondarySupervisorFacultyIds'
  | 'facultyAdminFacultyIds'
  | 'programHeadFacultyIds'
  | 'gradSchoolHeadFacultyIds'
  | 'internalExaminerFacultyIds';

export const ROLE_FACULTY_PICKER_FIELD: Partial<Record<AppRole, RoleFacultyField>> = {
  supervisor: 'supervisorFacultyIds',
  secondary_supervisor: 'secondarySupervisorFacultyIds',
  faculty_admin: 'facultyAdminFacultyIds',
  program_head: 'programHeadFacultyIds',
  grad_school_head: 'gradSchoolHeadFacultyIds',
  internal_examiner: 'internalExaminerFacultyIds',
};
