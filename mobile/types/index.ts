/**
 * types/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all TypeScript interfaces, types, and enums.
 * Import from here everywhere instead of from individual component files.
 *
 * Sections:
 *   1.  Primitives & Enums
 *   2.  Firebase / Firestore Documents
 *   3.  User & Auth
 *   4.  Projects
 *   5.  Milestones & Grading
 *   6.  Notifications
 *   7.  UI / Component Props
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Timestamp } from 'firebase/firestore';

// ─────────────────────────────────────────────────────────────────────────────
// 1. PRIMITIVES & ENUMS
// ─────────────────────────────────────────────────────────────────────────────

export type Lang = 'he' | 'en';

export type DegreeLevel = 'bachelors' | 'masters';

export type ProjectType = 'project' | 'thesis';

/**
 * All roles a user can hold.
 * A user has one primary `role` and an optional `roles[]` array for additional
 * roles (e.g. a supervisor who is also a committee_member).
 */
export type UserRole =
  | 'student'
  | 'supervisor'
  | 'examiner'
  | 'coordinator'
  | 'faculty_admin'
  | 'system_admin'
  | 'head_of_masters'
  | 'head_of_bachelors'
  | 'committee_member';

/**
 * All possible statuses a milestone can pass through.
 * Source: Milestoneservice.ts
 */
export type MilestoneStatus =
  | 'pending'
  | 'submitted'
  | 'supervisor_graded'
  | 'graded'
  | 'coordinator_approved'
  | 'examiners_assigned'     // coordinator picked 2 examiners (after final_report)
  | 'examiner_graded'        // at least one examiner graded
  | 'both_examiners_graded'  // both examiners submitted grades
  | 'completed';

/**
 * All possible statuses a project or application can carry.
 * Source: shared.tsx STATUS_MAP
 */
export type ProjectStatus =
  | 'pending'
  | 'submitted'
  | 'supervisor_graded'
  | 'coordinator_approved'
  | 'completed'
  | 'approved'
  | 'rejected'
  | 'meeting_requested'
  | 'in_progress'
  | 'published'
  | 'draft';

// ─────────────────────────────────────────────────────────────────────────────
// 2. FIREBASE / FIRESTORE DOCUMENTS
//    These map 1-to-1 to Firestore collections. All fields listed here
//    are actually read or written somewhere in the uploaded codebase.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Firestore collection: `users`
 *
 * Fields in use across the codebase:
 *   id              – document ID (= Firebase Auth UID)
 *   displayName     – shown in TopBar avatar, student picker, supervisor list
 *   email           – shown in user lists, used in search filter
 *   role            – primary role; used for routing (_layout.tsx, index.tsx)
 *   roles           – array of all roles; used for multi-role checks (NewProjectModal)
 *   facultyId       – used to scope faculty color, lock supervisor's faculty
 *   isActive        – filter in AddStudentToProjectModal
 *   expoPushToken   – stored after registration; used by sendPushNotification
 *
 * Fields managed server-side (not set from client):
 *   createdAt       – set by backend on creation
 *   studentId       – set during NewUserModal creation (student only)
 *   phone           – set during NewUserModal creation
 *   degreeType      – set during NewUserModal creation (student only)
 *   year            – student academic year
 *   major           – student major / program key
 */
export interface UserDocument {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
  roles: UserRole[];
  facultyId: string;
  isActive: boolean;
  expoPushToken?: string | null;
  // Student-only fields
  studentId?: string;
  phone?: string;
  degreeType?: DegreeLevel | '';
  year?: string;
  major?: string;
  createdAt?: Timestamp | string;
}

/**
 * Firestore collection: `projects`
 *
 * Fields in use across the codebase:
 *   id                  – document ID
 *   titleHe / titleEn   – bilingual title (NewProjectModal, AddStudentToProjectModal)
 *   descHe  / descEn    – bilingual description (NewProjectModal)
 *   facultyId           – links to faculty; used for color + scoping
 *   status              – ProjectStatus; shown as StatusBadge
 *   supervisorId        – UID of the assigned supervisor
 *   supervisorName      – denormalized name for display (AddStudentToProjectModal)
 *   degreeType          – 'bachelors' | 'masters' | 'both'
 *   projectType         – 'project' | 'thesis'
 *   academicYear        – e.g. "2024-2025"
 *   enrolledStudentIds  – array of student UIDs; used to filter already-enrolled
 *   maxStudents         – capacity set in NewProjectModal
 *   skills              – comma-separated tech keywords (NewProjectModal)
 *   program             – program key from HIT_FACULTIES (NewProjectModal)
 *   gradingCriteria     – array of GradingCriterion objects
 *   projectInfoFileUrl  – Cloudinary / Storage URL of uploaded PDF
 *   projectInfoFileName – display name of the uploaded PDF
 *   createdAt           – server timestamp
 */
