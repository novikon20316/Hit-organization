// firebase/notificationScreens.ts
//
// Client-safe mirror of server/src/services/notificationTargets.ts's
// targetScreenFor/screensForRole (same mirror as web/lib/notificationScreens.ts)
// — the mobile notification listeners (src/context/NotificationsContext.tsx,
// app/(tabs)/notifications.tsx) talk to Firestore directly rather than
// through the API, so they need their own copy of "which targetScreen keys
// belong to this role" to filter a multi-role user's feed down to whichever
// role they're currently viewing the app as (see contexts/ActiveRoleContext.tsx's
// setActiveRole). Keep in sync with the server copy and its web mirror by
// hand — same convention as firebase/roles.ts's own header comment.

type NotificationTaskKind =
  | 'milestone_action' | 'signoff' | 'deadline_examiner' | 'defense'
  | 'archived_erasure' | 'applications' | 'grade_published';

function targetScreenFor(role: string | undefined | null, kind: NotificationTaskKind): string | null {
  switch (kind) {
    case 'milestone_action':
      switch (role) {
        case 'coordinator':
        case 'administrative_secretary': return 'coordinator_pending';
        case 'supervisor':
        case 'secondary_supervisor':     return 'supervisor_projects';
        case 'faculty_admin':            return 'faculty_admin_projects';
        case 'program_head':             return 'program_head_approvals';
        case 'grad_school_head':         return 'grad_school_head_approvals';
        case 'internal_examiner':        return 'examiner_defenses';
        case 'system_admin':             return 'admin_panel_milestones';
        default: return null;
      }
    case 'signoff':
      switch (role) {
        case 'coordinator':              return 'coordinator_signoffs';
        case 'administrative_secretary': return 'admin_coordinator_overrides';
        case 'supervisor':
        case 'secondary_supervisor':     return 'supervisor_signoffs';
        case 'faculty_admin':            return 'faculty_admin_signoffs';
        case 'program_head':             return 'program_head_approvals';
        case 'grad_school_head':         return 'grad_school_head_approvals';
        case 'system_admin':             return 'admin_panel_signoffs';
        default: return null;
      }
    case 'deadline_examiner':
      switch (role) {
        case 'coordinator':
        case 'administrative_secretary': return 'coordinator_deadlines';
        case 'faculty_admin':            return 'faculty_admin_deadlines';
        case 'grad_school_head':         return 'grad_school_head_examiners';
        case 'program_head':             return 'program_head_approvals';
        case 'internal_examiner':        return 'examiner_defenses';
        case 'system_admin':             return 'coordinator_deadlines';
        default: return null;
      }
    case 'defense':
      switch (role) {
        case 'coordinator':
        case 'administrative_secretary':
        case 'system_admin':             return 'coordinator_defense';
        case 'internal_examiner':        return 'examiner_schedule';
        case 'supervisor':
        case 'secondary_supervisor':     return 'supervisor_projects';
        default: return null;
      }
    case 'archived_erasure':
      return role === 'coordinator' ? 'coordinator_archived' : null;
    case 'applications':
      return role === 'supervisor' || role === 'secondary_supervisor' ? 'supervisor_applications' : null;
    case 'grade_published':
      switch (role) {
        case 'student':                  return 'student_grades';
        case 'supervisor':
        case 'secondary_supervisor':     return 'supervisor_projects';
        default: return null;
      }
    default:
      return null;
  }
}

const ALL_TASK_KINDS: NotificationTaskKind[] = [
  'milestone_action', 'signoff', 'deadline_examiner', 'defense',
  'archived_erasure', 'applications', 'grade_published',
];

/** Every targetScreen key `role` can ever be notified into — see this
 *  file's header comment. */
export function screensForRole(role: string | undefined | null): string[] {
  const screens = new Set<string>();
  for (const kind of ALL_TASK_KINDS) {
    const screen = targetScreenFor(role, kind);
    if (screen) screens.add(screen);
  }
  return [...screens];
}

/** True if a notification with this targetScreen should be shown while
 *  viewing the app as `role` — a notification with no targetScreen at all
 *  (generic/account-level: 2FA, broadcast, new_message) is always shown
 *  regardless of the active role. */
export function notifMatchesRole(targetScreen: string | null | undefined, role: string | undefined): boolean {
  if (!targetScreen) return true;
  if (!role) return true;
  return screensForRole(role).includes(targetScreen);
}
