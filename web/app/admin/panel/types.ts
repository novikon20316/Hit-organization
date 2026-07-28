// app/admin/panel/types.ts
import type { AppRole, FacultyId } from '@/lib/roles';
import type { ScopeRule, CoordinatorScope } from '@/lib/permissions';

/** Shape of each entry in dashboard-summary's `users` array — a raw
 *  Firestore doc spread (`{ id, ...doc.data() }`), so treat optional
 *  fields as genuinely optional rather than assuming full UserDoc shape. */
export interface AdminUserRecord {
  id: string;
  displayName: string;
  displayNameHe?: string;
  displayNameEn?: string;
  email: string;
  role: AppRole;
  roles?: AppRole[];
  facultyId: FacultyId;
  isActive: boolean;
  totp_enabled?: boolean;
  mustChangePassword?: boolean;
  /** Restricts a supervisor/secondary_supervisor to specific majors within
   *  their faculty. Empty/unset means unrestricted (all majors in their
   *  faculty) — see server/src/controllers/adminController.ts. */
  assignedMajors?: string[];
  /** Faculty/faculties a supervisor-like (primary or additional) role
   *  applies to — lets a cross-faculty account (facultyId is the 'all'
   *  sentinel, e.g. system_admin) still be surfaced as a supervisor option
   *  for a specific faculty's Add Project modal — see
   *  server/src/controllers/adminController.ts's getSupervisorsList. */
  supervisorFacultyIds?: string[];
  /** Admin-manageable Primary/Secondary status keys — only meaningful when
   *  role === 'student'. Resolve to display labels via a fetched
   *  StudentStatusConfig (see server/src/services/studentStatuses.ts). */
  primaryStatus?: string;
  secondaryStatus?: string;
  /** Granular per-user permission grants (system_admin-managed) — see lib/permissions.ts. */
  permissionRules?: ScopeRule[];
  /** A coordinator's own operational scope narrowing beyond their facultyId. */
  coordinatorScopes?: CoordinatorScope[];
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

export interface AdminProjectRecord {
  id: string;
  titleHe?: string;
  titleEn?: string;
  descriptionHe?: string;
  descriptionEn?: string;
  facultyId: FacultyId;
  status: string;
  supervisorId?: string;
  supervisorName?: string;
  /** Primary/first value — prefer degreeTypes/projectTypes (the full
   *  multi-select set) for anything eligibility- or filter-related. */
  degreeType?: 'bachelors' | 'masters';
  projectType?: 'project' | 'thesis';
  degreeTypes?: ('bachelors' | 'masters')[];
  projectTypes?: ('project' | 'thesis')[];
  /** Links sibling docs created from one multi-faculty Add Project
   *  submission — see adminController.ts's createAdminProject. */
  postingGroupId?: string | null;
  maxStudents?: number;
  requiredSkills?: string[];
  prerequisites?: string[];
  enrolledStudentIds?: string[];
  academicYear?: string;
  createdAt?: string;
}

export interface AdminMilestoneRecord {
  id: string;
  projectId: string;
  type?: string;
  status: string;
  projectTitleHe?: string;
  projectTitleEn?: string;
  facultyId?: FacultyId;
  dueDate?: string | null;
  submittedAt?: string | null;
  studentNames?: string[];
  fileUrls?: string[];
  submissionNote?: string;
}

/** Shape returned by listDefenseAccessGrants — external examiners who missed
 *  their defense-day access window (see adminController.listDefenseAccessGrants). */
export interface DefenseAccessGrant {
  code: string;
  examinerName: string;
  examinerEmail: string;
  defenseDateISO: string;
  computedStatus: 'not_yet_active' | 'active' | 'expired';
  projectId?: string;
}

/** One row of the pre-registration student allowlist (see
 *  server/src/services/studentRoster.ts) — coordinators/system_admin upload
 *  these before students can self-register; `used` locks once a matching
 *  account has actually been created. */
export interface RosterEntry {
  id: string;
  studentId: string;
  facultyId: FacultyId;
  degreeType: 'bachelors' | 'masters';
  major: string | null;
  fullName: string;
  used: boolean;
  usedByUid: string | null;
  usedAt: string | null;
  uploadedBy: string;
  uploadedAt: string;
}

/** Shape returned by getAdminFeedback — real (non-noise) feedback messages,
 *  one-way (see feedbackController.ts — never replied to in-thread). */
export interface AdminFeedbackMessage {
  id: string;
  userId: string;
  userName: string;
  role: string;
  text: string;
  aiReasoning?: string | null;
  status: 'open' | 'resolved';
  createdAt: string | null;
}
