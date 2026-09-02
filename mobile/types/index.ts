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
import type { AppRole } from '../components/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// 1. PRIMITIVES & ENUMS
// ─────────────────────────────────────────────────────────────────────────────

export type Lang = 'he' | 'en';

export type DegreeLevel = 'bachelors' | 'masters';

export type ProjectType = 'project' | 'thesis';

/**
 * All roles a user can hold.
 * A user has one primary `role` and an optional `roles[]` array for additional
 * roles (e.g. a supervisor who is also an internal_examiner).
 * Canonical source: AppRole in components/i18n.ts.
 */
export type UserRole = AppRole;

/**
 * All possible statuses a milestone can pass through.
 * Source: Milestoneservice.ts
 */
export type MilestoneStatus =
  | 'pending'
  | 'submitted'
  | 'rejected'               // coordinator returned it for revision — student resubmits
  | 'supervisor_graded'
  | 'graded'
  | 'coordinator_approved'
  | 'examiners_assigned'     // coordinator picked 2 examiners (after final_report)
  | 'examiner_graded'        // at least one examiner graded
  | 'both_examiners_graded'  // both examiners submitted grades
  | 'awaiting_defense_date'  // defense panel confirmed, examiners submitting candidate dates
  | 'date_conflict'          // examiners had no common date — coordinator must resolve
  | 'defense_date_set'       // date locked in, waiting on coordinator for time/room/building
  | 'scheduled'              // full defense logistics set
  | 'completed';

// ── Defense date matching (see server/src/services/defenseScheduling.ts) ───
export interface DefensePanelMember {
  type: 'internal' | 'external';
  ref: string;             // uid for internal, examinerTokens doc id for external
  displayName: string;
  email?: string;          // external only
}

export interface DefenseDateSubmission {
  examinerKey: string;     // `${type}:${ref}`
  type: 'internal' | 'external';
  ref: string;
  roundIndex: number;
  candidateDates: string[]; // ISO 'YYYY-MM-DD', Sun-Thu only
  submittedAt: any;
}

export interface DefenseSchedulingRound {
  roundIndex: number;
  panel: [string, string]; // examinerKeys
  startedAt: any;
  outcome: 'pending' | 'matched' | 'no_common_date';
  matchedDate: string | null;
  resolvedBy: null | {
    coordinatorId: string;
    decidedAt: any;
    action: 'keep_examiners' | 'replace_examiner';
    replacedExaminerKey?: string;
    newExaminerKey?: string;
    autoPickedDate?: string;
  };
}

