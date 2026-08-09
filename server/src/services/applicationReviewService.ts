// src/services/applicationReviewService.ts
//
// A second, distinct AI pass on a student's application — separate from
// cvScreeningService.ts's CV-vs-prerequisites/skills fit verdict (that one
// stays exactly as-is, still shown to the supervisor on its own). This one
// runs a set of independent pass/fail CHECKS against the application and
// rolls them up into a single recommendation for the supervisor: approve,
// suggest a meeting, or recommend rejecting.
//
// Currently one check is implemented (grades vs. the project's prerequisites,
// read off the student's uploaded transcript/gradesheet — cvScreeningService
// never looks at the transcript at all, only the CV). Two more checks are
// coming later — each is just another function matching CheckFn's shape,
// added to the CHECKS array in reviewApplication; computeRecommendation
// already works generically over however many checks are in the array.
//
// Recommendation rule (decided by the department, not inferred): 0 broken
// checks -> approve, exactly 1 -> meeting, 2+ -> reject. A check that
// couldn't run at all (no transcript uploaded, unreadable PDF, AI
// unavailable) reports passed: null and is excluded from that count — a
// technical failure isn't evidence against the student, unlike a check that
// actually ran and found a real problem (e.g. a prerequisite course missing
// from the transcript entirely, which does count as broken).

import pdfParse from 'pdf-parse';
import { askClaude } from './anthropicClient.js';
import { formatPrerequisite, type PrerequisiteSpec } from './prerequisites.js';

export interface ApplicationCheckResult {
  id: string;
  labelHe: string;
  labelEn: string;
  /** true = passed, false = broken, null = unable to assess (excluded from
   *  the broken-rule tally). */
  passed: boolean | null;
  reasoning: string;
  /** {subject, grade} pairs this check read directly off a real document
   *  (e.g. the transcript) — rolled up by reviewApplication and used by
   *  applicationController.ts to auto-populate the student's
   *  completedCourses. Absent/empty when the check found nothing usable. */
  extractedGrades?: { subject: string; grade: number }[];
}

export type ApplicationRecommendation = 'approve' | 'meeting' | 'reject';

export interface ApplicationReviewResult {
  checks: ApplicationCheckResult[];
  recommendation: ApplicationRecommendation;
  generatedAt: string;
  extractedGrades: { subject: string; grade: number }[];
}

const DOWNLOAD_TIMEOUT_MS = 20000;
const MAX_TRANSCRIPT_TEXT_CHARS = 8000;

const PREREQ_CHECK_ID = 'prerequisite_grades';

const PREREQ_SYSTEM_PROMPT = `You review a student's academic transcript against a project's prerequisite courses. Each prerequisite may list a minimum grade in parentheses (e.g. "Computer Science (min grade: 80)") — if none is listed, the course just needs to have been completed, any grade.
For each prerequisite, find the matching course on the transcript (names may not match exactly — use your judgment) and read its grade. A prerequisite is "met" if the course is found AND (no minimum grade was listed, OR the grade found is at or above it). If the course is not found on the transcript at all, it is NOT met.
Respond with ONLY a JSON object, no other text: {"perPrerequisite": [{"subject": "<the prerequisite's own subject text>", "found": true|false, "grade": <number|null>, "met": true|false}], "reasoning": "<2-3 sentences for the supervisor>"}`;

/** Check #1 — grades vs. the project's prerequisites, read off the
 *  transcript/gradesheet uploaded with the application. */
async function checkPrerequisiteGrades(params: {
  transcriptUrl: string;
  prerequisites: PrerequisiteSpec[];
}): Promise<ApplicationCheckResult> {
  const base = { id: PREREQ_CHECK_ID, labelHe: 'ציונים בקורסי דרישת קדם', labelEn: 'Grades vs. prerequisites' };

  if (params.prerequisites.length === 0) {
    return { ...base, passed: true, reasoning: 'This project has no prerequisites listed.' };
  }
  if (!params.transcriptUrl) {
    return { ...base, passed: null, reasoning: 'No transcript/gradesheet was uploaded with this application.' };
  }
  if (!params.transcriptUrl.toLowerCase().split('?')[0]?.endsWith('.pdf')) {
    return { ...base, passed: null, reasoning: 'Transcript file is not a PDF — could not be read.' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(params.transcriptUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) return { ...base, passed: null, reasoning: 'Could not download the transcript file.' };

    const buffer = Buffer.from(await response.arrayBuffer());
    const parsed = await pdfParse(buffer);
    const transcriptText = parsed.text?.trim();
    if (!transcriptText) return { ...base, passed: null, reasoning: 'Could not extract any text from the transcript PDF.' };

    const prompt = [
      `Project prerequisites: ${params.prerequisites.map((p) => formatPrerequisite(p)).join(', ')}`,
      '',
      'Transcript text:',
      transcriptText.slice(0, MAX_TRANSCRIPT_TEXT_CHARS),
    ].join('\n');

    const raw = await askClaude({ system: PREREQ_SYSTEM_PROMPT, prompt, maxTokens: 500 });
    if (!raw) return { ...base, passed: null, reasoning: 'AI review unavailable.' };

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { ...base, passed: null, reasoning: 'AI review returned an unexpected response.' };
    const data = JSON.parse(match[0]) as {
      perPrerequisite?: Array<{ subject: string; found: boolean; grade: number | null; met: boolean }>;
      reasoning?: string;
    };
    if (!Array.isArray(data.perPrerequisite) || data.perPrerequisite.length === 0) {
      return { ...base, passed: null, reasoning: 'AI review returned an unexpected response.' };
    }

    // Computed from the per-prerequisite breakdown, not trusted as a
    // separate top-level field from the model — one source of truth.
    const allMet = data.perPrerequisite.every((p) => p.met === true);
    const extractedGrades = data.perPrerequisite
      .filter((p) => p.found && typeof p.grade === 'number' && Number.isFinite(p.grade))
      .map((p) => ({ subject: p.subject, grade: p.grade as number }));
    return { ...base, passed: allMet, reasoning: typeof data.reasoning === 'string' ? data.reasoning : '', extractedGrades };
  } catch (error) {
    console.error('checkPrerequisiteGrades error:', error);
    return { ...base, passed: null, reasoning: 'An error occurred while reviewing the transcript.' };
  }
}

/** 0 broken -> approve, exactly 1 -> meeting, 2+ -> reject. Checks with
 *  passed === null (couldn't run) never count toward "broken". */
export function computeRecommendation(checks: ApplicationCheckResult[]): ApplicationRecommendation {
  const brokenCount = checks.filter((c) => c.passed === false).length;
  if (brokenCount === 0) return 'approve';
  if (brokenCount === 1) return 'meeting';
  return 'reject';
}

/** Runs every configured check and rolls them up into one recommendation —
 *  see this file's header comment for how future checks #2/#3 slot in. */
export async function reviewApplication(params: {
  transcriptUrl: string;
  prerequisites: PrerequisiteSpec[];
}): Promise<ApplicationReviewResult> {
  const checks = await Promise.all([
    checkPrerequisiteGrades(params),
    // Check #2 goes here once defined.
    // Check #3 goes here once defined.
  ]);

  return {
    checks,
    recommendation: computeRecommendation(checks),
    generatedAt: new Date().toISOString(),
    extractedGrades: checks.flatMap((c) => c.extractedGrades ?? []),
  };
}