export interface ProjectDocument {
  id: string;
  titleHe: string;
  titleEn: string;
  descHe?: string;
  descEn?: string;
  facultyId: string;
  status: ProjectStatus;
  supervisorId: string;
  supervisorName: string;
  degreeType: DegreeLevel | 'both';
  projectType: ProjectType;
  academicYear: string;
  enrolledStudentIds: string[];
  maxStudents: number;
  skills?: string;
  program?: string | null;
  gradingCriteria?: GradingCriterion[];
  projectInfoFileUrl?: string | null;
  projectInfoFileName?: string | null;
  createdAt?: Timestamp | string;
}

/**
 * Firestore collection: `milestones`
 *
 * Fields in use across the codebase:
 *   id            – document ID
 *   projectId     – parent project reference
 *   studentId     – owner student UID
 *   type          – milestone type key (e.g. 'research_proposal')
 *   status        – MilestoneStatus
 *   dueDate       – Timestamp or ISO string; used by daysUntil() in Milestoneservice.ts
 *   submittedAt   – when the student submitted
 *   files         – uploaded file URLs
 *   note          – optional student note on submission
 *   supervisorGrade   – grade given by supervisor
 *   supervisorComment – comment from supervisor
 *   gradeWeights      – GradeWeights object (stored per-milestone or per-project)
 *   examiner1Id / examiner2Id  – UIDs of assigned examiners
 *   examiner1Grade / examiner2Grade
 *   examiner1Comment / examiner2Comment
 *   coordinatorApprovedAt – timestamp of coordinator approval
 */
export interface MilestoneDocument {
  id: string;
  projectId: string;
  studentId: string;
  type: string;
  status: MilestoneStatus;
  dueDate?: Timestamp | string | null;
  submittedAt?: Timestamp | string | null;
  files?: string[];
  note?: string;
  supervisorGrade?: number | null;
  supervisorComment?: string;
  gradeWeights?: GradeWeights;
  examiner1Id?: string | null;
  examiner2Id?: string | null;
  examiner1Grade?: number | null;
  examiner2Grade?: number | null;
  examiner1Comment?: string;
  examiner2Comment?: string;
  coordinatorApprovedAt?: Timestamp | string | null;
}

/**
 * Firestore collection: `notifications`
 *
 * Fields in use across the codebase:
 *   id        – document ID
 *   userId    – recipient UID
 *   title     – notification heading
 *   body      – notification body text
 *   read      – boolean; drives unreadCount in NotificationsContext
 *   createdAt – for ordering / display
 *   data      – arbitrary payload (e.g. { chatId, otherName, otherRole })
 */
export interface NotificationDocument {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: Timestamp | string;
  data?: Record<string, string>;
}

/**
 * Firestore collection: `maintenance` (single document pattern)
 *
 * Fields in use across the codebase (MaintenanceModal.tsx):
 *   title     – message shown to users during maintenance
 *   endsAt    – computed from days + hours + minutes; Timestamp or ISO string
 *   active    – whether maintenance mode is currently on
 */