export interface DefenseDateMatching {
  windowStart: any;
  windowEnd: any;
  windowAnchoredAt: any;
  currentRound: number;
  finalDate: any | null;
  submissions: Record<string, DefenseDateSubmission>;
  rounds: DefenseSchedulingRound[];
}

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
  /** True once this user has finished or dismissed their one-time, first-
   *  login onboarding tour (see contexts/OnboardingTourContext.tsx /
   *  components/onboarding/OnboardingTourOverlay.tsx). False/undefined means
   *  it hasn't been shown yet. Never shown to system_admin. */
  hasSeenOnboardingTour?: boolean;
  // Student-only fields
  studentId?: string;
  phone?: string;
  degreeType?: DegreeLevel | '';
  year?: string;
  major?: string;
  createdAt?: Timestamp | string;
  // Student-only thesis/project track — see constants/studentTrack.ts.
  // Absent entirely on bachelors students (the concept doesn't apply) and on
  // any student doc written before this feature existed.
  trackPolicy?: 'coordinator_gated' | 'signup_choice' | 'project_only';
  /** null = policy-fixed-but-not-yet-chosen (coordinator_gated, pending) */
  track?: ProjectType | null;
  trackLocked?: boolean;
  trackLockedReason?: 'signup_choice' | 'project_only' | 'coordinator_gated_default' | 'system_admin_override';
  trackLockedAt?: Timestamp | string | null;
  /** Only ever set/meaningful for trackPolicy === 'coordinator_gated'. */
  thesisEligibility?: {
    method: 'manual' | 'automatic';
    eligible: boolean;
    decidedBy: string | null;
    decidedAt: Timestamp | string | null;
    reason?: string | null;
    // Forward-compat for a future automatic-threshold mode — unused today.
    threshold?: number | null;
    computedScore?: number | null;
  } | null;
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
  /** Primary/first value — prefer degreeTypes/projectTypes (the full
   *  multi-select set) for anything eligibility- or filter-related. */
  degreeType: DegreeLevel | 'both';
  projectType: ProjectType;
  /** Full multi-select set — a project can be open to more than one degree
   *  type and/or project type at once (see server's createAdminProject/
   *  createSupervisorProject). Absent on pre-migration projects. */
  degreeTypes?: DegreeLevel[];
  projectTypes?: ProjectType[];
  /** Links sibling docs created from one multi-faculty Add Project
   *  submission (see server's createAdminProject). */
  postingGroupId?: string | null;
  academicYear: string;
  enrolledStudentIds: string[];
  maxStudents: number;
  skills?: string;
  requiredSkills?: string[];
  /** Legacy plain string[] (pre-minGrade) or the newer {subject, minGrade?}[]
   *  — always read through components/Prerequisites.ts's
   *  normalizePrerequisites rather than directly. */
  prerequisites?: Array<string | { subject: string; minGrade?: number }>;
  program?: string | null;
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
 * Source: constants/faculties.ts
 */
