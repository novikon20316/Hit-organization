// src/services/notificationLinks.ts
//
// Turns the same (recipient role, notification type, targetScreen) the app
// already resolves in-app (see notificationTargets.ts, web/app/notifications/
// types.ts's computeNotifTargetRoute, mobile/app/(tabs)/notifications.tsx's
// own copy) into an actual clickable URL for channels OUTSIDE the app —
// email, SMS, WhatsApp — where there's no in-app router to hand a bare route
// string to. Two links are generated: a web one (always works) and a mobile
// deep link (opens the app to that screen if it's installed; does nothing if
// it isn't — no fallback to a store page, by design).
//
// The three route tables (this one, web's, mobile's) are kept in sync BY
// HAND — same duplication convention this codebase already uses between the
// web and mobile clients' own copies of TARGET_SCREEN_ROUTE, extended here
// because generating a real link server-side needs the same lookup a third
// time.

import { WEBSITE_URL } from '../config/links.js';

// Mirrors web/app/notifications/types.ts's TARGET_SCREEN_ROUTE exactly.
const WEB_TARGET_SCREEN_ROUTE: Record<string, string> = {
  coordinator_pending: '/coordinator/home?tab=pending',
  coordinator_signoffs: '/coordinator/home?tab=signoffs',
  coordinator_deadlines: '/coordinator/home?tab=deadlines',
  coordinator_defense: '/coordinator/home?tab=defense',
  coordinator_archived: '/coordinator/home?tab=archived',
  admin_coordinator_overrides: '/administrative_coordinator/dashboard?tab=overrides',
  supervisor_applications: '/supervisor/dashboard?tab=applications',
  supervisor_signoffs: '/supervisor/dashboard?tab=signoffs',
  supervisor_projects: '/supervisor/dashboard?tab=projects',
  faculty_admin_projects: '/faculty_admin/dashboard?tab=projects',
  faculty_admin_signoffs: '/faculty_admin/dashboard?tab=signoffs',
  faculty_admin_deadlines: '/faculty_admin/dashboard?tab=deadlines',
  program_head_approvals: '/program_head/dashboard?tab=approvals',
  grad_school_head_approvals: '/grad_school_head/dashboard?tab=approvals',
  grad_school_head_examiners: '/grad_school_head/dashboard?tab=examiners',
  examiner_defenses: '/examinor/home?tab=defenses',
  examiner_schedule: '/examinor/home?tab=schedule',
  admin_panel_milestones: '/admin/panel?tab=milestones',
  admin_panel_signoffs: '/admin/panel?tab=signoffs',
  admin_panel_feedback: '/admin/panel?tab=feedback',
  committees: '/committees',
  login_security: '/login-security',
};

// Mirrors mobile/app/(tabs)/notifications.tsx's TARGET_SCREEN_ROUTE exactly
// (which itself differs from web's in a few spots — see that file's comment).
const MOBILE_TARGET_SCREEN_ROUTE: Record<string, string> = {
  coordinator_pending: '/coordinator/home?tab=pending',
  coordinator_signoffs: '/coordinator/home?tab=signoffs',
  coordinator_deadlines: '/coordinator/home?tab=deadlines',
  coordinator_defense: '/coordinator/home?tab=defense',
  coordinator_archived: '/coordinator/home?tab=archived',
  admin_coordinator_overrides: '/administrative_coordinator/administrative_coordinator_dashboard?tab=overrides',
  supervisor_applications: '/supervisor/dashboard?tab=applications',
  supervisor_signoffs: '/supervisor/dashboard?tab=signoffs',
  supervisor_projects: '/supervisor/dashboard?tab=projects',
  faculty_admin_projects: '/faculty_admin/dashboard?tab=projects',
  faculty_admin_signoffs: '/faculty_admin/dashboard?tab=signoffs',
  faculty_admin_deadlines: '/faculty_admin/dashboard?tab=deadlines',
  program_head_approvals: '/program_head/program_head_dashboard?tab=approvals',
  grad_school_head_approvals: '/grad_school_head/grad_school_head_dashboard?tab=approvals',
  grad_school_head_examiners: '/grad_school_head/grad_school_head_dashboard?tab=examiners',
  examiner_defenses: '/examinor/home?tab=projects',
  examiner_schedule: '/examinor/home?tab=schedule',
  admin_panel_milestones: '/admin/panel?tab=milestones',
  admin_panel_signoffs: '/admin/panel?tab=signoffs',
  admin_panel_feedback: '/admin/panel?tab=feedback',
  login_security: '/login-security',
};

