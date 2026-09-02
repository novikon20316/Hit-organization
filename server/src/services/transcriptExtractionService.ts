// src/services/transcriptExtractionService.ts
//
// Extracts EVERY course + grade found on a student's uploaded transcript/
// gradesheet — not just the ones matching one specific project's
// prerequisites (see applicationReviewService.ts's checkPrerequisiteGrades,
// a narrower, per-application check used for the supervisor's
// approve/meeting/reject recommendation). This is the source that populates
// a student's own completedCourses (see prerequisites.ts), so the browse-list
// prerequisite/minGrade filter has real data to check against the first time
// they ever submit a transcript with an application — see
// applicationController.ts's mergeExtractedGradesIntoCompletedCourses.

import pdfParse from 'pdf-parse';
import { askClaude } from './anthropicClient.js';

const DOWNLOAD_TIMEOUT_MS = 20000;
const MAX_TRANSCRIPT_TEXT_CHARS = 8000;

const SYSTEM_PROMPT = `You read a student's academic transcript/gradesheet and list every completed course together with its final grade and, if the transcript shows one, its credit points (a column often labeled "נ"ז", "נקודות זכות", or "credits"). Respond with ONLY a JSON object, no other text: {"courses": [{"subject": "<course name as written on the transcript>", "grade": <number>, "credits": <number or null if no credits column is shown>}]}. Only include a course if it has a clear final numeric grade — skip in-progress courses, pass/fail courses with no numeric grade, and anything you can't confidently read.`;

export interface ExtractedCourse {
  subject: string;
  grade: number;
  /** Null when the transcript has no credit-points column, or this specific
   *  row's value couldn't be confidently read — never guessed/defaulted by
   *  the AI. computeAccumulatedCredits treats null the same as 0. */
  credits: number | null;
}

/** Downloads and reads a transcript PDF, returning every {subject, grade,
 *  credits} the AI could confidently extract — [] on any failure (no URL, not
 *  a PDF, download/parse/AI error), same non-fatal contract as
 *  applicationReviewService.ts's checks. */
export async function extractCompletedCourses(params: { transcriptUrl: string }): Promise<ExtractedCourse[]> {
  if (!params.transcriptUrl) return [];
  if (!params.transcriptUrl.toLowerCase().split('?')[0]?.endsWith('.pdf')) return [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(params.transcriptUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) return [];

    const buffer = Buffer.from(await response.arrayBuffer());
    const parsed = await pdfParse(buffer);
    const transcriptText = parsed.text?.trim();
    if (!transcriptText) return [];

    const raw = await askClaude({ system: SYSTEM_PROMPT, prompt: transcriptText.slice(0, MAX_TRANSCRIPT_TEXT_CHARS), maxTokens: 1500 });
    if (!raw) return [];

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const data = JSON.parse(match[0]) as { courses?: Array<{ subject: string; grade: number; credits?: number | null }> };
    if (!Array.isArray(data.courses)) return [];

    return data.courses
      .filter((c) => typeof c?.subject === 'string' && c.subject.trim() && typeof c.grade === 'number' && Number.isFinite(c.grade))
      .map((c) => ({
        subject: c.subject.trim(),
        grade: c.grade,
        credits: typeof c.credits === 'number' && Number.isFinite(c.credits) ? c.credits : null,
      }));
  } catch (error) {
    console.error('extractCompletedCourses error:', error);
    return [];
  }
}

/** Sums whatever credit-points values were read off the transcript — computed
 *  here, in code, never trusted from the AI's own arithmetic (same discipline
 *  as milestoneRouting.ts's computeGradingComponentsScore/
 *  computeChainFinalGrade). Returns null (not 0) when NONE of the extracted
 *  courses had a credits value at all — distinguishes "transcript has no
 *  credits column" (accumulatedCredits stays unset, shown as pending on the
 *  research-proposal form) from "this student has genuinely earned 0 credits
 *  so far" (a real, if unusual, value). */
export function computeAccumulatedCredits(courses: ExtractedCourse[]): number | null {
  const withCredits = courses.filter((c) => c.credits !== null);
  if (withCredits.length === 0) return null;
  return withCredits.reduce((sum, c) => sum + (c.credits ?? 0), 0);
}