export interface Program {
  key: string;
  label: Record<Lang, string>;
  level: DegreeLevel;
  // Readable subject slug (e.g. 'computer_science', 'data_science') shared by
  // every degree level of the same subject — this is what gets written to a
  // student's `major` field on their user doc, not `key`.
  slug: string;
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

// Identity-keyed sibling — see components/Milestoneservice.ts's copy.
export interface IdentityGradeWeights {
  supervisorWeight: number;
  examinerWeight: number;
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
  // Optional majors restriction (supervisor / secondary_supervisor only) —
  // omitted/empty means unrestricted (every major in their faculty). See
  // constants/permissions.ts's majorsForFaculty for the slug source of truth.
  assignedMajors?: string[];
  // Extra faculties this user is offered as `supervisor`/`secondary_supervisor`
  // in, beyond their own facultyId — independently per role, so a user can be
  // a full supervisor in one faculty and only a co-supervisor in another. A
  // restriction for a cross-faculty ('all') account, an addition for a normal
  // single-faculty account. See adminController.ts's getSupervisorsList.
  supervisorFacultyIds?: string[];
  secondarySupervisorFacultyIds?: string[];
  // Same additive/restrictive idea, one field per role — faculty_admin/
  // program_head/grad_school_head/internal_examiner can each independently
  // be granted extra faculties for that role. grad_school_head/
  // internal_examiner are no longer forced to facultyId 'all' at creation —
  // a real facultyId here means these ADD faculties; only an explicit
  // facultyId==='all' makes them RESTRICT (see scopeAuthorization.ts's
  // effectiveFacultyIds on the server).
  facultyAdminFacultyIds?: string[];
  programHeadFacultyIds?: string[];
  gradSchoolHeadFacultyIds?: string[];
  internalExaminerFacultyIds?: string[];
  // Student-only, independent axes resolved against the admin-managed
  // option lists (see server/src/services/studentStatuses.ts). Both are
  // optional keys into that config — undefined/null means "not set yet".
  primaryStatus?: string | null;
  secondaryStatus?: string | null;
  // Granular per-user permission grants (system_admin-managed) — see
  // constants/permissions.ts.
  permissionRules?: import('../constants/permissions').ScopeRule[];
  // A coordinator's own operational scope narrowing beyond their facultyId.
  coordinatorScopes?: import('../constants/permissions').CoordinatorScope[];
}

/**
 * A single admin-manageable Primary/Secondary status option — mirrors
 * StatusOption in server/src/services/studentStatuses.ts exactly.
 */
export interface StatusOption {
  key: string;
  labelHe: string;
  labelEn: string;
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
  degreeTypes?: string[];
  projectTypes?: string[];
  academicYear: string;
  enrolledStudentIds: string[];
}

export interface AssignedMilestone {
  id: string;
  projectId: string;
  projectTitleHe: string;
  projectTitleEn: string;
  // Data-Science-only paper-form fields (see examinor/home.tsx's
  // isDataScienceDocument header block) — populated for every faculty by
  // getExaminerDashboard, but only rendered when facultyId === 'data_science'.
  academicYear: string | null;
  academicYearHebrew: string | null;
  projectStartDate: string | null;
  major: string | null;
  type: string;
  status: string;
  studentNames: string[];
  studentIds: string[];
  supervisorId: string;
  supervisorScore: number | null;
  supervisorName: string;                // ← new
  examinerIds: string[];
  // Identity-keyed defense milestones (post-generalization) carry this
  // instead of the legacy positional pair below.
  examinerScores?: Record<string, { score: number; comments: string }> | null;
  examiner1Score: number | null;
  examiner2Score: number | null;
  examiner1GradeId: string | null;
  examiner2GradeId: string | null;
  gradeWeights: GradeWeights | IdentityGradeWeights | null;
  defenseDate: string | null;
  dueDate?: any;                          // ← add — actual defense date lives here (Firestore Timestamp shape), not defenseDate
  defenseRoom: string | null;
  defenseBuilding?: string | null;
  defenseTime?: string | null;
  defensePanel?: DefensePanelMember[];
  dateMatching?: DefenseDateMatching;
  facultyId: string;
  milestoneHistory: {                    // ← new
    type: string;
    supervisorScore: number | null;
    supervisorComment: string;
    fileUrls: string[];
    status: string;
  }[];
  examinerGrading?: Record<string, { gradedAt: string }>;
  // Per-milestone configured grading rubric (see
  // server/src/services/workflowTemplates.ts) — empty means the grading
  // modal falls back to the hardcoded default rubric. Ignored when
  // finalGradeComponents is set (see below).
  gradingComponents?: GradingComponentSpec[];
  // Three-rubric final-grade workflow (defense only) — replaces the single
  // shared gradingComponents rubric above with two independent ones this
  // examiner submits separately: their evaluation of the written project,
  // and their evaluation of the oral defense. See
  // mobile/app/examinor/home.tsx's evaluation modal.
  finalGradeComponents?: {
    supervisorEvaluation: { components: GradingComponentSpec[]; weight: number };
    examinerProjectEvaluation: { components: GradingComponentSpec[]; weight: number };
    examinerDefenseEvaluation: { components: GradingComponentSpec[]; weight: number };
  } | null;
  examinerEvaluations?: Record<string, {
    project?: { total: number };
    defense?: { total: number };
  }>;
  // Generic chain-routing milestones (see server/src/services/
  // milestoneRouting.ts's isChainDriven — e.g. the examiner-only 'poster'
  // type) carry neither examinerScores nor finalGradeComponents, so
  // alreadyGraded() in mobile/app/examinor/home.tsx needs these to tell
  // "already graded" apart from "not yet" for this examiner.
  stageScores?: Record<string, { score: number; gradedBy: string }> | null;
  routing?: Array<{ id: string; role: string; action: string }> | null;
  // Position among this project's own milestones, snapshotted from the
  // faculty's workflow template at enrollment (see projectEnrollment.ts) —
  // the only reliable way to tell whether a 'defense' milestone sitting at
  // 'pending' is actually next up, since every milestone (including
  // defense) starts at 'pending' the moment the project is created.
  order?: number;
  // True means this milestone has NO supervisor grading stage at all — see
  // server/src/services/workflowTemplates.ts's examinerOnlyGrading.
  examinerOnlyGrading?: boolean;
  // A non-scored Q&A form every assigned examiner fills independently (e.g.
  // yes/no screening questions) — a sibling of gradingComponents, rendered
  // inline in mobile/app/examinor/home.tsx's form-answers modal instead of
  // the numeric-rubric grade modal.
  examinerFormFields?: FormFieldSpec[];
  examinerFormAnswers?: Record<string, Record<string, { value: 'yes' | 'no'; comment?: string }>>;
}

// Mirrors GradingComponentSpec in server/src/services/workflowTemplates.ts.
export interface GradingComponentSpec {
  key: string;
  labelHe: string;
  labelEn: string;
  maxScore: number;
  weight: number;
  hasComment: boolean;
  visibleToStudent: boolean;
  groupHe?: string;
  groupEn?: string;
  excludeFromTotal?: boolean;
}

// Mirrors FormFieldSpec in server/src/services/workflowTemplates.ts (only
// the 'yesno' shape is actually used by mobile/app/examinor/home.tsx today).
export interface FormFieldSpec {
  key: string;
  labelHe: string;
  labelEn: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'table' | 'yesno';
  required: boolean;
  commentRequiredOn?: 'yes' | 'no';
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

export interface MilestoneRevision {
  version: number;
  fileUrls: string[];
  submissionNote: string;
  submittedAt: string | null;
  status: string;
  decision: 'approved' | 'rejected' | null;
  decisionReason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
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
  revisionHistory?: MilestoneRevision[];
  /** Chain-driven routing (see server's milestoneRouting.ts) — null/undefined
   *  for legacy, non-chain-driven milestones. Used to tell "genuinely
   *  awaiting a coordinator approve decision right now" apart from a
   *  chain-driven milestone that just happens to share this array's coarse
   *  status filter while its current stage belongs to a different role/action. */
  routing?: { action: 'grade' | 'approve'; [key: string]: any }[] | null;
  currentStageIndex?: number;

