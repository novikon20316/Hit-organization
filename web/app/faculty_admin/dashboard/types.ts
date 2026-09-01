// app/faculty_admin/dashboard/types.ts
import type { AppRole, FacultyId } from '@/lib/roles';

export interface FacultyAdminUserRecord {
  id: string;
  displayName: string;
  email: string;
  role: AppRole;
  roles?: AppRole[];
  facultyId: FacultyId;
  isActive: boolean;
  hasActiveProject?: boolean;
  /** Restricts a supervisor/secondary_supervisor to specific majors within
   *  their faculty. Empty/unset means unrestricted (all majors in their
   *  faculty) — see server/src/controllers/adminController.ts. */
  assignedMajors?: string[];
  /** Admin-manageable Primary/Secondary status keys — only meaningful when
   *  role === 'student'. Resolve to display labels via a fetched
   *  StudentStatusConfig (see server/src/services/studentStatuses.ts). */
  primaryStatus?: string;
  secondaryStatus?: string;
}

/** Mirrors apiClient.getStudentStatusOptions()'s response shape (see
 *  lib/apiClient.ts and server/src/services/studentStatuses.ts). */
export interface StudentStatusOption {
  key: string;
  labelHe: string;
  labelEn: string;
}

export interface StudentStatusConfig {
  primary: StudentStatusOption[];
  secondary: StudentStatusOption[];
}

export interface FacultyAdminProjectRecord {
  id: string;
  titleHe: string;
  titleEn: string;
  facultyId: FacultyId;
  status: string;
  /** Primary/first value — prefer degreeTypes/projectTypes (the full
   *  multi-select set) for anything eligibility- or filter-related. */
  degreeType: string;
  projectType: string;
  degreeTypes?: string[];
  projectTypes?: string[];
  /** Links sibling docs created from one multi-faculty Add Project
   *  submission — see adminController.ts's createAdminProject. */
  postingGroupId?: string | null;
  supervisorId?: string;
  supervisorName: string;
  enrolledStudentIds: string[];
  NumberOfStudents?: number;
  maxStudents?: number;
}

/** Shape returned by GET /api/admin/supervisors — scoped to the faculty
 *  passed via `facultyId` (see NewProjectModal.tsx's getAdminSupervisors call). */
export interface SupervisorOption {
  id: string;
  displayName: string;
  /** Whether this person is eligible as PRIMARY vs. only secondary/co-
   *  supervisor for the currently-selected faculty/ies — see
   *  adminController.ts's getSupervisorsList. */
  eligibleAsSupervisor?: boolean;
  eligibleAsSecondary?: boolean;
}

// Shape is a raw milestone doc spread onto `{ id, deadline }` server-side
// (see staffController.ts getDeadLines) — every field but `id` is optional.
// Same shape as coordinator's CoordinatorDeadline / supervisor's
// SupervisorDeadline — duplicated rather than shared since this codebase
// colocates types per route folder (see coordinator/home/types.ts).
export interface FacultyAdminDeadline {
  id: string;
  milestoneId?: string;
  studentId?: string;
  studentName?: string;
  degreeType?: string;
  yearOfStudy?: string;
  projectTitle?: string;
  milestoneName?: string;
  daysLeft?: number | null;
  dueDate?: string | null;
  class?: string;
}
