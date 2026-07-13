// src/services/anthropicClient.ts
//
// Thin shared wrapper around the Anthropic SDK. Used by feedbackService.ts
// (feedback-chat triage) and cvScreeningService.ts (CV-vs-prerequisites
// screening on applications). Both callers must treat a missing/invalid key
// or a failed call as non-fatal — see each service's own fallback behavior.

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-5';

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

/**
 * Sends a single-turn prompt and returns the raw text response, or null if
 * no API key is configured or the call fails. Callers decide the fallback.
 */
export async function askClaude(params: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: params.maxTokens ?? 512,
      system: params.system,
      messages: [{ role: 'user', content: params.prompt }],
    });
    const block = response.content[0];
    return block?.type === 'text' ? block.text : null;
  } catch (error) {
    console.error('askClaude error:', error);
    return null;
  }
}
