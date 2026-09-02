// src/services/gradeEngine.ts
//
// Computes a real weighted final grade once every assigned grader
// (supervisor + 0-2 examiners) has submitted a score, and stubs the
// "transfer to Michlol" step once a grad-school-head has approved it.
// Previously: no live code path ever computed or wrote `finalGrade` at all
// (the one place that tried, in examinor/home.tsx, was dead/commented-out).

export interface GradeWeights {
  supervisorWeight: number;
  examiner1Weight: number;
  examiner2Weight: number;
}

// Matches the defaults the (now-removed, never-wired) Facultytemplatemanager.tsx
// milestone editor used to offer — kept as the fallback whenever no
// gradeWeights are configured on the milestone itself.
const DEFAULT_WEIGHTS_2_EXAMINERS: GradeWeights = { supervisorWeight: 0.4, examiner1Weight: 0.3, examiner2Weight: 0.3 };
const DEFAULT_WEIGHTS_1_EXAMINER: GradeWeights  = { supervisorWeight: 0.5, examiner1Weight: 0.5, examiner2Weight: 0 };
const DEFAULT_WEIGHTS_0_EXAMINERS: GradeWeights = { supervisorWeight: 1, examiner1Weight: 0, examiner2Weight: 0 };

export function computeWeightedFinalGrade(
  scores: { supervisorScore: number; examiner1Score?: number | null; examiner2Score?: number | null },
  examinerCount: number,
  configuredWeights?: GradeWeights | null,
): number {
  const weights = configuredWeights ?? (
    examinerCount >= 2 ? DEFAULT_WEIGHTS_2_EXAMINERS :
    examinerCount === 1 ? DEFAULT_WEIGHTS_1_EXAMINER :
    DEFAULT_WEIGHTS_0_EXAMINERS
  );

  const weighted =
    scores.supervisorScore * weights.supervisorWeight +
    (scores.examiner1Score ?? 0) * weights.examiner1Weight +
    (scores.examiner2Score ?? 0) * weights.examiner2Weight;

  return Math.round(weighted);
}

// Shared read helper for the ~5 sites that display an examiner's score by
// position (idx into examinerIds) — resolves from whichever shape the
// milestone actually has, so those sites don't need their own branching.
export function examinerScoreFor(
  milestone: {
    examinerScores?: Record<string, { score: number }>;
    examiner1Score?: number | null;
    examiner2Score?: number | null;
  },
  uid: string,
  positionalIndex: number,
): number | null {
  if (milestone.examinerScores) return milestone.examinerScores[uid]?.score ?? null;
  return positionalIndex === 0 ? (milestone.examiner1Score ?? null) : (milestone.examiner2Score ?? null);
}

// Identity-keyed sibling of the above, for defense milestones created after
// the examiner1Score/examiner2Score -> examinerScores generalization (see
// projectController.ts's isIdentityKeyedDefense). Legacy milestones keep
// using computeWeightedFinalGrade above, untouched. Within a given examiner
// count the old per-slot weights were always equal (0.3/0.3, 0.5/0.5, 0/0) —
// there's no mechanism to configure them asymmetrically since a coordinator
// can't know in advance which physical examiner becomes "#1" — so a single
// shared per-examiner weight is a lossless restructuring, not a behavior change.
export interface IdentityGradeWeights {
  supervisorWeight: number;
  examinerWeight: number;
}

// Historical defaults, preserved exactly — this codebase never supported a
// panel of any other size until the examiner-count generalization, so 0/1/2
// are the only counts with a real behavioral precedent to keep.
const DEFAULT_IDENTITY_WEIGHTS_BY_COUNT: Record<number, IdentityGradeWeights> = {
  0: { supervisorWeight: 1,   examinerWeight: 0 },
  1: { supervisorWeight: 0.5, examinerWeight: 0.5 },
  2: { supervisorWeight: 0.4, examinerWeight: 0.3 },
};

/** Default weights for any examiner count with no historical precedent
 *  (3+) — same 40% supervisor / 60% split-evenly-among-examiners ratio as
 *  the 2-examiner default, generalized to any count, rather than a flat
 *  constant that wouldn't sum to 1 for anything but exactly 2. In practice
 *  this rarely matters: AssignExaminersModal always collects and persists
 *  explicit gradeWeights at assignment time regardless of count — this is
 *  only the fallback for a milestone that was never explicitly configured. */
function defaultIdentityWeightsFor(examinerCount: number): IdentityGradeWeights {
  const known = DEFAULT_IDENTITY_WEIGHTS_BY_COUNT[examinerCount];
  if (known) return known;
  return examinerCount > 0
    ? { supervisorWeight: 0.4, examinerWeight: 0.6 / examinerCount }
    : { supervisorWeight: 1, examinerWeight: 0 };
}

export function computeIdentityWeightedFinalGrade(
  supervisorScore: number,
  examinerScores: Record<string, { score: number }>,
  configuredWeights?: IdentityGradeWeights | null,
): number {
  const entries = Object.values(examinerScores);
  const weights = configuredWeights ?? defaultIdentityWeightsFor(entries.length);

  const examinerTotal = entries.reduce(
    (sum, entry) => sum + entry.score * weights.examinerWeight,
    0,
  );

  return Math.round(supervisorScore * weights.supervisorWeight + examinerTotal);
}

