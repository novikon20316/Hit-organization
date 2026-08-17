import { Timestamp } from 'firebase/firestore';
// firebase/roles.ts
// Single source of truth for:
//   • Role string literals (must match Firestore `users.role` field)
//   • Permission matrix (what each role can do)
//   • Route guard helpers (used in _layout.tsx / screen guards)
//   • User document factory (for creating new users programmatically)
//   • External examiner token helpers (no Auth account needed)

import { AppRole, FacultyId } from '@/components/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// ROLE CONSTANTS
// These string literals MUST match exactly what is stored in Firestore.
// External examiners are NOT a role — they use tokenised links.
// ─────────────────────────────────────────────────────────────────────────────

export const ROLES = {
  STUDENT:               'student',
  SUPERVISOR:            'supervisor',
  SECONDARY_SUPERVISOR:  'secondary_supervisor',
  COORDINATOR:           'coordinator',
  FACULTY_ADMIN:         'faculty_admin',
  PROGRAM_HEAD:          'program_head',
  PROJECT_COORDINATOR:   'administrative_secretary',
  GRAD_SCHOOL_HEAD:      'grad_school_head',
  INTERNAL_EXAMINER:     'internal_examiner',
  SYSTEM_ADMIN:          'system_admin',
} as const satisfies Record<string, AppRole>;

// All non-student, non-examiner staff roles
export const STAFF_ROLES: AppRole[] = [
  'supervisor',
  'secondary_supervisor',
  'coordinator',
  'faculty_admin',
  'program_head',
  'administrative_secretary',
  'grad_school_head',
  'internal_examiner',
  'system_admin',
];

// Roles a delegate (faculty_admin/program_head/grad_school_head) can create
// or edit for someone else — STAFF_ROLES minus the admin tier itself
// (system_admin/faculty_admin/program_head/grad_school_head — see
// server/src/config/permissionScopes.ts's ADMIN_TIER_ROLES, which a delegate
// may never touch) and minus 'student' (self-registration only, not
// admin-created here).
export const DELEGATE_MANAGEABLE_ROLES: AppRole[] = [
  'coordinator',
  'supervisor',
  'secondary_supervisor',
  'administrative_secretary',
  'internal_examiner',
];

// Roles that can approve at grad-school level
export const GRAD_SCHOOL_APPROVERS: AppRole[] = [
  'grad_school_head',
  'system_admin',
];

// Roles automatically created with facultyId 'all', exempt from the "must
// pick a faculty" requirement when a system_admin creates their account.
// system_admin has no concept of a home faculty; administrative_secretary's
// real scope lives in coordinatorScopes (facultyId is just a sentinel for
// it). grad_school_head/internal_examiner used to be forced cross-faculty
// too; they now get a real home facultyId like any other staff role (plus
// an optional "additional faculties" grant — see gradSchoolHeadFacultyIds/
// internalExaminerFacultyIds on the user doc) unless a system_admin
// explicitly sets one to 'all'.
export const CROSS_FACULTY_ROLES: AppRole[] = [
  'system_admin',
  'administrative_secretary',
];

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION MATRIX
// Each key is an action; value is the set of roles allowed to perform it.
// Use hasPermission() at runtime rather than checking roles directly.
// ─────────────────────────────────────────────────────────────────────────────

