// src/services/assistantService.ts
//
// The in-app help assistant (web components/ChatbotFab.tsx, mobile
// app/chatbot.tsx): answers "how do I…" questions about the system from the
// asking user's own role manual (assistant/manualTexts.ts, generated from
// manuals/*.docx) and, for students, their faculty's general procedure
// documents (S6 — services/assistantDocuments.ts). By design it knows
// nothing about the user — no projects, grades, names or other records are
// ever put in the prompt — and it can't take actions; it only explains the
// manual and those public documents. What the user types goes to
// Anthropic (see the privacy policy's AI-assisted processing section) and is
// not stored or logged here.

import type Anthropic from '@anthropic-ai/sdk';
import { askAssistantModel, type AssistantReply } from './anthropicClient.js';
import { MANUAL_TEXTS, type ManualKey } from '../assistant/manualTexts.js';
import type { AssistantDocument } from './assistantDocuments.js';

/** Which manual(s) each role answers from. system_admin is absent: the
 *  assistant isn't offered to that role. */
const ROLE_MANUALS: Record<string, ManualKey[]> = {
  student: ['student', 'studentProcess'],
  supervisor: ['supervisor'],
  secondary_supervisor: ['supervisor'],
  coordinator: ['coordinator'],
  administrative_secretary: ['administrative_secretary'],
  faculty_admin: ['faculty_admin'],
  program_head: ['program_head'],
  division_head: ['division_head'],
  dean: ['dean'],
  grad_school_head: ['grad_school_head'],
  school_head: ['school_head'],
  internal_examiner: ['internal_examiner'],
};

export function assistantSupportsRole(role: string): boolean {
  return role in ROLE_MANUALS;
}

const INSTRUCTIONS = [
  "You are the help assistant inside HIT's system for managing final projects and theses.",
  'You answer questions about how to use the system, using only the user manual below, which is the manual for the role the user is signed in as.',
  '',
  'How to answer:',
  '- Keep answers short: a sentence or two, or a few numbered steps, with the exact path to click (for example: Menu → Overview → Submit milestone), the way the manual writes it.',
  "- Some users also get their faculty's procedure documents after the manual (regulations, submission procedures). Use them for questions about rules and procedures, and say which document the answer comes from. On how to use the system, the manual wins; on faculty rules, the document wins.",
  '- If neither the manual nor the documents cover the question, say so plainly and suggest asking their faculty coordinator or sending feedback through the app. Do not guess at features, rules, dates or deadlines the manual does not state.',
  "- You cannot see the user's projects, grades, messages or any other data, and you cannot perform actions. If asked about their own status (\"what is my grade\", \"did my supervisor approve\"), tell them where in the app they can check it.",
  '- Do not ask for personal details such as ID numbers, grades or passwords. If the user shares some, do not repeat them.',
  '- Stay on the topic of using this system. Politely decline unrelated requests.',
  '- Plain text only: no markdown headings, tables or bold. Numbered steps are fine.',
].join('\n');

export async function askAssistant(params: {
  role: string;
  lang: 'he' | 'en';
  messages: Anthropic.MessageParam[];
  documents?: AssistantDocument[];
}): Promise<AssistantReply | null> {
  const keys = ROLE_MANUALS[params.role] ?? [];
  const context = [
    ...keys.map((key) => `<manual name="${key}">\n${MANUAL_TEXTS[key]}\n</manual>`),
    ...(params.documents ?? []).map((d) => `<document title="${d.title.replace(/"/g, "'")}">\n${d.text}\n</document>`),
  ].join('\n\n');
  const language = params.lang === 'en'
    ? 'The user has the interface in English: answer in English. The manual is in Hebrew, so translate menu and button names into the plain English a user would see.'
    : 'The user has the interface in Hebrew: answer in Hebrew.';
  return askAssistantModel({ instructions: INSTRUCTIONS, context, language, messages: params.messages });
}