  examinerIds: string[];
  examiner1Score: number | null;
  examiner2Score: number | null;
  gradeWeights: GradeWeights | null;
  dueDate: any;
  facultyId: string;
  defenseDate: any;
  defenseRoom: string | null;
  defenseBuilding?: string | null;
  defenseTime?: string | null;
  defensePanel?: DefensePanelMember[];
  dateMatching?: DefenseDateMatching;

  supervisorName?: string;        // ← add
  milestoneGrades?: {             // ← add
    type: string;
    score: number | null;
  }[];
  /** How many examiner slots this milestone's defense panel needs — see
   *  server/src/services/workflowTemplates.ts's examinerCount. Omitted
   *  means the legacy default of 2. */
  examinerCount?: number;
  submittedAt?: string | null;
  /** research_proposal's own online form — field spec + the student's
   *  submitted values (see addResearchProposalStudentForm.ts). */
  studentFormFields?: Array<{
    key: string; labelHe: string; labelEn: string;
    type: 'text' | 'textarea' | 'date' | 'number' | 'table';
    tableColumns?: Array<{ key: string; labelHe: string; labelEn: string }>;
    autoFill?: 'studentName' | 'studentIdNumber' | 'studentPhone' | 'studentEmail'
      | 'studentPhoto' | 'accumulatedCredits' | 'supervisorName' | 'submissionDate';
    locked?: boolean;
  }> | null;
  studentFormData?: Record<string, unknown> | null;
  supervisorSignedByName?: string | null;
  supervisorSignedAt?: string | null;
}

export interface Project {
  id: string;
  titleHe: string;
  titleEn: string;
  status: string;
  facultyId: string;
  supervisorId?: string;
  enrolledStudentIds?: string[];
  examinerIds?: string[];
  milestones?: AssignedMilestone[];
  defensePanel?: DefensePanelMember[];
}

export interface InProgressProject {
  id: string;
  projectTitleHe: string;
  projectTitleEn: string;
  facultyId: string;
  supervisorId?: string;
  supervisorName: string;
  status: string;
  createdAt?: string | null;

