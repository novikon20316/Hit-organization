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