// Mirrors web/lib/roles.ts's getHomeRoute.
function webHomeRoute(role: string | null | undefined): string {
  switch (role) {
    case 'student':                  return '/student/home';
    case 'supervisor':
    case 'secondary_supervisor':     return '/supervisor/dashboard';
    case 'coordinator':               return '/coordinator/home';
    case 'faculty_admin':             return '/faculty_admin/dashboard';
    case 'program_head':              return '/program_head/dashboard';
    case 'administrative_secretary':  return '/administrative_coordinator/dashboard';
    case 'grad_school_head':          return '/grad_school_head/dashboard';
    case 'internal_examiner':         return '/examinor/home';
    case 'system_admin':              return '/admin/panel';
    default:                          return '/login';
  }
}

// Mirrors mobile/app/(tabs)/notifications.tsx's roleHomeRoute.
function mobileHomeRoute(role: string | null | undefined): string {
  switch (role) {
    case 'student':                  return '/student/home';
    case 'supervisor':
    case 'secondary_supervisor':     return '/supervisor/dashboard';
    case 'internal_examiner':        return '/examinor/home';
    case 'coordinator':              return '/coordinator/home';
    case 'faculty_admin':            return '/faculty_admin/dashboard';
    case 'program_head':             return '/program_head/program_head_dashboard';
    case 'administrative_secretary': return '/administrative_coordinator/administrative_coordinator_dashboard';
    case 'grad_school_head':         return '/grad_school_head/grad_school_head_dashboard';
    case 'system_admin':             return '/admin/overview';
    default:                         return '';
  }
}

// Mirrors both clients' computeNotifTargetRoute type-based fallback switch —
// used only when targetScreen is unset (older notifications, or a type this
// file's tables don't cover).
const STUDENT_DIRECTED_TYPES = new Set([
  'project_published', 'application_approved', 'application_declined_by_student',
  'application_rejected', 'meeting_requested', 'milestone_graded',
  'milestone_deadline_7d', 'milestone_deadline_1d', 'milestone_overdue',
]);
const ANY_ROLE_TYPES = new Set(['application_received', 'account_created', 'milestone_submitted']);

function fallbackRoute(type: string, role: string | null | undefined, homeRoute: (r: string | null | undefined) => string): string {
  if (STUDENT_DIRECTED_TYPES.has(type)) return homeRoute('student');
  if (ANY_ROLE_TYPES.has(type)) return homeRoute(role);
  return '';
}

export interface NotificationLinks {
  webUrl: string | null;
  appUrl: string | null;
}

// mobile/app.json's "scheme" — a plain custom-scheme deep link, not a
// universal/App-Link URL: it opens the app straight to that screen when
// installed, and simply fails silently (no store-page fallback) when it
// isn't — matching what was asked for.
const MOBILE_SCHEME = 'mobile://';

/** Resolves both links for one outbound notification. Returns null for
 *  either link when there's genuinely no destination to send someone to
 *  (an unrecognized type with no targetScreen) — callers should omit that
 *  link line entirely rather than send a dead/home-only link. */
export function resolveNotificationLinks(
  role: string | null | undefined,
  type: string,
  targetScreen: string | null | undefined,
): NotificationLinks {
  const webPath = (targetScreen && WEB_TARGET_SCREEN_ROUTE[targetScreen])
    || fallbackRoute(type, role, webHomeRoute);
  const mobilePath = (targetScreen && MOBILE_TARGET_SCREEN_ROUTE[targetScreen])
    || fallbackRoute(type, role, mobileHomeRoute);

  return {
    webUrl: webPath ? `${WEBSITE_URL}${webPath}` : null,
    appUrl: mobilePath ? `${MOBILE_SCHEME}${mobilePath.replace(/^\//, '')}` : null,
  };
}
