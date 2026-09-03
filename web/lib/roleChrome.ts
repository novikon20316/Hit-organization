// lib/roleChrome.ts
//
// Single source of truth for "which sidebar (brand, menu items, color
// theme) does a signed-in user see" — keyed ONLY by their activeRole (see
// roles.ts's resolveActiveRole: always the single highest-ranked role a
// multi-role user holds, never the route they happen to be on).
//
// Before this file existed, each /<role>/layout.tsx decided its own chrome
// mostly by ASSUMING "whoever reaches this route is this role" — true for a
// single-role user, but wrong for a multi-role one. A user who is e.g. both
// coordinator (their real, highest-ranked role) and supervisor (a lower-
// ranked role they also hold, valid in a different faculty) would see the
// coordinator sidebar on /coordinator/home but, the moment they followed a
// link into /supervisor/dashboard (anywhere they hold that role, whether
// or not it's their most senior one), the ENTIRE sidebar — brand, color,
// and menu — silently swapped to supervisor's smaller one, making it look
// like their access had changed. A few routes (administrative_coordinator,
// program_head, workflow-templates) had already grown ad hoc `if (activeRole
// === ...)` branches to patch exactly this for their own visitors; this
// file generalizes that fix into one lookup every /<role>/layout.tsx shares,
// so the chrome is consistent everywhere rather than patched route-by-route.
//
// IMPORTANT: this only controls DISPLAY (which sidebar chrome wraps the
// page). It has no bearing on authorization — a project/milestone/faculty a
// user isn't actually a coordinator (or supervisor, etc.) for is still
// gated the same as always, by useRequireRole (route access) and the
// backend's own scope checks (permissionScopes.ts / scopeAuthorization.ts /
// coordinatorScopes) — none of that is touched here. Seeing the coordinator
// sidebar while looking at a project you only supervise doesn't grant
// coordinator actions on it; the page content and its API calls are exactly
// as scoped as they were before this file existed.

import type { AppRole } from './roles';
import type { SidebarSection, SidebarTheme } from '@/components/dashboard/SidebarShell';
import { ADMIN_NAV_SECTIONS, ADMIN_QUICK_ACTIONS } from '@/app/admin/navConfig';
import { buildCoordinatorNavSections, COORDINATOR_QUICK_ACTIONS } from '@/app/coordinator/navSections';
import { ADMINISTRATIVE_COORDINATOR_NAV_SECTIONS } from '@/app/administrative_coordinator/navSections';
import { FACULTY_ADMIN_NAV_SECTIONS, FACULTY_ADMIN_QUICK_ACTIONS } from '@/app/faculty_admin/navSections';
import { GRAD_SCHOOL_HEAD_NAV_SECTIONS, GRAD_SCHOOL_HEAD_QUICK_ACTIONS } from '@/app/grad_school_head/navSections';
import { buildProgramHeadNavSections } from '@/app/program_head/navSections';
import { SUPERVISOR_NAV_SECTIONS } from '@/app/supervisor/navSections';
import { EXAMINOR_NAV_SECTIONS } from '@/app/examinor/navSections';
import { STUDENT_NAV_SECTIONS } from '@/app/student/navSections';

// A multi-role user whose PRIMARY role outranks internal_examiner (i.e.
// everyone except student — see roles.ts's ROLE_RANK, where internal_examiner
// sits second-to-last) never lands on the examiner sidebar/dashboard at all:
// resolveActiveRole always picks their highest-ranked role, and the examiner
// tabs (including "submit the dates you're available for") only exist under
// that role's own chrome. Without this, such a user has no in-app way to even
// discover that they hold the role, let alone reach /examinor/home — the
// route itself is still reachable (useRequireRole checks the full roles[]
// array), but nothing links to it.
//
// This appends one extra sidebar link, present on every dashboard for anyone
// who holds internal_examiner as a secondary role, pointing at their real
// examiner assignments. Being an ordinary SidebarSection item (not a bolted-on
// banner), it's picked up by OnboardingTour the same as every other tab —
// see SidebarShell's `<OnboardingTour sections={sections} .../>` — so a
// first-login walkthrough teaches these users it exists, not just this one
// session's dashboard.
function withExaminerAssignmentsLink(sections: SidebarSection[], role: AppRole, roles: AppRole[]): SidebarSection[] {
  if (role === 'internal_examiner' || !roles.includes('internal_examiner')) return sections;
  const examinerSection: SidebarSection = {
    title: { he: 'תפקיד נוסף', en: 'Additional Role' },
    items: [
      {
        key: 'examiner_assignments',
        icon: '🎓',
        href: '/examinor/home',
        label: { he: 'בוחן פנימי', en: 'Internal Examiner' },
        description: {
          he: 'יש לך גם תפקיד בוחן פנימי. כאן תמצא/י את ההגנות שהוקצו לך לבחינה, ואת המקום להגיש בו את התאריכים שבהם את/ה פנוי/ה.',
          en: "You also hold the internal examiner role. Find the defenses assigned to you to examine here, and submit the dates you're available for.",
        },
        isActive: (pathname) => pathname.startsWith('/examinor'),
      },
    ],
  };
  return [...sections, examinerSection];
}

