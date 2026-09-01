// lib/permissions.ts
// Ported from mobile/constants/permissions.ts — system_admin's per-user
// granular permission model (Edit User flow) and a coordinator's own
// operational scope. Persisted via apiClient.updateUserRoleAdmin (see
// app/admin/panel/PermissionsEditorModal.tsx and
// app/admin/panel/CoordinatorScopesModal.tsx) and enforced server-side by
// server/src/services/scopeAuthorization.ts.
//
// Elastic scope-rule model: an account can hold any number of ScopeRules,
// each narrowing a Faculty -> optional Major -> optional Degree Level ->
// optional Process Type (thesis/project, master's only), with its own
// View/Action permission grants — rather than one fixed grid shape. This is
// what lets one account be, say, "view-only across all of Sciences" while
// another is "edit grades for Computer Science master's thesis-track
// students only". The same descriptor shape (ScopeDescriptor) is reused by
// CoordinatorScope for a coordinator's own operational scope, without the
// view/actions grants (a coordinator already has full standard actions
// within whatever scope they're assigned).
//
// Major-based scoping depends on every user's `major` field actually being
// one of HIT_FACULTIES's canonical slugs (lib/faculties.ts).

import { HIT_FACULTIES, stripDegreePrefix } from './faculties';
import { VALID_FACULTY_IDS, type FacultyId } from './roles';
import type { Lang } from './i18n';

export type DegreeLevel = 'bachelors' | 'masters';

export const DEGREE_LEVELS: { key: DegreeLevel; label: Record<Lang, string> }[] = [
  { key: 'bachelors', label: { he: 'תואר ראשון', en: "Bachelor's" } },
  { key: 'masters', label: { he: 'תואר שני', en: "Master's" } },
];

// Web already has one canonical faculty-id list (VALID_FACULTY_IDS,
// lib/roles.ts, including 'all') — reused here rather than duplicating
// mobile's separate PERMISSION_FACULTY_IDS constant.
export const PERMISSION_FACULTY_IDS: FacultyId[] = VALID_FACULTY_IDS;
export type PermissionFacultyId = FacultyId;

// Only meaningful when degreeLevel === 'masters' — bachelor's has no
// thesis/project split (see ProcessType in server/src/services/workflowTemplates.ts,
// which only splits msc_thesis vs msc_project; bsc_project never splits).
export type ProcessType = 'thesis' | 'project';

export const PROCESS_TYPES: { key: ProcessType; label: Record<Lang, string> }[] = [
  { key: 'thesis', label: { he: 'מסלול תזה', en: 'Thesis track' } },
  { key: 'project', label: { he: 'מסלול פרויקט', en: 'Project track' } },
];

export type ViewType = 'users' | 'projects' | 'grades' | 'milestones' | 'reports';

export const VIEW_TYPES: { key: ViewType; label: Record<Lang, string> }[] = [
  { key: 'users', label: { he: 'צפייה במשתמשים', en: 'View users' } },
  { key: 'projects', label: { he: 'צפייה בפרויקטים', en: 'View projects' } },
  { key: 'grades', label: { he: 'צפייה בציונים', en: 'View grades' } },
  { key: 'milestones', label: { he: 'צפייה באבני דרך / תיק תהליך', en: 'View milestones / process files' } },
  { key: 'reports', label: { he: 'צפייה בדוחות וסטטיסטיקות', en: 'View reports & statistics' } },
];

export type ActionType =
  | 'add_users'
  | 'edit_users'
  | 'delete_users'
  | 'add_projects'
  | 'edit_projects'
  | 'delete_projects'
  | 'edit_grades'
  | 'approve_grades'
  | 'approve_milestones'
  | 'assign_supervisor_examiner'
  | 'approve_templates'
  | 'all_actions';

export const ACTION_TYPES: { key: ActionType; label: Record<Lang, string> }[] = [
  { key: 'add_users', label: { he: 'הוספת משתמשים', en: 'Add users' } },
  { key: 'edit_users', label: { he: 'עריכת משתמשים', en: 'Edit users' } },
  { key: 'delete_users', label: { he: 'מחיקת משתמשים', en: 'Delete users' } },
  { key: 'add_projects', label: { he: 'הוספת פרויקטים', en: 'Add projects' } },
  { key: 'edit_projects', label: { he: 'עריכת פרויקטים', en: 'Edit projects' } },
  { key: 'delete_projects', label: { he: 'מחיקת פרויקטים', en: 'Delete projects' } },
  { key: 'edit_grades', label: { he: 'עריכת ציונים', en: 'Edit grades' } },
  { key: 'approve_grades', label: { he: 'אישור ציונים', en: 'Approve grades' } },
  { key: 'approve_milestones', label: { he: 'אישור אבני דרך', en: 'Approve milestones' } },
  { key: 'assign_supervisor_examiner', label: { he: 'שיוך מנחה / בוחן', en: 'Assign supervisor / examiner' } },
  { key: 'approve_templates', label: { he: 'אישור תבניות תהליך', en: 'Approve workflow templates' } },
  { key: 'all_actions', label: { he: 'כל הפעולות (הוספה, עריכה, מחיקה)', en: 'All actions (add, edit, delete)' } },
];

/**
 * One narrowed slice of the org: Faculty (required) -> optional Major ->
 * optional Degree Level -> optional Process Type (master's only). Shared
 * shape used by both system_admin's granular permission rules (which add
 * view/actions grants on top, see ScopeRule below) and a coordinator's own
 * operational scope assignment (CoordinatorScope below, no grants needed).
 */
export interface ScopeDescriptor {
  facultyId: PermissionFacultyId;
  /** Major slug (see lib/faculties.ts) — omitted = every major in the faculty. */
  major?: string;
  /** Omitted = both degree levels. */
  degreeLevel?: DegreeLevel;
  /** Only meaningful when degreeLevel === 'masters'. Omitted = both tracks. */
  processType?: ProcessType;
}