/** Final grade for an examiner-only milestone (see workflowTemplates.ts's
 *  examinerOnlyGrading) — no supervisor score exists at all, so unlike
 *  computeIdentityWeightedFinalGrade this is simply every submitted
 *  examiner's score weighted equally. */
export function computeExaminerOnlyGrade(examinerScores: Record<string, { score: number }>): number {
  const scores = Object.values(examinerScores).map((e) => e.score);
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
}

// Group-project defense grades (research_proposal/progress_report/final_report
// stay one score for the whole group — the spec only calls out a personal
// component at the oral defense, e.g. "ציון אישי במבחן בעל פה"). How much a
// student's own individual score shifts them away from the shared group grade.
export const DEFAULT_INDIVIDUAL_WEIGHT = 0.2;

/**
 * Per spec: "לצד הרכיבים הקבוצתיים... ציון אישי... לכן הציון הסופי של חברי
 * אותה קבוצה יכול להיות שונה, אף שהתוצר המרכזי משותף" — group members share
 * the milestone's group-level grade but can still end up with different final
 * grades once their individual component is factored in. Students with no
 * individual score recorded simply keep the shared group grade (also covers
 * the individual-project / single-student case — nothing changes for them).
 */
export function computeFinalGradeByStudent(
  studentIds: string[],
  groupFinalGrade: number,
  individualScores: Record<string, number> | null | undefined,
  individualWeight: number = DEFAULT_INDIVIDUAL_WEIGHT,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const studentId of studentIds) {
    const individual = individualScores?.[studentId];
    result[studentId] = individual == null
      ? groupFinalGrade
      : Math.round(groupFinalGrade * (1 - individualWeight) + individual * individualWeight);
  }
  return result;
}

/**
 * A project's OVERALL final grade, weighted across ALL of its milestones by
 * each milestone TYPE's percentOfFinalGrade on the project's workflow
 * template (see workflowTemplates.ts's WorkflowMilestoneSpec) — not just the
 * defense milestone's own grade, which is all that existed before this.
 *
 * Missing percentOfFinalGrade (a template proposed before this feature
 * shipped) defaults to 100 for `defense`, 0 for every other type —
 * reproducing today's implicit defense-only behavior with no data
 * migration needed for already-approved templates.
 *
 * Returns null — "not final yet," never a partial/misleading number — until
 * every NONZERO-weighted milestone has a `finalGrade`. A milestone weighted
 * at 0% never blocks this, even if it's still ungraded (e.g. a pure
 * checkpoint with no share of the grade).
 */
export function computeProjectFinalGrade(
  templateMilestones: { type: string; percentOfFinalGrade?: number }[],
  actualMilestones: { type: string; finalGrade?: number | null }[],
): number | null {
  let weightedSum = 0;
  for (const tm of templateMilestones) {
    const pct = tm.percentOfFinalGrade ?? (tm.type === 'defense' ? 100 : 0);
    if (pct === 0) continue;
    const actual = actualMilestones.find((m) => m.type === tm.type);
    if (actual?.finalGrade == null) return null;
    // A milestone's own finalGrade can legitimately exceed 100 (e.g. a
    // rubric whose GradingComponentSpec weights sum above 100 — see
    // workflowTemplates.ts's GradingComponentSpec) — used here AS-IS, so a
    // strong performance on that milestone can offset a weaker one
    // elsewhere, exactly like any other weighted component. Only the
    // combined project-wide total below is ever capped.
    weightedSum += actual.finalGrade * (pct / 100);
  }
  // The one and only cap: the project's OVERALL grade never exceeds 100,
  // regardless of how any single milestone's own (possibly >100) score
  // contributed to weightedSum above. A no-op for every template whose
  // milestones all cap at 100, which is every one but the above.
  return Math.min(100, Math.round(weightedSum));
}

/**
 * Stub — no live Michlol integration exists in this codebase (confirmed: zero
 * references to "Michlol"/"מכלול" anywhere outside orphaned i18n strings and
 * an unused permission key). Logs the attempt and returns a result the caller
 * can persist, so the approval workflow reaches a real "done" state instead
 * of dead-ending after grad-school-head approval with nowhere left to go.
 * Replace the console.log with a real API call once Michlol access exists.
 */
export async function transferGradeToMichlol(params: {
  milestoneId: string;
  projectId: string;
  studentIds: string[];
  finalGrade: number;
}): Promise<{ transferred: boolean; transferredAt: string }> {
  console.log(
    `[Michlol stub] Would transfer final grade ${params.finalGrade} for milestone ${params.milestoneId} ` +
    `(project ${params.projectId}, students: ${params.studentIds.join(', ') || 'none'}) — ` +
    `no live Michlol integration is configured yet.`,
  );
  return { transferred: true, transferredAt: new Date().toISOString() };
}
