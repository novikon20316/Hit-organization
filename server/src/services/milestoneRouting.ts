// src/services/milestoneRouting.ts
//
// Runtime enforcement helpers for the configurable milestone approval/
// rejection chain (see workflowTemplates.ts's ChainStage/MilestoneRoutingSpec
// for the data model — added in a prior pass, but not read anywhere until
// this one). Transactions themselves stay in the controllers that own them
// (projectController.ts, coordinatorController.ts) — this file holds the
// pure/query pieces those transactions call into.

import type { AuthenticatedRequest } from '../middleware/auth.js';
import { resolveStaffForScope, type ResourceScope } from './scopeAuthorization.js';
import type { ChainStage } from './workflowTemplates.js';

type AuthUser = NonNullable<AuthenticatedRequest['user']>;

/** A milestone is chain-driven when it carries a `routing` snapshot AND
 *  isn't a defense milestone — defense keeps running its own separate
 *  examiner-grading/date-scheduling engine untouched (an explicit scope
 *  decision: dual fixed-slot examiner grading, a 3-status scheduling state
 *  machine, and a non-configurable final-grade sign-off don't map onto a
 *  simple linear chain). Legacy milestones (created before this feature, or
 *  whose template predates it) have no `routing` at all and fall through to
 *  the exact original hardcoded logic wherever this is checked. */
export function isChainDriven(milestone: { routing?: ChainStage[]; type?: string }): boolean {
  return !!milestone.routing && milestone.routing.length > 0 && milestone.type !== 'defense';
}

/** A defense milestone created after the examiner1Score/examiner2Score ->
 *  examinerScores generalization (see projectController.ts's
 *  submitMilestoneGrade). Legacy defense milestones (no `examinerScores`
 *  field at all) fall through to the original positional dispatch, forever —
 *  same no-migration precedent as isChainDriven above. */
export function isIdentityKeyedDefense(milestone: { type?: string; examinerScores?: unknown }): boolean {
  return milestone.type === 'defense' && milestone.examinerScores !== undefined;
}

/** The coarse legacy `status` value a chain position maps to — reused
 *  (rather than introducing new vocabulary) so the ~20 existing dashboard/
 *  report/notification read sites keyed on today's status strings keep
 *  working unmodified, regardless of which configured role/action actually
 *  produced the transition. Used both for forward progression and for
 *  landing on a mid-chain reject target. */
export function statusForStage(stage: ChainStage): 'submitted' | 'supervisor_graded' {
  return stage.action === 'grade' ? 'submitted' : 'supervisor_graded';
}

/** Whether `user` is one of the concrete uids authorized to act at `stage`
 *  for this resource — wraps resolveStaffForScope (which already folds in
 *  system_admin) rather than reimplementing the role/scope resolution. */
export async function authorizeStageActor(
  user: AuthUser | undefined,
  stage: ChainStage,
  resource: ResourceScope,
  projectSupervisorIds: string[],
): Promise<boolean> {
  if (!user) return false;
  const uids = await resolveStaffForScope(stage.role, resource, projectSupervisorIds);
  return uids.includes(user.uid);
}

/** Combines every stage's recorded score into the milestone's final grade —
 *  a simple arithmetic mean, each grade-stage counting equally. Distinct from
 *  gradingComponents' intra-stage weighting (how one grader splits their own
 *  score across rubric components), which is untouched. Distinct also from
 *  gradeEngine.ts's computeWeightedFinalGrade, which stays exactly as-is for
 *  legacy/defense milestones (fixed supervisor+examiner1+examiner2 shape). */
export function computeChainFinalGrade(stageScores: Record<string, { score: number }>): number {
  const scores = Object.values(stageScores).map((s) => s.score);
  if (scores.length === 0) return 0;
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}