export type Permission =
  // Project / process
  | 'create_project'
  | 'publish_project'
  | 'apply_to_project'
  | 'view_all_projects'
  | 'view_own_project'
  | 'view_faculty_projects'
  // Student process file
  | 'open_process_file'
  | 'close_process_file'
  | 'view_process_file'
  | 'edit_process_status'
  | 'pause_process_clock'
  // Milestones
  | 'submit_milestone'
  | 'grade_milestone'
  | 'approve_milestone_coordinator'
  | 'approve_milestone_grad_school'
  | 'reopen_milestone'
  | 'override_deadline'
  // Proposals & documents
  | 'submit_proposal'
  | 'approve_proposal_supervisor'
  | 'approve_proposal_faculty'
  | 'approve_proposal_grad_school'
  // Supervisor management
  | 'assign_supervisor'
  | 'approve_supervisor'
  | 'propose_supervisor'
  // Examiners
  | 'propose_examiners'
  | 'approve_examiners_faculty'
  | 'approve_examiners_grad_school'
  | 'send_examiner_invitation'
  | 'view_examiner_database'
  | 'edit_examiner_database'
  // Grades
  | 'enter_grade'
  | 'approve_grade_coordinator'
  | 'approve_grade_grad_school'
  | 'change_grade_after_approval'
  | 'transfer_grade_to_maklol'
  | 'view_all_grades'
  // Templates
  | 'view_templates'
  | 'create_template'
  | 'edit_template'
  | 'approve_template_grad_school'
  // Reports
  | 'view_faculty_reports'
  | 'view_cross_faculty_reports'
  | 'export_reports'
  // Admin
  | 'manage_users'
  | 'manage_system_config'
  | 'view_audit_log'
  | 'toggle_maintenance'
  // Chat
  | 'send_message'
  | 'view_own_messages'
  // Project erasure/archive protocol
  | 'request_project_erasure'
  | 'approve_project_erasure'
  | 'view_archived_projects'
  | 'restore_project';

