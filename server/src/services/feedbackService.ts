// src/services/feedbackService.ts
//
// Classifies a message from the in-app feedback chat (see feedbackController.ts)
// as either actionable "real" feedback (bug report, feature request, genuine
// UX complaint) or "noise" (test messages, spam, off-topic chatter) that gets
// auto-erased. If the AI call fails or ANTHROPIC_API_KEY isn't configured,
// this defaults to 'real' — a classification failure must never silently
// erase a user's message.

import { askClaude } from './anthropicClient.js';

export interface FeedbackClassification {
  classification: 'real' | 'noise';
  reasoning: string;
}

const SYSTEM_PROMPT = `You triage user-submitted feedback for a university thesis/project management app.
Classify the message as "real" (an actionable bug report, feature request, or genuine feedback about the app) or "noise" (test messages, spam, gibberish, greetings with no content, or anything unrelated to improving the app).
Respond with ONLY a JSON object, no other text: {"classification": "real" | "noise", "reasoning": "<one short sentence>"}`;

function parseClassification(raw: string): FeedbackClassification | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (parsed.classification !== 'real' && parsed.classification !== 'noise') return null;
    return {
      classification: parsed.classification,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    };
  } catch {
    return null;
  }
}

export async function classifyFeedback(text: string): Promise<FeedbackClassification> {
  const raw = await askClaude({
    system: SYSTEM_PROMPT,
    prompt: text,
    maxTokens: 150,
  });

  if (!raw) {
    return { classification: 'real', reasoning: 'AI classification unavailable — kept for manual review.' };
  }

  const parsed = parseClassification(raw);
  if (!parsed) {
    return { classification: 'real', reasoning: 'AI classification unavailable — kept for manual review.' };
  }
  return parsed;
}