export interface MaintenanceDocument {
  title: string;
  endsAt: Timestamp | string;
  active: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. USER & AUTH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lightweight user shape passed around in components.
 * Matches the `AppUser` interface originally defined in NewProjectModal.tsx.
 * Use this in component props instead of the full UserDocument.
 */
export interface AppUser {
  id: string;
  displayName?: string;
  email?: string;
  role?: UserRole;
  roles?: UserRole[];
  facultyId?: string;
  expoPushToken?: string | null;
}

/**
 * Returns true if the user holds a given role.
 * Checks both roles[] (new) and the legacy single role field.
 */
export function userHasRole(user: AppUser | undefined, role: UserRole): boolean {
  if (!user) return false;
  if (user.roles?.includes(role)) return true;
  return user.role === role;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. PROJECTS — supporting types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single study program within a faculty.
 * Source: NewProjectModal.tsx
 */
export interface Program {
  key: string;
  label: Record<Lang, string>;
  level: DegreeLevel;
}

/**
 * A faculty with its programs.
 * Source: NewProjectModal.tsx
 */
export interface Faculty {
  key: string;
  label: Record<Lang, string>;
  programs: Program[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. MILESTONES & GRADING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Grading weights for supervisor and two examiners.
 * Source: Milestoneservice.ts
 */
export interface GradeWeights {
  supervisorWeight: number;  // e.g. 0.30
  examiner1Weight: number;   // e.g. 0.35
  examiner2Weight: number;   // e.g. 0.35
}

/**
 * A single rubric criterion used when creating/grading a project.
 * Source: NewProjectModal.tsx
 */
export interface GradingCriterion {
  key: string;
  label: string;
  maxScore: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shape of the NotificationsContext value.
 * Source: NotificationsContext (imported by NotificationBell.tsx)
 */
export interface NotificationsContextValue {
  unreadCount: number;
  notifications: NotificationDocument[];
  markAllRead: () => void | Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. UI / COMPONENT PROPS
//    Kept here for reference; components can import and extend these.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Props shared by every modal component.
 */
export interface BaseModalProps {
  visible: boolean;
  setVisible: (v: boolean) => void;
  lang: Lang;
  styles: any; // each screen passes its own StyleSheet
}

/**
 * UserRecord shape used in AddStudentToProjectModal.
 * Subset of UserDocument; kept separate to avoid pulling in Timestamp.
 */
export interface UserRecord {
  id: string;
  displayName: string;
  email: string;
  role: string;
  roles: string[];
  facultyId: string;
  isActive: boolean;
  totp_enabled?: boolean;
  totp_last_verified?: any;
}

/**
 * ProjectRecord shape used in AddStudentToProjectModal.
 * Lightweight subset of ProjectDocument for list rendering.
 */
export interface ProjectRecord {
  id: string;
  titleHe: string;
  titleEn: string;
  facultyId: string;
  status: string;
  supervisorName: string;
  degreeType: string;
  projectType: string;
  academicYear: string;
  enrolledStudentIds: string[];
}

export interface AssignedMilestone {
  id: string;
  projectId: string;
  projectTitleHe: string;
  projectTitleEn: string;
  type: string;
  status: string;
  studentNames: string[];
  studentIds: string[];
  supervisorId: string;
  supervisorScore: number | null;
  supervisorName: string;                // ← new
  examinerIds: string[];
  examiner1Score: number | null;
  examiner2Score: number | null;
  examiner1GradeId: string | null;
  examiner2GradeId: string | null;
  gradeWeights: GradeWeights | null;
  defenseDate: string | null;
  defenseRoom: string | null;
  facultyId: string;
  milestoneHistory: {                    // ← new
    type: string;
    supervisorScore: number | null;
    supervisorComment: string;
    fileUrls: string[];
    status: string;
  }[];
  examinerGrading?: Record<string, { gradedAt: string }>;
}


export interface SystemStats {
  totalUsers: number;
  totalProjects: number;
  activeProjects: number;
  totalMilestones: number;
  pendingMilestones: number;
  totalApplications: number;
}

export interface MilestoneRecord {
  id: string;
  projectId: string;
  type: string;
  status: string;
  projectTitleHe: string;
  projectTitleEn: string;
  facultyId: string;
  dueDate: any;
  studentNames: string[];
}

export interface PendingMilestone {
  id: string;
  projectId: string;
  projectTitleHe: string;
  projectTitleEn: string;
  type: string;
  status: string;
  studentNames: string[];
  studentIds: string[];
  supervisorId: string;
  supervisorScore: number | null;
  supervisorComment?: string;
  fileUrls?: string[];
  submissionNote?: string;
  
  examinerIds: string[];
  examiner1Score: number | null;
  examiner2Score: number | null;
  gradeWeights: GradeWeights | null;
  dueDate: any;
  facultyId: string;
  defenseDate: any;
  defenseRoom: string | null;

  supervisorName?: string;        // ← add
  milestoneGrades?: {             // ← add
    type: string;
    score: number | null;
  }[];
}

export interface Project {
  id: string;
  titleHe: string;
  titleEn: string;
  status: string;
  facultyId: string;
}

export interface InProgressProject {
  id: string;
  projectTitleHe: string;
  projectTitleEn: string;
  facultyId: string;
  supervisorName: string;
  status: string;

  students: {
    id: string;
    name: string;
    progress: number;
    milestones: {
      type: string;
      status: string;
      supervisorScore: number | null;
    }[];
  }[];
}

export interface ExaminerUser {
  id: string;
  displayName: string;
  email: string;
  facultyId: string;
}

export type StudentState = 'loading' | 'no_project' | 'pending' | 'active';

export type DegreeType  = 'bachelors' | 'masters' ;

export type MilestoneType =
  | 'research_proposal'
  | 'progress_report'
  | 'final_report'
  | 'defense';

export interface ProjectProposal {
  id:            string;
  titleHe:       string;
  titleEn:       string;
  descriptionHe: string;
  descriptionEn: string;
  supervisorId:  string;
  supervisorName:string;
  facultyId:     string;
  degreeType:    DegreeType;
  projectType:   ProjectType;
  NumberOfStudents:   number;
  requiredSkills:string[];
  status:        string;
  academicYear:  string;
  projectFileUrl: string | null; 
}

export interface ActiveProject {
  id:            string;
  titleHe:       string;
  titleEn:       string;
  descriptionHe: string;  // ← was missing
  descriptionEn: string;  // ← was missing
  supervisorId:  string;
  supervisorName:string;
  academicYear:  string;
  semesterStart: string | null;
  status:        string;
}

export interface Milestone {
  id:          string;
  type:        MilestoneType;
  status:      MilestoneStatus;
  dueDate:     string;
  submittedAt: string | null;
  fileUrls:    string[];
  finalGrade:  number | null;
  defenseDate: string | null;
  defenseRoom: string | null;
  examinerNames: string[];
  examinerIds: string[];
  supervisorScore?: number | null;
}

export interface PendingApplication {
  id:          string;
  projectId:   string;
  projectTitleHe: string;
  projectTitleEn: string;
  submittedAt: string;
  status:      'pending' | 'meeting_requested';
}

export interface AppNotification {
  id:        string;
  titleHe:   string;
  titleEn:   string;
  bodyHe:    string;
  bodyEn:    string;
  isRead:    boolean;
  createdAt: string;
  relatedProjectId: string | null;
}