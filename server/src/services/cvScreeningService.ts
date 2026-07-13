// src/services/cvScreeningService.ts
//
// AI screening of a student's CV against a project's prerequisites/required
// skills, run when a student applies to a project (see applyApplication in
// applicationController.ts). PDF-only. Best-effort and time-bounded: any
// failure (non-PDF, download error, parse error, AI error/timeout) resolves
// to an 'unable_to_assess' result rather than throwing — screening must
// never block or fail a student's application submission.

import pdfParse from 'pdf-parse';
import { askClaude } from './anthropicClient.js';

export type CvScreeningVerdict = 'strong_fit' | 'partial_fit' | 'weak_fit' | 'unable_to_assess';

export interface CvScreeningResult {
  verdict: CvScreeningVerdict;
  reasoning: string;
  generatedAt: string;
}

const DOWNLOAD_TIMEOUT_MS = 20000;
const MAX_CV_TEXT_CHARS = 8000;

const SYSTEM_PROMPT = `You help a project supervisor screen a student's CV against a project's prerequisites and required skills.
Respond with ONLY a JSON object, no other text: {"verdict": "strong_fit" | "partial_fit" | "weak_fit", "reasoning": "<2-3 sentences for the supervisor>"}
"strong_fit" = clearly meets the prerequisites/skills. "partial_fit" = meets some but not all. "weak_fit" = does not appear to meet the prerequisites/skills.`;

function parseVerdict(raw: string): { verdict: CvScreeningVerdict; reasoning: string } | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!['strong_fit', 'partial_fit', 'weak_fit'].includes(parsed.verdict)) return null;
    return {
      verdict: parsed.verdict,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    };
  } catch {
    return null;
  }
}

export async function screenApplication(params: {
  cvUrl: string;
  prerequisites: string[];
  requiredSkills: string[];
}): Promise<CvScreeningResult> {
  const generatedAt = new Date().toISOString();
  const fallback = (reasoning: string): CvScreeningResult => ({ verdict: 'unable_to_assess', reasoning, generatedAt });

  if (!params.cvUrl) return fallback('No CV was uploaded with this application.');
  if ((params.prerequisites?.length ?? 0) === 0 && (params.requiredSkills?.length ?? 0) === 0) {
    return fallback('This project has no prerequisites or required skills listed to screen against.');
  }
  if (!params.cvUrl.toLowerCase().split('?')[0]?.endsWith('.pdf')) {
    return fallback('CV file is not a PDF — could not be read.');
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(params.cvUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) return fallback('Could not download the CV file.');

    const buffer = Buffer.from(await response.arrayBuffer());
    const parsed = await pdfParse(buffer);
    const cvText = parsed.text?.trim();
    if (!cvText) return fallback('Could not extract any text from the CV PDF.');

    const prompt = [
      `Project prerequisites: ${params.prerequisites.join(', ') || 'none listed'}`,
      `Project required skills: ${params.requiredSkills.join(', ') || 'none listed'}`,
      '',
      'Candidate CV text:',
      cvText.slice(0, MAX_CV_TEXT_CHARS),
    ].join('\n');

    const raw = await askClaude({ system: SYSTEM_PROMPT, prompt, maxTokens: 300 });
    if (!raw) return fallback('AI screening unavailable.');

    const parsedVerdict = parseVerdict(raw);
    if (!parsedVerdict) return fallback('AI screening returned an unexpected response.');

    return { ...parsedVerdict, generatedAt };
  } catch (error) {
    console.error('screenApplication error:', error);
    return fallback('An error occurred while screening the CV.');
  }
}