export interface RoleChrome {
  brand: { name: string; subtitle: { he: string; en: string } };
  sections: SidebarSection[];
  quickActions?: SidebarSection;
  theme: SidebarTheme;
}

/** Chrome for `role`, or null if `role` is undefined/unrecognized (e.g.
 *  activeRole not resolved yet on first load — caller should render
 *  without a sidebar rather than guess one). `roles` is the user's full
 *  role set, needed only for program_head's role-gated "My Projects" item. */
export function getChromeForRole(role: AppRole | undefined, roles: AppRole[]): RoleChrome | null {
  const chrome = getBaseChromeForRole(role, roles);
  if (!chrome || !role) return chrome;
  return { ...chrome, sections: withExaminerAssignmentsLink(chrome.sections, role, roles) };
}

function getBaseChromeForRole(role: AppRole | undefined, roles: AppRole[]): RoleChrome | null {
  switch (role) {
    case 'system_admin':
      return {
        brand: { name: 'HIT', subtitle: { he: 'פורטל מנהל מערכת', en: 'System Admin Portal' } },
        sections: ADMIN_NAV_SECTIONS,
        quickActions: ADMIN_QUICK_ACTIONS,
        theme: { mode: 'tokens', tokenPrefix: 'admin' },
      };
    case 'grad_school_head':
      return {
        brand: { name: 'HIT', subtitle: { he: 'פורטל ראש בית ספר ללימודי מוסמכים', en: 'Grad School Head Portal' } },
        sections: GRAD_SCHOOL_HEAD_NAV_SECTIONS,
        quickActions: GRAD_SCHOOL_HEAD_QUICK_ACTIONS,
        theme: { mode: 'accent' },
      };
    case 'faculty_admin':
      return {
        brand: { name: 'HIT', subtitle: { he: 'פורטל ראש מנהל פקולטה', en: 'Faculty Admin Portal' } },
        sections: FACULTY_ADMIN_NAV_SECTIONS,
        quickActions: FACULTY_ADMIN_QUICK_ACTIONS,
        theme: { mode: 'accent' },
      };
    case 'program_head':
      return {
        brand: { name: 'HIT', subtitle: { he: 'פורטל ראש תוכנית', en: 'Program Head Portal' } },
        sections: buildProgramHeadNavSections(roles),
        theme: { mode: 'accent' },
      };
    case 'coordinator':
      return {
        brand: { name: 'HIT', subtitle: { he: 'פורטל רכז', en: 'Coordinator Portal' } },
        sections: buildCoordinatorNavSections('coordinator'),
        quickActions: COORDINATOR_QUICK_ACTIONS,
        theme: { mode: 'accent' },
      };
    case 'administrative_secretary':
      return {
        brand: { name: 'HIT', subtitle: { he: 'פורטל רכזת אדמיניסטרטיבית', en: 'Administrative Coordinator Portal' } },
        sections: ADMINISTRATIVE_COORDINATOR_NAV_SECTIONS,
        theme: { mode: 'accent' },
      };
    case 'supervisor':
    case 'secondary_supervisor':
      return {
        brand: { name: 'HIT', subtitle: { he: 'פורטל מנחה', en: 'Supervisor Portal' } },
        sections: SUPERVISOR_NAV_SECTIONS,
        theme: { mode: 'accent' },
      };
    case 'internal_examiner':
      return {
        brand: { name: 'HIT', subtitle: { he: 'פורטל בוחן פנימי', en: 'Examiner Portal' } },
        sections: EXAMINOR_NAV_SECTIONS,
        theme: { mode: 'accent' },
      };
    case 'student':
      return {
        brand: { name: 'HIT', subtitle: { he: 'פורטל סטודנט', en: 'Student Portal' } },
        sections: STUDENT_NAV_SECTIONS,
        theme: { mode: 'accent' },
      };
    default:
      return null;
  }
}
