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
import { getHomeRoute } from './roles';
import { screensForRole } from './notificationScreens';
import type { SidebarSection, SidebarNavItem, SidebarTheme } from '@/components/dashboard/SidebarShell';
import { ADMIN_NAV_SECTIONS, ADMIN_QUICK_ACTIONS } from '@/app/admin/navConfig';
import { buildCoordinatorNavSections, COORDINATOR_QUICK_ACTIONS } from '@/app/coordinator/navSections';
import { ADMINISTRATIVE_COORDINATOR_NAV_SECTIONS } from '@/app/administrative_coordinator/navSections';
import { FACULTY_ADMIN_NAV_SECTIONS, FACULTY_ADMIN_QUICK_ACTIONS } from '@/app/faculty_admin/navSections';
import { GRAD_SCHOOL_HEAD_NAV_SECTIONS, GRAD_SCHOOL_HEAD_QUICK_ACTIONS } from '@/app/grad_school_head/navSections';
import { buildProgramHeadNavSections } from '@/app/program_head/navSections';
import { DIVISION_HEAD_NAV_SECTIONS } from '@/app/division_head/navSections';
import { DEAN_NAV_SECTIONS } from '@/app/dean/navSections';
import { SUPERVISOR_NAV_SECTIONS } from '@/app/supervisor/navSections';
import { EXAMINOR_NAV_SECTIONS } from '@/app/examinor/navSections';
import { STUDENT_NAV_SECTIONS } from '@/app/student/navSections';

// A multi-role user (e.g. a grad_school_head who's also a supervisor and an
// internal_examiner) used to never land on their other roles' dashboards at
// all: resolveActiveRole always picked their highest-ranked role, and each
// role's own tabs (grading a submitted milestone, submitting examiner
// availability dates, etc.) only exist under that role's own chrome. This
// appends one "Switch Role" sidebar section listing every OTHER role the
// user holds — clicking one calls setActiveRole (persisted — see
// AuthContext.tsx) and navigates to that role's own home route, swapping the
// ENTIRE sidebar (brand, color, and menu) to that role's, not just the page
// content. The role that got swapped OUT of (including the user's own
// main/highest-ranked role, if that's not the one currently active) shows up
// the same way, so switching back is just picking it again. Being ordinary
// SidebarSection items (not a bolted-on banner), they're picked up by
// OnboardingTour the same as every other tab.
const ROLE_SWITCH_META: Record<AppRole, { icon: string; label: { he: string; en: string } }> = {
  student:                  { icon: '🏠', label: { he: 'סטודנט', en: 'Student' } },
  supervisor:               { icon: '📋', label: { he: 'מנחה', en: 'Supervisor' } },
  secondary_supervisor:     { icon: '📋', label: { he: 'מנחה משני', en: 'Secondary Supervisor' } },
  coordinator:              { icon: '📊', label: { he: 'רכז', en: 'Coordinator' } },
  faculty_admin:            { icon: '⚙️', label: { he: 'ראש מנהל פקולטה', en: 'Faculty Admin' } },
  program_head:             { icon: '🎓', label: { he: 'ראש תוכנית', en: 'Program Head' } },
  division_head:            { icon: '🧭', label: { he: 'ראש תחום', en: 'Head of Division' } },
  dean:                     { icon: '🏅', label: { he: 'דיקן הפקולטה', en: 'Dean of the Faculty' } },
  administrative_secretary: { icon: '📊', label: { he: 'רכזת אדמיניסטרטיבית', en: 'Administrative Coordinator' } },
  grad_school_head:         { icon: '🏛️', label: { he: 'ראש בית ספר ללימודי מוסמכים', en: 'Grad School Head' } },
  internal_examiner:        { icon: '✏️', label: { he: 'בוחן פנימי', en: 'Internal Examiner' } },
  system_admin:             { icon: '🛡️', label: { he: 'מנהל מערכת', en: 'System Admin' } },
};

function buildRoleSwitcherSection(
  role: AppRole,
  roles: AppRole[],
  mainRole: AppRole | undefined,
  setActiveRole: ((role: AppRole) => void) | undefined
): SidebarSection | null {
  const otherRoles = roles.filter((r) => r !== role);
  if (otherRoles.length === 0) return null;

  const items: SidebarNavItem[] = otherRoles.map((r) => {
    const meta = ROLE_SWITCH_META[r];
    return {
      key: `switch_role_${r}`,
      icon: meta.icon,
      href: getHomeRoute(r),
      label: meta.label,
      description: {
        he: `החלף לתצוגת ${meta.label.he} — התפריט והנתונים יוצגו בהתאם לתפקיד זה.`,
        en: `Switch to your ${meta.label.en} view — the menu and data will show that role's own.`,
      },
      isActive: () => false,
      onSelect: () => setActiveRole?.(r),
      badgeTargetScreens: screensForRole(r),
      ...(r === mainRole ? { badge: { he: 'התפקיד הראשי', en: 'Main role' } } : {}),
    };
  });

  return { title: { he: 'החלפת תפקיד', en: 'Switch Role' }, items };
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
 *  role set — used both for program_head's role-gated "My Projects" item
 *  and to build the "Switch Role" section below. `setActiveRole` and
 *  `mainRole` come straight from useAuth(); omit only for callers that
 *  can't offer switching (there are none today, but the section simply
 *  won't be clickable/marked without them). */
export function getChromeForRole(
  role: AppRole | undefined,
  roles: AppRole[],
  setActiveRole?: (role: AppRole) => void,
  mainRole?: AppRole
): RoleChrome | null {
  const chrome = getBaseChromeForRole(role, roles);
  if (!chrome || !role) return chrome;
  const switcherSection = buildRoleSwitcherSection(role, roles, mainRole, setActiveRole);
  return switcherSection ? { ...chrome, sections: [...chrome.sections, switcherSection] } : chrome;
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
    case 'division_head':
      return {
        brand: { name: 'HIT', subtitle: { he: 'פורטל ראש תחום', en: 'Head of Division Portal' } },
        sections: DIVISION_HEAD_NAV_SECTIONS,
        theme: { mode: 'accent' },
      };
    case 'dean':
      return {
        brand: { name: 'HIT', subtitle: { he: 'פורטל דיקן הפקולטה', en: 'Dean Portal' } },
        sections: DEAN_NAV_SECTIONS,
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
