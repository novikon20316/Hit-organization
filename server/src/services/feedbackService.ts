// src/services/feedbackService.ts
//
// Triages a message from the in-app feedback chat (see feedbackController.ts):
// "real" (bug report, feature request, genuine UX complaint) vs "noise"
// (test messages, spam, off-topic chatter) that gets auto-erased — and, for
// real feedback, a category, an urgency, a one-line English summary (most
// messages arrive in Hebrew) and which already-open item it duplicates, if
// any. If the AI call fails or ANTHROPIC_API_KEY isn't configured, this
// defaults to 'real' with no extra fields — a classification failure must
// never silently erase a user's message.

import { askClaude } from './anthropicClient.js';

export const FEEDBACK_CATEGORIES = ['bug', 'feature_request', 'ux', 'question', 'other'] as const;
export type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number];
export const FEEDBACK_URGENCIES = ['high', 'medium', 'low'] as const;
export type FeedbackUrgency = typeof FEEDBACK_URGENCIES[number];

export interface FeedbackClassification {
  classification: 'real' | 'noise';
  reasoning: string;
  category: FeedbackCategory | null;
  urgency: FeedbackUrgency | null;
  summaryEn: string | null;
  duplicateOfId: string | null;
}

/** Where the message was sent from — shown to the model so "it doesn't
 *  load" can be read against the screen and platform it happened on. */
export interface FeedbackContextForAi {
  role?: string | undefined;
  screen?: string | undefined;
  platform?: string | undefined;
}

/** An already-open real feedback item the new one may duplicate. */
export interface OpenFeedbackForAi {
  id: string;
  summary: string;
}

const SYSTEM_PROMPT = `You triage user-submitted feedback for a university thesis/project management app (web and mobile). Messages are usually in Hebrew.
Classify the message as "real" (an actionable bug report, feature request, or genuine feedback about the app) or "noise" (test messages, spam, gibberish, greetings with no content, or anything unrelated to improving the app).
For real feedback also give:
- category: "bug" (something broken or wrong), "feature_request" (something new), "ux" (works but confusing or awkward), "question" (asking how to do something), or "other"
- urgency: "high" (blocks the user's work, data looks wrong or lost, security or privacy concern), "medium" (a real problem with a workaround), or "low" (cosmetic, nice-to-have)
- summaryEn: one short English sentence saying what the problem or request is
- duplicateOfId: the id of an open item below that reports the SAME issue, or null. Only when it is clearly the same problem, not merely the same area.
For noise, set category, urgency, summaryEn and duplicateOfId to null.
Respond with ONLY a JSON object, no other text: {"classification": "real" | "noise", "reasoning": "<one short sentence>", "category": ..., "urgency": ..., "summaryEn": ..., "duplicateOfId": ...}`;

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function parseClassification(raw: string, openIds: Set<string>): FeedbackClassification | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (parsed.classification !== 'real' && parsed.classification !== 'noise') return null;
    const real = parsed.classification === 'real';
    return {
      classification: parsed.classification,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      category: real ? pick(parsed.category, FEEDBACK_CATEGORIES) : null,
      urgency: real ? pick(parsed.urgency, FEEDBACK_URGENCIES) : null,
      summaryEn: real && typeof parsed.summaryEn === 'string' && parsed.summaryEn.trim() ? parsed.summaryEn.trim().slice(0, 300) : null,
      // Only an id we actually offered — never trust a made-up one.
      duplicateOfId: real && typeof parsed.duplicateOfId === 'string' && openIds.has(parsed.duplicateOfId) ? parsed.duplicateOfId : null,
    };
  } catch {
    return null;
  }
}

const UNAVAILABLE: FeedbackClassification = {
  classification: 'real',
  reasoning: 'AI classification unavailable — kept for manual review.',
  category: null,
  urgency: null,
  summaryEn: null,
  duplicateOfId: null,
};

export async function classifyFeedback(
  text: string,
  context: FeedbackContextForAi = {},
  openItems: OpenFeedbackForAi[] = [],
): Promise<FeedbackClassification> {
  const contextLines = [
    context.role ? `Sender's role: ${context.role}` : null,
    context.screen ? `Last screen before opening feedback: ${context.screen}` : null,
    context.platform ? `Platform: ${context.platform}` : null,
  ].filter(Boolean).join('\n');
  const openList = openItems.length
    ? openItems.map((o) => `- ${o.id}: ${o.summary}`).join('\n')
    : '(none)';

  const raw = await askClaude({
    system: SYSTEM_PROMPT,
    prompt: `${contextLines ? `${contextLines}\n\n` : ''}Open feedback items:\n${openList}\n\nMessage:\n${text}`,
    maxTokens: 400,
  });

  if (!raw) return UNAVAILABLE;
  return parseClassification(raw, new Set(openItems.map((o) => o.id))) ?? UNAVAILABLE;
}
