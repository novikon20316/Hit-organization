// src/services/anthropicClient.ts
//
// Thin shared wrapper around the Anthropic SDK. Used by feedbackService.ts
// (feedback-chat triage), cvScreeningService.ts (CV-vs-prerequisites
// screening on applications) and assistantService.ts (in-app help chat).
// Every caller must treat a missing/invalid key or a failed call as
// non-fatal — see each service's own fallback behavior.

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

const ASSISTANT_MODEL = 'claude-opus-5-5';

export type AssistantReply =
  | { kind: 'answer'; text: string }
  | { kind: 'refused' };

/**
 * Multi-turn chat for the in-app help assistant. `context` (the role's
 * manual) is the large, stable part of the system prompt and is marked for
 * prompt caching; `instructions` precede it and `language` follows it, so
 * the cached prefix is shared by every user of the same role. Returns null
 * if no API key is configured or the call fails.
 *
 * The installed SDK (0.32.x) predates prompt caching, `output_config` and
 * refusal fallbacks in its types, so those fields are sent through an
 * untyped body — the API reads them regardless of the SDK version.
 */
export async function askAssistantModel(params: {
  instructions: string;
  context: string;
  language: string;
  messages: Anthropic.MessageParam[];
}): Promise<AssistantReply | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  const body = {
    model: ASSISTANT_MODEL,
    max_tokens: 4000,
    system: [
      { type: 'text', text: params.instructions },
      { type: 'text', text: params.context, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: params.language },
    ],
    messages: params.messages,
    // Short help answers — low effort keeps latency and cost down.
    output_config: { effort: 'low' },
    // On a safety-classifier decline, re-run on a fallback model chosen by
    // the API instead of returning nothing.
    fallbacks: 'default',
  };

  try {
    const response = await anthropic.messages.create(
      body as unknown as Anthropic.MessageCreateParamsNonStreaming,
      { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } },
    );
    if ((response.stop_reason as string) === 'refusal') return { kind: 'refused' };
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    return text ? { kind: 'answer', text } : null;
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error(`askAssistantModel API error ${error.status}:`, error.message);
    } else {
      console.error('askAssistantModel error:', error);
    }
    return null;
  }
}