export const PERMISSION_MAP: Record<Permission, AppRole[]> = {
  // ── Project ───────────────────────────────────────────────────────────────
  create_project:               ['supervisor', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  publish_project:              ['supervisor', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  apply_to_project:             ['student'],
  view_all_projects:            ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'],
  view_own_project:             ['student', 'supervisor', 'secondary_supervisor'],
  view_faculty_projects:        ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'internal_examiner'],

  // ── Student process file ──────────────────────────────────────────────────
  open_process_file:            ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  close_process_file:           ['coordinator', 'faculty_admin', 'program_head', 'grad_school_head', 'system_admin'],
  view_process_file:            ['supervisor', 'secondary_supervisor', 'coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'internal_examiner', 'system_admin'],
  edit_process_status:          ['coordinator', 'faculty_admin', 'program_head', 'system_admin'],
  pause_process_clock:          ['coordinator', 'faculty_admin', 'program_head', 'grad_school_head', 'system_admin'],

  // ── Milestones ────────────────────────────────────────────────────────────
  submit_milestone:             ['student'],
  grade_milestone:              ['supervisor', 'secondary_supervisor', 'internal_examiner'],
  approve_milestone_coordinator:['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  approve_milestone_grad_school:['grad_school_head', 'system_admin'],
  reopen_milestone:             ['coordinator', 'faculty_admin', 'program_head', 'system_admin'],
  override_deadline:            ['coordinator', 'faculty_admin', 'program_head', 'system_admin'],

  // ── Proposals & documents ─────────────────────────────────────────────────
  submit_proposal:              ['student'],
  approve_proposal_supervisor:  ['supervisor', 'secondary_supervisor'],
  approve_proposal_faculty:     ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary'],
  approve_proposal_grad_school: ['grad_school_head', 'system_admin'],

  // ── Supervisor management ─────────────────────────────────────────────────
  assign_supervisor:            ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  approve_supervisor:           ['grad_school_head', 'system_admin'],
  propose_supervisor:           ['student', 'supervisor'],

  // ── Examiners ─────────────────────────────────────────────────────────────
  propose_examiners:            ['supervisor', 'secondary_supervisor'],
  approve_examiners_faculty:    ['coordinator', 'faculty_admin', 'program_head'],
  approve_examiners_grad_school:['grad_school_head', 'system_admin'],
  send_examiner_invitation:     ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  view_examiner_database:       ['supervisor', 'secondary_supervisor', 'coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'internal_examiner', 'system_admin'],
  edit_examiner_database:       ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'],

  // ── Grades ────────────────────────────────────────────────────────────────
  enter_grade:                  ['supervisor', 'secondary_supervisor', 'internal_examiner'],
  approve_grade_coordinator:    ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary'],
  approve_grade_grad_school:    ['grad_school_head', 'system_admin'],
  change_grade_after_approval:  ['grad_school_head', 'system_admin'],
  transfer_grade_to_maklol:     ['coordinator', 'faculty_admin', 'grad_school_head', 'system_admin'],
  view_all_grades:              ['coordinator', 'faculty_admin', 'program_head', 'grad_school_head', 'system_admin'],

  // ── Templates ─────────────────────────────────────────────────────────────
  view_templates:               ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'],
  create_template:              ['faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  edit_template:                ['faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  approve_template_grad_school: ['grad_school_head', 'system_admin'],

  // ── Reports ───────────────────────────────────────────────────────────────
  view_faculty_reports:         ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  view_cross_faculty_reports:   ['grad_school_head', 'system_admin'],
  export_reports:               ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'],

  // ── Admin ─────────────────────────────────────────────────────────────────
  manage_users:                 ['faculty_admin', 'system_admin'],
  manage_system_config:         ['system_admin'],
  view_audit_log:               ['coordinator', 'faculty_admin', 'program_head', 'grad_school_head', 'system_admin'],
  toggle_maintenance:           ['system_admin'],

  // ── Chat ──────────────────────────────────────────────────────────────────
  send_message:                 ['student', 'supervisor', 'secondary_supervisor', 'coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'internal_examiner', 'system_admin'],
  view_own_messages:            ['student', 'supervisor', 'secondary_supervisor', 'coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'internal_examiner', 'system_admin'],

  // ── Project erasure/archive protocol ──────────────────────────────────────
  // Deliberately narrower than the other "coordinator-tier" keys above (no
  // faculty_admin/program_head/administrative_secretary): only a real
  // coordinator or system_admin may approve an erasure, view the archive,
  // or restore a project.
  request_project_erasure:      ['supervisor', 'secondary_supervisor'],
  approve_project_erasure:      ['coordinator', 'system_admin'],
  view_archived_projects:       ['coordinator', 'system_admin'],
  restore_project:              ['coordinator', 'system_admin'],
};

// ─────────────────────────────────────────────────────────────────────────────
// RUNTIME HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Check if a role has a given permission */
export function hasPermission(role: AppRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  if (role === 'system_admin') return true; // system_admin bypasses all checks
  return PERMISSION_MAP[permission]?.includes(role) ?? false;
}

/** Check if a role is a staff role (non-student) */
export function isStaff(role: AppRole | undefined): boolean {
  if (!role) return false;
  return STAFF_ROLES.includes(role);
}

/** Check if a role has cross-faculty access */
export function isCrossFaculty(role: AppRole | undefined): boolean {
  if (!role) return false;
  return CROSS_FACULTY_ROLES.includes(role);
}

/** Check if role can approve at grad-school level */
export function isGradSchoolApprover(role: AppRole | undefined): boolean {
  if (!role) return false;
  return GRAD_SCHOOL_APPROVERS.includes(role);
}

/** All distinct roles a user holds — primary `role` plus `roles[]`, deduped.
 *  Use this (not `userData.role` alone) anywhere a multi-role user's full
 *  set of roles matters, e.g. the role switcher. */
export function getUserRoles(userData: { role?: AppRole; roles?: AppRole[] } | null | undefined): AppRole[] {
  if (!userData) return [];
  const set = new Set<AppRole>();
  if (userData.role) set.add(userData.role);
  (userData.roles ?? []).forEach((r) => set.add(r));
  return Array.from(set);
}

/** Seniority order for auto-resolving which of a multi-role user's dashboards
 *  they see (no manual switching — see resolveActiveRole below). Mirrors
 *  web/lib/roles.ts's ROLE_RANK — grounded in the permission matrix above,
 *  not an explicit source: system_admin bypasses every check; grad_school_head
 *  is the sole non-admin holder of the most senior approvals; faculty_admin is
 *  the only non-admin role with manage_users; program_head is excluded from
 *  DELEGATE_MANAGEABLE_ROLES while coordinator isn't; administrative_secretary
 *  is explicitly narrower than coordinator for the erasure/archive protocol;
 *  secondary_supervisor never holds more authority than supervisor;
 *  internal_examiner has no approval authority but still outranks student. */
const ROLE_RANK: Record<AppRole, number> = {
  system_admin: 0,
  grad_school_head: 1,
  faculty_admin: 2,
  program_head: 3,
  coordinator: 4,
  administrative_secretary: 5,
  supervisor: 6,
  secondary_supervisor: 7,
  internal_examiner: 8,
  student: 9,
};

export function highestRankedRole(roles: AppRole[]): AppRole | undefined {
  if (roles.length === 0) return undefined;
  return roles.reduce((best, r) => (ROLE_RANK[r] < ROLE_RANK[best] ? r : best));
}

/** Which role's dashboard a multi-role user sees — always their
 *  highest-ranked role, never a manual choice. */
export function resolveActiveRole(userData: { role?: AppRole; roles?: AppRole[] } | null | undefined): AppRole | undefined {
  if (!userData) return undefined;
  return highestRankedRole(getUserRoles(userData));
}

/**
 * Determine the home route for a given role.
 * Used in _layout.tsx after login to redirect to the correct dashboard.
 */
export function getHomeRoute(role: AppRole | undefined): string {
  switch (role) {
    case 'student':              return '/student/home';
    case 'supervisor':           return '/supervisor/dashboard';
    case 'secondary_supervisor': return '/supervisor/dashboard';
    case 'coordinator':          return '/coordinator/home';
    case 'faculty_admin':        return '/faculty_admin/dashboard';
    case 'program_head':         return '/program_head/dashboard';
    case 'administrative_secretary':  return '/administrative_coordinator/dashboard';
    case 'grad_school_head':     return '/grad_school_head/dashboard';
    case 'internal_examiner':    return '/examinor/home';
    case 'system_admin':         return '/admin/overview';
    default:                     return '/(auth)/login';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FIRESTORE USER DOCUMENT SHAPE
// ─────────────────────────────────────────────────────────────────────────────

export interface UserDoc {
  uid: string;
  email: string;
  displayName: string;
  displayNameHe: string;
  displayNameEn: string;
  role: AppRole;
  facultyId: FacultyId;
  additionalRoles: AppRole[];
  // Student-only fields (null for staff)
  degreeType: 'bachelors' | 'masters' | null;
  yearOfStudy: number | null;
  studentId: string | null;
  major: string | null;
  // Supervisor-only
  supervisorId?: string | null;     // for students: who is their supervisor
  activeProjectId?: string | null;
  // Flags
  isActive: boolean;
  profileComplete: boolean;
  hasActiveProject: boolean;
  // Preferences
  language: 'he' | 'en';
  expoPushToken: string | null;
  // Timestamps (Firestore Timestamp)
  createdAt?: unknown;
  lastLoginAt?: unknown;
  isEligibleForProcess: boolean;
}

/**
 * Factory — creates the minimal Firestore user document for a given role.
 * Pass the result to setDoc(doc(db, 'users', uid), createUserDoc(...))
 */
export function createUserDoc(
  uid: string,
  email: string,
  role: AppRole,
  facultyId: FacultyId,
  displayNameHe: string,
  displayNameEn: string,
  extra: Partial<UserDoc> = {}
): Omit<UserDoc, 'createdAt' | 'lastLoginAt'> {
  return {
    uid,
    email,
    displayName: displayNameHe,
    displayNameHe,
    displayNameEn,
    role,
    facultyId,
    additionalRoles: [],
    degreeType: null,
    yearOfStudy: null,
    studentId: null,
    major: null,
    isActive: true,
    profileComplete: false,
    hasActiveProject: false,
    language: 'he',
    expoPushToken: null,
    isEligibleForProcess: false,
    ...extra,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTERNAL EXAMINER TOKEN
// External examiners do NOT have a Firebase Auth account.
// They receive a tokenised link: /examiner-access?token=<uuid>
// The token is stored in Firestore: examinerTokens/{token}
// ─────────────────────────────────────────────────────────────────────────────

export type ExaminerTokenStatus =
  | 'pending'     // sent, not yet opened
  | 'accepted'    // examiner accepted the assignment
  | 'declined'    // examiner declined
  | 'submitted'   // opinion submitted
  | 'expired'     // past deadline or manually revoked
  | 'superseded'; // replaced by a promoted next examiner after decline/timeout — see server/src/services/examinerEscalation.ts

export interface ExaminerTokenDoc {
  token: string;               // UUID, used as Firestore doc ID
  milestoneId: string;         // which milestone/judgment this covers
  projectId: string;
  studentId: string;
  studentName: string;
  thesisTitle: string;
  thesisUrl: string;           // Firebase Storage download URL for the thesis file
  // Examiner identity (no Firebase UID)
  examinerName: string;
  examinerEmail: string;
  examinerInstitution: string;
  examinerLanguage: 'he' | 'en';
  // Token lifecycle
  status: ExaminerTokenStatus;
  createdAt: Timestamp | null;
  expiresAt: Timestamp | null;  // default: createdAt + 30 days
  acceptedAt?: Timestamp | null;
  declinedAt?: Timestamp | null;
  submittedAt?: Timestamp | null;
  declineReason?: string;
  // Access log
  accessLog: Array<{
    action: 'opened' | 'downloaded_thesis' | 'accepted' | 'declined' | 'submitted_opinion';
    timestamp: Timestamp | null;
  }>;
  // Per-milestone configured grading rubric, denormalized at creation time
  // (see server/src/services/examinerAccess.ts's createExternalExaminerAccess)
  // since an external examiner can't read the milestones collection
  // directly. Absent/empty means the opinion form falls back to its
  // hardcoded OPINION_CRITERIA.
  gradingComponents?: Array<{
    key: string;
    labelHe: string;
    labelEn: string;
    maxScore: number;
    weight: number;
    hasComment: boolean;
    visibleToStudent: boolean;
  }>;
  // Opinion data (filled when status === 'submitted')
  opinion?: Record<string, unknown>;
  opinionVisible: boolean;     // whether student can see the opinion
  opinionAnonymous: boolean;   // whether student can see the name
}

/**
 * Build the deep-link URL for an external examiner.
 * In Expo / React Native use Linking.openURL() or expo-router href.
 */
export function buildExaminerLink(token: string, baseUrl = 'https://your-app.example.com'): string {
  return `${baseUrl}/examiner-access?token=${token}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// VALID ENUM VALUES (keep in sync with Firestore and i18n)
// ─────────────────────────────────────────────────────────────────────────────

export const VALID_ROLES: AppRole[] = [
  'student',
  'supervisor',
  'secondary_supervisor',
  'coordinator',
  'faculty_admin',
  'program_head',
  'administrative_secretary',
  'grad_school_head',
  'internal_examiner',
  'system_admin',
];

export const VALID_FACULTY_IDS: FacultyId[] = [
  'sciences',
  'electrical',
  'industrial',
  'learning_tech',
  'medical_tech',
  'design',
  'data_science',
  'all',
];

export function isValidRole(value: unknown): value is AppRole {
  return typeof value === 'string' && VALID_ROLES.includes(value as AppRole);
}

export function isValidFacultyId(value: unknown): value is FacultyId {
  return typeof value === 'string' && VALID_FACULTY_IDS.includes(value as FacultyId);
}
// ─── Quick-create documents for other roles (copy as needed) ─────────────────
const ADMIN_USER_DOC = {
  // ── Identity ────────────────────────────────────────────────────────────────
  uid:             "PASTE_YOUR_UID_HERE",     // must match the document ID
  email:           "admin@hit.ac.il",         // your admin email
  displayName:     "מנהל מערכת",              // shown in the top bar
  displayNameHe:   "מנהל מערכת",
  displayNameEn:   "System Admin",

  // ── Role — THIS is what the Firestore rules check ───────────────────────────
  role:            "system_admin",            // ← critical field
  roles:           ["system_admin", "faculty_admin", "supervisor", "coordinator"],          // ← for easier role checks in the app (can be empty if you handle "system_admin" as a special case)
  // ── Faculty — system_admin bypasses faculty checks, but field must exist ────
  facultyId:       "all",                     // "all" = cross-faculty access

  // ── Additional roles (empty for admin) ─────────────────────────────────────
  additionalRoles: [],

  // ── Student fields — null for staff ─────────────────────────────────────────
  degreeType:      null,
  yearOfStudy:     null,
  studentId:       null,
  major:           null,

  // ── Flags ───────────────────────────────────────────────────────────────────
  isActive:        true,
  profileComplete: true,
  hasActiveProject:false,
  isEligibleForProcess: false,

  // ── Preferences ─────────────────────────────────────────────────────────────
  language:        "he",                      // "he" or "en"

  // ── Push notifications ───────────────────────────────────────────────────────
  expoPushToken:   null,                      // filled automatically on login

  // ── Timestamps (set these in Firestore console as Timestamp type) ────────────
  // createdAt:  <Timestamp>
  // lastLoginAt:<Timestamp>
};

const SUPERVISOR_DOC = {
  uid:             "SUPERVISOR_UID",
  email:           "supervisor@hit.ac.il",
  displayName:     "ד\"ר ישראל ישראלי",
  displayNameHe:   "ד\"ר ישראל ישראלי",
  displayNameEn:   "Dr. Israel Israeli",
  role:            "supervisor",             // ← must be exactly this string
  facultyId:       "sciences",                // must match a key in FACULTY_COLORS
  additionalRoles: [],
  degreeType:      null,
  yearOfStudy:     null,
  studentId:       null,
  major:           null,
  isActive:        true,
  profileComplete: true,
  hasActiveProject:false,
  language:        "he",
  expoPushToken:   null,
};

const COORDINATOR_DOC = {
  uid:             "COORDINATOR_UID",
  email:           "coordinator@hit.ac.il",
  displayName:     "רכז הפרויקטים",
  displayNameHe:   "רכז הפרויקטים",
  displayNameEn:   "Project Coordinator",
  role:            "coordinator",            // ← must be exactly this string
  facultyId:       "sciences",
  additionalRoles: [],
  degreeType:      null,
  yearOfStudy:     null,
  studentId:       null,
  major:           null,
  isActive:        true,
  profileComplete: true,
  hasActiveProject:false,
  language:        "he",
  expoPushToken:   null,
};

const STUDENT_DOC = {
  uid:             "STUDENT_UID",
  email:           "student@hit.ac.il",
  displayName:     "דוד כהן",
  displayNameHe:   "דוד כהן",
  displayNameEn:   "David Cohen",
  role:            "student",                // ← must be exactly this string
  facultyId:       "sciences",
  additionalRoles: [],
  degreeType:      "bachelors",              // "bachelors" or "masters"
  yearOfStudy:     3,                        // number: 1, 2, 3, or 4
  major:           "computer_science",         // degree-program slug — must match a key in PROGRAM_DEGREE_LENGTHS
  studentId:       null,                     // "123456789" if you add it later
  isActive:        true,
  profileComplete: true,
  hasActiveProject:false,
  language:        "he",
  expoPushToken:   null,
};

const EXAMINER_DOC = {
  uid:             "EXAMINER_UID",
  email:           "examiner@hit.ac.il",
  displayName:     "פרופ' שרה לוי",
  displayNameHe:   "פרופ' שרה לוי",
  displayNameEn:   "Prof. Sarah Levi",
  role:            "examiner",               // ← must be exactly this string
  facultyId:       "sciences",
  additionalRoles: [],
  degreeType:      null,
  yearOfStudy:     null,
  studentId:       null,
  major:           null,
  isActive:        true,
  profileComplete: true,
  hasActiveProject:false,
  language:        "he",
  expoPushToken:   null,
  dates:[],
};


// ─── Script: run this from your login page DEV button ────────────────────────
// Replace the existing "Create Test User" button logic with this.
// It creates the correct doc for whoever is currently logged in.


/*
export async function createAdminUserDoc() {
  const user = auth.currentUser;
  if (!user) {
    console.warn('⚠️ Log in first, then run this.');
    return;
  }

  await setDoc(doc(db, 'users', user.uid), {
    uid:             user.uid,
    email:           user.email,
    displayName:     user.displayName ?? 'System Admin',
    displayNameHe:   'מנהל מערכת',
    displayNameEn:   'System Admin',

    // ── THE CRITICAL FIELD ──
    role:            'system_admin',

    facultyId:       'all',
    additionalRoles: [],
    degreeType:      null,
    yearOfStudy:     null,
    studentId:       null,
    major:           null,
    isActive:        true,
    profileComplete: true,
    hasActiveProject:false,
    language:        'he',
    expoPushToken:   null,
    createdAt:       serverTimestamp(),
    lastLoginAt:     serverTimestamp(),
  });

  console.log('✅ Admin doc created for UID:', user.uid);
}

export async function createCoordinator() {
  try {
    // 1. Create auth account
    const cred = await createUserWithEmailAndPassword(
      auth,
      'coordinator@hit.ac.il',
      '12345678'
    );

    const uid = cred.user.uid;

    // 2. Create Firestore user document
    await setDoc(doc(db, 'users', uid), {
      uid,
      email: 'coord@hit.ac.il',

      displayName: 'רכז הפרויקטים',
      displayNameHe: 'רכז הפרויקטים',
      displayNameEn: 'Project Coordinator',

      role: 'coordinator',

      facultyId: 'sciences',

      additionalRoles: [],

      degreeType: null,
      yearOfStudy: null,
      studentId: null,
      major: null,

      isActive: true,
      profileComplete: true,
      hasActiveProject: false,

      language: 'he',
      expoPushToken: null,

      createdAt: serverTimestamp(),
    });

    console.log('✅ Coordinator created');
  } catch (e) {
    console.error('❌ Error creating coordinator:', e);
  }
};

export async function createExaminer() {
  try {
    // 1. Create auth account
    const cred = await createUserWithEmailAndPassword(
      auth,
      'examiner2@hit.ac.il',
      '12345678'
    );

    const uid = cred.user.uid;

    // 2. Create Firestore user document
    await setDoc(doc(db, 'users', uid), {
      uid : uid,
      email: 'examiner2@hit.ac.il',

      displayName: 'בוחן2',
      displayNameHe: 'בוחן2',
      displayNameEn: 'examiner2',

      role: 'examiner',

      facultyId: 'all',

      additionalRoles: [],
      degreeType:      null,
      yearOfStudy:     null,
      studentId:       null,
      major:           null,
      isActive:        true,
      profileComplete: true,
      hasActiveProject:false,
      language:        "he",
      expoPushToken:   null,
      dates:[],

      createdAt: serverTimestamp(),
    });

    console.log('✅ Coordinator created');
  } catch (e) {
    console.error('❌ Error creating coordinator:', e);
  }
};
*/
// ─── Valid role values (copy exactly — case sensitive) ────────────────────────
//
//   "student"
//   "supervisor"
//   "examiner"
//   "coordinator"
//   "faculty_admin"
//   "system_admin"
//
// ─── Valid facultyId values ───────────────────────────────────────────────────
//
//   "sciences"
//   "electrical"
//   "industrial"
//   "learning_tech"
//   "medical_tech"
//   "design"
//   "data_science"
//   "all"              ← default for CROSS_FACULTY_ROLES (system_admin, administrative coordinator); optional/explicit for grad_school_head, internal_examiner
//
// ─────────────────────────────────────────────────────────────────────────────