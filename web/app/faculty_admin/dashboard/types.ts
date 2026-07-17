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
}

export interface FacultyAdminProjectRecord {
  id: string;
  titleHe: string;
  titleEn: string;
  facultyId: FacultyId;
  status: string;
  degreeType: string;
  projectType: string;
  supervisorId?: string;
  supervisorName: string;
  enrolledStudentIds: string[];
  NumberOfStudents?: number;
  maxStudents?: number;
}

export interface GradingCriterion {
  key: string;
  label: string;
  maxScore: number;
}

/** Shape returned by GET /api/admin/supervisors — scoped to the faculty
 *  passed via `facultyId` (see NewProjectModal.tsx's getAdminSupervisors call). */
export interface SupervisorOption {
  id: string;
  displayName: string;
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
  class?: string;
}