/** A ScopeDescriptor + which permissions it grants. */
export interface ScopeRule extends ScopeDescriptor {
  id: string;
  view: ViewType[];
  actions: ActionType[];
}

/** A ScopeDescriptor defining which population a coordinator operates on — no
 *  separate permission grants, since coordinators already get full standard
 *  actions within their scope. */
export interface CoordinatorScope extends ScopeDescriptor {
  id: string;
}

export function newScopeId(): string {
  return `scope_${Math.random().toString(36).slice(2, 10)}`;
}

/** Which degree levels a given faculty actually offers (e.g. data_science is
 *  master's-only, medical_tech is bachelor's-only) — 'all' (cross-faculty)
 *  offers both. */
export function degreeLevelsForFaculty(facultyId: string): DegreeLevel[] {
  if (facultyId === 'all') return ['bachelors', 'masters'];
  const faculty = HIT_FACULTIES.find((f) => f.key === facultyId);
  if (!faculty) return ['bachelors', 'masters'];
  const levels = new Set(faculty.programs.map((p) => p.level));
  return (['bachelors', 'masters'] as const).filter((l) => levels.has(l));
}

/** Every distinct major slug available for a given faculty, deduped (a slug
 *  can repeat across bachelor's/master's rows — label's degree prefix is
 *  stripped since the surviving entry no longer represents just one level). */
export function majorsForFaculty(facultyId: string): { slug: string; label: Record<Lang, string> }[] {
  const faculty = HIT_FACULTIES.find((f) => f.key === facultyId);
  if (!faculty) return [];
  const seen = new Set<string>();
  const out: { slug: string; label: Record<Lang, string> }[] = [];
  for (const program of faculty.programs) {
    if (seen.has(program.slug)) continue;
    seen.add(program.slug);
    out.push({
      slug: program.slug,
      label: { he: stripDegreePrefix(program.label.he), en: stripDegreePrefix(program.label.en) },
    });
  }
  return out;
}

/** "Faculty, Major, Major" display line for a staff member — the faculty/
 *  department name plus, for a supervisor/secondary_supervisor restricted to
 *  specific majors (assignedMajors), each of those majors' names, comma-
 *  separated. assignedMajors empty/unset (unrestricted, or a role that has no
 *  such concept) means the line is just the faculty name. */
export function staffFacultyMajorLabel(
  facultyId: string,
  assignedMajors: string[] | undefined,
  lang: Lang,
  facultyLabelFn: (facultyId: string) => string
): string {
  const parts = [facultyLabelFn(facultyId)];
  for (const slug of assignedMajors ?? []) {
    const match = majorsForFaculty(facultyId).find((m) => m.slug === slug);
    parts.push(match?.label[lang] ?? slug);
  }
  return parts.join(', ');
}

/** The scope-relevant fields of a resource (e.g. a workflow template) being
 *  checked against a user's ScopeRule grants. Client-side mirror of
 *  server/src/services/scopeAuthorization.ts's ResourceScope/scopeMatches/
 *  hasActionGrant — needed here (not just server-side) so the UI can decide
 *  whether to even show an action button for a grant-holding user, not just
 *  whether the server would accept the request. Kept hand-synced with the
 *  server copy, same convention as the rest of this file. */
export interface ResourceScope {
  facultyId: string;
  major?: string;
  degreeLevel?: DegreeLevel;
  processType?: ProcessType;
}

/** Does `descriptor` (a granted scope) cover `resource` (the thing being acted on)? */
export function scopeMatches(descriptor: ScopeDescriptor, resource: ResourceScope): boolean {
  if (descriptor.facultyId !== 'all' && descriptor.facultyId !== resource.facultyId) return false;
  if (descriptor.major && resource.major && descriptor.major !== resource.major) return false;
  if (descriptor.degreeLevel && resource.degreeLevel && descriptor.degreeLevel !== resource.degreeLevel) return false;
  if (descriptor.degreeLevel === 'masters' && descriptor.processType && resource.processType && descriptor.processType !== resource.processType) {
    return false;
  }
  return true;
}

/** True if `userData` holds a permissionRule granting `action` (or 'all_actions') over `resource`. system_admin always true. */
export function hasActionGrant(
  userData: { role?: string; roles?: string[]; permissionRules?: ScopeRule[] } | null | undefined,
  action: ActionType,
  resource: ResourceScope
): boolean {
  if (!userData) return false;
  if (userData.role === 'system_admin' || userData.roles?.includes('system_admin')) return true;
  return (userData.permissionRules ?? []).some(
    (rule) => scopeMatches(rule, resource) && (rule.actions.includes(action) || rule.actions.includes('all_actions'))
  );
}

/** Human-readable one-line summary of a scope, e.g. "Sciences · Computer Science · Master's · Thesis track". */
export function scopeLabel(scope: ScopeDescriptor, lang: Lang, facultyLabelFn: (facultyId: string) => string): string {
  const parts: string[] = [facultyLabelFn(scope.facultyId)];

  if (scope.major) {
    const match = majorsForFaculty(scope.facultyId).find((m) => m.slug === scope.major);
    parts.push(match?.label[lang] ?? scope.major);
  }
  if (scope.degreeLevel) {
    parts.push(DEGREE_LEVELS.find((d) => d.key === scope.degreeLevel)?.label[lang] ?? scope.degreeLevel);
  }
  if (scope.degreeLevel === 'masters' && scope.processType) {
    parts.push(PROCESS_TYPES.find((p) => p.key === scope.processType)?.label[lang] ?? scope.processType);
  }
  return parts.join(' · ');
}
