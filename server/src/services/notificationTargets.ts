// src/services/notificationTargets.ts
//
// Maps a (recipient role, task kind) pair to a semantic "targetScreen" key,
// stored on the notification doc at creation time (see notify.ts's
// notifyUser and the various raw db.collection('notifications').add calls
// across the codebase). Each client (web/app/notifications/types.ts,
// mobile/app/(tabs)/notifications.tsx) resolves that key into its own
// actual dashboard URL — web and mobile don't always spell the same tab
// the same way (e.g. the internal examiner's "defenses" tab is called
// 'defenses' on web but 'projects' on mobile), so the semantic key stays
// platform-agnostic and each client owns its own lookup table.
//
// Call sites declare WHAT KIND of task this is and WHO it's for; this file
// is the only place that knows which literal screen that combination maps
// to, so it's the only place that needs updating if a dashboard's tab
// layout changes.

export type NotificationTaskKind =
  // A milestone needs this role's review/grading/approval right now.
  | 'milestone_action'
  // A second-tier sign-off is pending (examiner list or final grade).
  | 'signoff'
  // Deadline override / examiner escalation / exceptional-action queue.
  | 'deadline_examiner'
  // Defense scheduling — date submission needed, or a date conflict to resolve.
  | 'defense'
  // Project erasure request queue (coordinator-only workflow).
  | 'archived_erasure'
  // Supervisor's incoming project applications.
  | 'applications'
  // A grade was just published/approved for this student.
  | 'grade_published';

/**
 * Resolves (role, kind) to a semantic screen key, or null if this role has
 * no defined destination for that kind (the caller should then leave
 * targetScreen unset — the client falls back to that role's plain
 * dashboard home).
 */
export function targetScreenFor(role: string | undefined | null, kind: NotificationTaskKind): string | null {
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
        // No dedicated system_admin screen for this narrower workflow —
        // they're already permitted onto /coordinator/home (see its own
        // COORDINATOR_ROLES guard), so land them on the same place the
        // primary recipient uses instead of a generic admin fallback.
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
      return role === 'student' ? 'student_grades' : null;
    default:
      return null;
  }
}