  students: {
    id: string;
    name: string;
    progress: number;
    milestones: {
      type: string;
      status: string;
      supervisorScore: number | null;
      percentOfFinalGrade?: number;
      dueDate?: string | null;
      submittedAt?: string | null;
    }[];
  }[];
}

export interface ExaminerUser {
  id: string;
  displayName: string;
  email: string;
  facultyId: string;
}

export type StudentState = 'ineligible' | 'loading' | 'awaiting_grade' | 'no_project' | 'choose_supervisor' | 'active';

export type DegreeType  = 'bachelors' | 'masters' ;

export type MilestoneType =
  | 'research_proposal'
  | 'progress_report'
  | 'final_report'
  | 'defense'
  | 'poster';

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
  degreeTypes?:  DegreeType[];
  projectTypes?: ProjectType[];
  NumberOfStudents:   number;
  requiredSkills:string[];
  /** Legacy plain string[] (pre-minGrade) or the newer {subject, minGrade?}[]
   *  — always read through components/Prerequisites.ts's
   *  normalizePrerequisites rather than directly. */
  prerequisites?: Array<string | { subject: string; minGrade?: number }>;
  status:        string;
  academicYear:  string;
  projectFileUrl: string | null;
  // Optional single-major restriction set by the supervisor at project-
  // creation time (constants/faculties.ts slug). Omitted/empty = open to
  // every major in the project's faculty — the pre-existing default.
  major?:        string;
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
  degreeType?:   string;  // 'bachelors' | 'masters' | 'both'
  projectType?:  string;  // 'project' | 'thesis'
  /** Already present on every getStudentProject response (a plain spread of
   *  the Firestore project doc) but not typed here until the progress_report/
   *  midterm form needed them for its per-student signature style (see
   *  utils/examinerSignature.ts). */
  facultyId?:    string;
  major?:        string;
  /** Weighted across every milestone by the project's workflow template's
   *  own percentOfFinalGrade per milestone type — see
   *  server/src/services/gradeEngine.ts's computeProjectFinalGrade. null
   *  until every nonzero-weighted milestone is graded. */
  overallFinalGrade?: number | null;
}

/** The data_science three-rubric defense workflow's supervisor-side rubric
 *  (see server/src/services/workflowTemplates.ts's finalGradeComponents,
 *  server/src/controllers/projectController.ts's submitSupervisorEvaluation)
 *  — one of the "supervisor forms" the manager's requirement says the
 *  student should be able to see. Absent for any milestone/faculty that
 *  hasn't configured finalGradeComponents. */
export interface StudentVisibleSupervisorEvaluation {
  scores: Record<string, { score: number; maxScore: number; weight: number }>;
  total: number;
  comment?: string;
}

/** The proposal/midterm staff record the supervisor files alongside the
 *  student's own submission (staffRecordMode: 'upload_or_form' — see
 *  server/src/controllers/supervisorController.ts's submitStaffRecord). */
export interface StudentVisibleStaffRecord {
  mode: 'upload' | 'form';
  fileUrls?: string[];
  formData?: Record<string, unknown>;
}

export interface Milestone {
  id:          string;
  type:        MilestoneType;
  status:      MilestoneStatus;
  /** Every student this milestone belongs to — length > 1 for a team
   *  project. Needed to render one auto-filled personal-info block per
   *  teammate on the research-proposal form (see
   *  ResearchProposalFormModal.tsx). */
  studentIds?: string[];
  /** Snapshotted from the workflow template's own milestone list at
   *  enrollment — see server/src/services/projectEnrollment.ts and
   *  workflowTemplates.ts's resolveMilestoneOrder. Absent on a milestone
   *  created before this field existed; sort/unlock logic falls back to a
   *  legacy type-name order in that case. */
  order?:      number;
  dueDate:     string;
  submittedAt: string | null;
  fileUrls:    string[];
  finalGrade:  number | null;
  defenseDate: string | null;
  defenseRoom: string | null;
  defenseBuilding?: string | null;
  defenseTime?: string | null;
  defensePanel?: DefensePanelMember[];
  dateMatching?: DefenseDateMatching;
  examinerNames: string[];
  examinerIds: string[];
  supervisorScore?: number | null;
  rejectionReason?: string | null;
  coordinatorComment?: string | null;
  revisionHistory?: MilestoneRevision[];
  /** Three-rubric defense workflow — the supervisor's own evaluation
   *  (distinct from examinerEvaluations, which the student never receives —
   *  see server/src/services/milestoneVisibility.ts). */
  supervisorEvaluation?: StudentVisibleSupervisorEvaluation | null;
  /** The template's own rubric definition, needed to label each score in
   *  supervisorEvaluation.scores (component labels/maxScores/weights). */
  finalGradeComponents?: {
    supervisorEvaluation: { components: { key: string; labelHe: string; labelEn: string; maxScore: number; weight: number }[] };
  } | null;
  autoCalculatedFinalGrade?: number | null;
  /** The server sends the full object, but the student UI only ever reads
   *  `.status` — the supervisor's override reason isn't meant for display
   *  here, just whether a decision is still pending. */
  gradeOverride?: { status: 'pending' | 'approved' | 'rejected' } | null;
  staffRecord?: StudentVisibleStaffRecord | null;
  staffFormFields?: { key: string; labelHe: string; labelEn: string }[];
  /** What this milestone requires the student to attach — see
   *  server/src/services/workflowTemplates.ts's SubmissionRequirement.
   *  Absent means no requirement recorded (a milestone created before this
   *  feature existed) — the submit screen treats that the same as 'none',
   *  showing both fields as optional. */
  submissionRequirement?: 'file' | 'comment' | 'both' | 'none';
  /** Which file types the student may attach, when submissionRequirement is
   *  'file'/'both' — see server/src/services/workflowTemplates.ts's
   *  MilestoneFileType. Absent means unrestricted. */
  allowedFileTypes?: ('pdf' | 'word' | 'powerpoint' | 'image' | 'zip')[];
  /** The student's own online form for this milestone (currently only
   *  data_science's research_proposal — see
   *  server/src/scripts/addResearchProposalStudentForm.ts). Absent means this
   *  milestone still uses the generic file+note SubmitMilestoneModal. */
  studentFormFields?: Array<{
    key: string; labelHe: string; labelEn: string;
    type: 'text' | 'textarea' | 'date' | 'number' | 'table';
    required: boolean;
    tableColumns?: Array<{ key: string; labelHe: string; labelEn: string; type: 'text' | 'number' | 'date' }>;
    autoFill?: 'studentName' | 'studentIdNumber' | 'studentPhone' | 'studentEmail'
      | 'studentPhoto' | 'accumulatedCredits' | 'supervisorName' | 'submissionDate'
      | 'projectNameHe' | 'projectNameEn';
    locked?: boolean;
  }>;
  /** The student's (or teammate's) submitted values, keyed by
   *  studentFormFields[].key. */
  studentFormData?: Record<string, unknown> | null;
  /** Tri-state coordinator decision on a research_proposal milestone — see
   *  ProposalRecommendationModal.tsx. "פרויקט לא מאושר" isn't a value here at
   *  all; it goes through the ordinary rejectionReason/status:'rejected' path
   *  instead. */
  coordinatorRecommendation?: 'approved' | 'approved_conditionally' | null;
  /** Deterministic signature stamps (see utils/examinerSignature.ts) — only
   *  the name+timestamp are ever persisted, never a drawn/uploaded image. */
  supervisorSignedAt?: string | null;
  supervisorSignedByName?: string | null;
  coordinatorSignedAt?: string | null;
  coordinatorSignedByName?: string | null;
}

export interface PendingApplication {
  id:          string;
  projectId:   string;
  projectTitleHe: string;
  projectTitleEn: string;
  submittedAt: string;
  /** 'awaiting_student_confirmation' = a supervisor approved this
   *  application but the student hasn't yet decided whether to actually
   *  start the project (see server/src/controllers/applicationController.ts's
   *  confirmApplicationStart) — lets a student holding several approvals at
   *  once pick which one to take. */
  status:      'pending' | 'meeting_requested' | 'awaiting_student_confirmation';
  /** Set when the supervisor requested a meeting — the date of that
   *  response, so the student can see when the supervisor answered. */
  reviewedAt?: string | null;
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


export interface MyProjectMilestoneInfo {
  nameHe: string; nameEn: string; type: string;
  dueDate: string | null; daysLeft: number | null;
  urgency: 'green' | 'orange' | 'red' | null;
}

export interface MyProjectEnrolledStudent {
  id: string; name: string;
  degreeType: string | null; yearOfStudy: number | null;
  /** Teudat zehut, captured at signup — used by the data_science final-grade
   *  certificate. */
  studentIdNumber?: string | null;
}

export interface MyProject {
  id: string; titleHe: string; titleEn: string;
  facultyId: string; status: string; degreeType: string;
  enrolledStudentIds: string[]; applicationIds: string[];
  academicYear: string; projectType: string;
  degreeTypes?: string[]; projectTypes?: string[];
  /** Set once at enrollment — when the supervisor accepted the student's
   *  application and the project actually started. Used by the data_science
   *  final-grade certificate. */
  projectStartDate?: string | null;
  descriptionHe: string; descriptionEn: string;
  NumberOfStudents:number;
  requiredSkills?: string[];
  projectFileUrl?: string | null;
  /** Resolved enrolled-student display info — what the old standalone
   *  Deadlines tab used to show (name/degree/year), now folded directly
   *  into each project card instead. */
  enrolledStudents?: MyProjectEnrolledStudent[];
  /** The project's first not-yet-done milestone, in template order — null
   *  once every milestone is done (or none exist yet, e.g. no student
   *  enrolled). Drives the project card's due-date border color. */
  currentMilestone?: MyProjectMilestoneInfo | null;
}

export interface Application {
  id: string; projectId: string; projectTitleHe: string; projectTitleEn: string;
  studentId: string; studentName: string; studentEmail: string;
  transcriptUrl: string; cvUrl: string; coverNote: string;
  status: string; submittedAt: any; degreeType: string;
  /** Set alongside status on every supervisor decision (approve/reject/
   *  meeting_requested) — see server/src/controllers/supervisorController.ts's
   *  handleApplicationDecision. Lets the supervisor see when they answered. */
  reviewedAt?: any;
  /** Set instead of a real rejection when this application was auto-closed
   *  because the student got accepted into a different project — see
   *  server/src/services/projectEnrollment.ts's closeOtherPendingApplications. */
  autoClosedReason?: 'accepted_elsewhere';
  aiScreening?: {
    verdict: 'strong_fit' | 'partial_fit' | 'weak_fit' | 'unable_to_assess';
    reasoning: string;
    generatedAt: string;
  };
  /** A separate AI pass — independent pass/fail checks (today: grades vs.
   *  prerequisites off the transcript) rolled into one recommendation. See
   *  server/src/services/applicationReviewService.ts. */
  aiReview?: {
    checks: Array<{
      id: string;
      labelHe: string;
      labelEn: string;
      passed: boolean | null;
      reasoning: string;
    }>;
    recommendation: 'approve' | 'meeting' | 'reject';
    generatedAt: string;
  };
}
