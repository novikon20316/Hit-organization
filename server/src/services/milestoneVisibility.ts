// src/services/milestoneVisibility.ts
//
// Field-scoping for milestone docs returned to non-staff callers — first
// added for the data_science three-rubric/staff-record feature
// (workflowTemplates.ts's finalGradeComponents/staffRecordMode), whose new
// fields include content that must stay examiner-only (the manager's
// requirement: examiner-submitted forms are visible only to the examiner who
// filled them, never the student or supervisor). Before this, milestone docs
// were always returned to callers as a raw `{ id, ...data }` spread with no
// field filtering at all (see getMilestonesByQuery in milestoneController.ts)
// — harmless while the only scored fields were supervisor/examiner1/
// examiner2Score (all already visible to the student via finalGrade), but
// examinerEvaluations (full per-examiner rubric breakdowns) must not leak the
// same way.

const STAFF_ROLES_WITH_FULL_VISIBILITY = [
  'administrative_secretary',
  'grad_school_head',
  'program_head',
  'faculty_admin',
  'system_admin',
];

/** Strips examiner-only content from a milestone doc unless the viewer is
 *  one of its assigned examiners (in which case only THEIR OWN entry is
 *  kept — co-examiners' scores/comments are none of their business either)
 *  or a coordinator/admin-tier role (full visibility, per "all forms
 *  accessible to the coordinator"). Everyone else (the student, the
 *  supervisor) never sees `examinerEvaluations` at all — matches "examiner
 *  forms are accessible only to the examiner who submits them." */
export function sanitizeMilestoneForViewer(
  data: Record<string, any>,
  viewerUid: string,
  viewerRoles: string[],
): Record<string, any> {
  if (viewerRoles.some((r) => STAFF_ROLES_WITH_FULL_VISIBILITY.includes(r))) {
    return data;
  }

  if (!data.examinerEvaluations) return data;

  const examinerIds: string[] = data.examinerIds ?? [];
  if (examinerIds.includes(viewerUid)) {
    return {
      ...data,
      examinerEvaluations: { [viewerUid]: data.examinerEvaluations[viewerUid] },
    };
  }

  const { examinerEvaluations, ...rest } = data;
  return rest;
}
