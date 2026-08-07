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
//
// Extended for the generic chain-routing model (milestoneRouting.ts) —
// chain-driven milestones (e.g. the examiner-only 'poster' milestone) store
// per-stage grades under `stageScores`, keyed by stage id, not under
// `examinerEvaluations`. A stage whose configured role is 'examiner' gets the
// exact same treatment: visible only to whichever examiner actually graded
// that stage (`stageScores[id].gradedBy`), never to the student or
// supervisor. Stages for every other role (supervisor, coordinator, ...) stay
// fully visible to everyone, matching "forms tied to the supervisor are
// visible to the student and the supervisor too."

const STAFF_ROLES_WITH_FULL_VISIBILITY = [
  'administrative_secretary',
  'grad_school_head',
  'program_head',
  'faculty_admin',
  'system_admin',
];

/** Strips examiner-only content from a milestone doc unless the viewer is
 *  the examiner who actually submitted it, or a coordinator/admin-tier role
 *  (full visibility, per "all forms accessible to the coordinator"). Covers
 *  both the three-rubric defense's `examinerEvaluations` (co-examiners'
 *  entries redacted, keeping only the viewer's own) and any chain-driven
 *  milestone's `stageScores` for an examiner-role stage (redacted entirely
 *  from non-graders). Everyone else (the student, the supervisor) never sees
 *  either field's examiner-only content — matches "examiner forms are
 *  accessible only to the examiner who submits them." */
export function sanitizeMilestoneForViewer(
  data: Record<string, any>,
  viewerUid: string,
  viewerRoles: string[],
): Record<string, any> {
  if (viewerRoles.some((r) => STAFF_ROLES_WITH_FULL_VISIBILITY.includes(r))) {
    return data;
  }

  let result = data;

  if (result.examinerEvaluations) {
    const examinerIds: string[] = result.examinerIds ?? [];
    if (examinerIds.includes(viewerUid)) {
      result = { ...result, examinerEvaluations: { [viewerUid]: result.examinerEvaluations[viewerUid] } };
    } else {
      const { examinerEvaluations, ...rest } = result;
      result = rest;
    }
  }

  if (result.stageScores && Array.isArray(result.routing)) {
    const roleByStageId = new Map<string, string>(
      (result.routing as Array<{ id: string; role: string }>).map((stage) => [stage.id, stage.role])
    );
    const filteredStageScores: Record<string, any> = {};
    for (const [stageId, entry] of Object.entries(result.stageScores as Record<string, any>)) {
      const isExaminerStage = roleByStageId.get(stageId) === 'examiner';
      if (isExaminerStage && entry?.gradedBy !== viewerUid) continue;
      filteredStageScores[stageId] = entry;
    }
    result = { ...result, stageScores: filteredStageScores };
  }

  return result;
}
