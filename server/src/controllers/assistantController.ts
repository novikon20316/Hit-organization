// src/controllers/assistantController.ts
//
// POST /api/assistant/ask — the in-app help assistant (see
// services/assistantService.ts). Authenticated, per-account rate limited
// (assistantLimiter), and answers only from the manual of a role the caller
// actually holds. The conversation is client-held and re-sent each turn, so
// every field is validated and length-capped here; nothing is stored.

import { Response } from 'express';
import type Anthropic from '@anthropic-ai/sdk';
import { AuthenticatedRequest, getUserRoles } from '../middleware/auth.js';
import { askAssistant, assistantSupportsRole } from '../services/assistantService.js';
import { studentAssistantDocuments } from '../services/assistantDocuments.js';
import { L } from '../utils/localize.js';

const MAX_TURNS = 12;
const MAX_USER_CHARS = 1000;
const MAX_ASSISTANT_CHARS = 4000;
const MAX_TOTAL_CHARS = 16000;

/** Alternating user/assistant turns, starting and ending with the user;
 *  null if anything is off. */
function parseMessages(raw: unknown): Anthropic.MessageParam[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_TURNS) return null;
  const messages: Anthropic.MessageParam[] = [];
  let total = 0;
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as { role?: unknown; content?: unknown } | null;
    const expectedRole = i % 2 === 0 ? 'user' : 'assistant';
    if (!item || item.role !== expectedRole || typeof item.content !== 'string') return null;
    const content = item.content.trim();
    const max = expectedRole === 'user' ? MAX_USER_CHARS : MAX_ASSISTANT_CHARS;
    if (!content || content.length > max) return null;
    total += content.length;
    messages.push({ role: expectedRole, content });
  }
  // Odd length = starts and ends with a user turn, given the alternation above.
  if (total > MAX_TOTAL_CHARS || messages.length % 2 === 0) return null;
  return messages;
}

export const askAssistantHandler = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized', 'לא מורשה') });

  const role = typeof req.body?.role === 'string' ? req.body.role : '';
  if (!getUserRoles(req.user).includes(role) || !assistantSupportsRole(role)) {
    return res.status(403).json({ message: L(req, 'The assistant is not available for this role.', 'העוזר אינו זמין לתפקיד זה.') });
  }

  const messages = parseMessages(req.body?.messages);
  if (!messages) {
    return res.status(400).json({
      message: L(req, `Messages must be under ${MAX_USER_CHARS} characters each — please shorten your question.`, `כל הודעה צריכה להיות קצרה מ-${MAX_USER_CHARS} תווים — נא לקצר את השאלה.`),
    });
  }

  const lang = req.lang === 'en' ? 'en' : 'he';
  // S6 — students also get their faculty's public procedure documents. A
  // failure here just means answering from the manual alone.
  const documents = role === 'student'
    ? await studentAssistantDocuments(req.user.uid, lang).catch((err) => {
      console.warn('assistant documents failed:', err);
      return [];
    })
    : [];
  const reply = await askAssistant({ role, lang, messages, documents });
  if (!reply) {
    return res.status(503).json({ message: L(req, 'The assistant is unavailable right now. Please try again later.', 'העוזר אינו זמין כרגע. נסו שוב מאוחר יותר.') });
  }
  if (reply.kind === 'refused') {
    return res.json({ answer: L(req, "I can't help with that. I can answer questions about using the system.", 'לא אוכל לעזור בזה. אפשר לשאול אותי על השימוש במערכת.') });
  }
  return res.json({ answer: reply.text });
};
