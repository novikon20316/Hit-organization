// src/services/permissions.ts
//
// Mirror of mobile/firebase/roles.ts's Permission type and PERMISSION_MAP —
// keep in sync (same convention as VALID_ROLES in userImportExport.ts).
//
// NOT YET WIRED into any route. A review of the 5 candidate endpoints
// (updateUserRoleAdmin, coordinatorApproveMilestone/RejectMilestone,
// updateMilestoneByCoordinator, approveTemplateProposal/rejectTemplateProposal)
// found every one diverges from this map — the map is broader than what's
// actually enforced today on all of them (e.g. updateUserRoleAdmin is
// system_admin-only server-side, since it can elevate a user to ANY role
// including system_admin itself, but this map's `manage_users` also lists
// faculty_admin). Adopting the map as-is would silently broaden access on
// several privileged endpoints — a product/security decision, not a safe
// mechanical refactor. Left unwired pending that decision; this file exists
// so the mismatch is documented in one place and the utility is ready to use
// once the scope question is resolved.

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
  | 'view_own_messages';

export const PERMISSION_MAP: Record<Permission, string[]> = {
  create_project:               ['supervisor', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  publish_project:              ['supervisor', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  apply_to_project:             ['student'],
  view_all_projects:            ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'],
  view_own_project:             ['student', 'supervisor', 'secondary_supervisor'],
  view_faculty_projects:        ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'internal_examiner'],

  open_process_file:            ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  close_process_file:           ['coordinator', 'faculty_admin', 'program_head', 'grad_school_head', 'system_admin'],
  view_process_file:            ['supervisor', 'secondary_supervisor', 'coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'internal_examiner', 'system_admin'],
  edit_process_status:          ['coordinator', 'faculty_admin', 'program_head', 'system_admin'],
  pause_process_clock:          ['coordinator', 'faculty_admin', 'program_head', 'grad_school_head', 'system_admin'],

  submit_milestone:             ['student'],
  grade_milestone:              ['supervisor', 'secondary_supervisor', 'internal_examiner'],
  approve_milestone_coordinator:['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  approve_milestone_grad_school:['grad_school_head', 'system_admin'],
  reopen_milestone:             ['coordinator', 'faculty_admin', 'program_head', 'system_admin'],
  override_deadline:            ['coordinator', 'faculty_admin', 'program_head', 'system_admin'],

  submit_proposal:              ['student'],
  approve_proposal_supervisor:  ['supervisor', 'secondary_supervisor'],
  approve_proposal_faculty:     ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary'],
  approve_proposal_grad_school: ['grad_school_head', 'system_admin'],

  assign_supervisor:            ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  approve_supervisor:           ['grad_school_head', 'system_admin'],
  propose_supervisor:           ['student', 'supervisor'],

  propose_examiners:            ['supervisor', 'secondary_supervisor'],
  approve_examiners_faculty:    ['coordinator', 'faculty_admin', 'program_head'],
  approve_examiners_grad_school:['grad_school_head', 'system_admin'],
  send_examiner_invitation:     ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  view_examiner_database:       ['supervisor', 'secondary_supervisor', 'coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'internal_examiner', 'system_admin'],
  edit_examiner_database:       ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'],

  enter_grade:                  ['supervisor', 'secondary_supervisor', 'internal_examiner'],
  approve_grade_coordinator:    ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary'],
  approve_grade_grad_school:    ['grad_school_head', 'system_admin'],
  change_grade_after_approval:  ['grad_school_head', 'system_admin'],
  transfer_grade_to_maklol:     ['coordinator', 'faculty_admin', 'grad_school_head', 'system_admin'],
  view_all_grades:              ['coordinator', 'faculty_admin', 'program_head', 'grad_school_head', 'system_admin'],

  view_templates:               ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'],
  create_template:              ['faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  edit_template:                ['faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  approve_template_grad_school: ['grad_school_head', 'system_admin'],

  view_faculty_reports:         ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'],
  view_cross_faculty_reports:   ['grad_school_head', 'system_admin'],
  export_reports:               ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'],

  manage_users:                 ['faculty_admin', 'system_admin'],
  manage_system_config:         ['system_admin'],
  view_audit_log:               ['coordinator', 'faculty_admin', 'program_head', 'grad_school_head', 'system_admin'],
  toggle_maintenance:           ['system_admin'],

  send_message:                 ['student', 'supervisor', 'secondary_supervisor', 'coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'internal_examiner', 'system_admin'],
  view_own_messages:            ['student', 'supervisor', 'secondary_supervisor', 'coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'internal_examiner', 'system_admin'],
};

/** Check if a role has a given permission. system_admin bypasses all checks. */
export function hasPermission(role: string | undefined, permission: Permission): boolean {
  if (!role) return false;
  if (role === 'system_admin') return true;
  return PERMISSION_MAP[permission]?.includes(role) ?? false;
}
