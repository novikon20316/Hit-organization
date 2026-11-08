// src/controllers/commentTemplatesController.ts
//
// GET/PUT /api/users/me/comment-templates — a grader's own saved feedback
// snippets, inserted into the grading comment box (web/mobile
// GradeMilestoneModal) and editable before sending. Personal only (decided
// 2026-11-08): stored on commentTemplates/{uid}, server-only (no Firestore
// rule), never visible to anyone else.

import { Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { L } from '../utils/localize.js';

const MAX_TEMPLATES = 30;
const MAX_TEXT = 1000;

export interface CommentTemplate { id: string; text: string }

function readTemplates(raw: unknown): CommentTemplate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is CommentTemplate => !!t && typeof t.id === 'string' && typeof t.text === 'string')
    .slice(0, MAX_TEMPLATES);
}

export const getMyCommentTemplates = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized', 'לא מורשה') });
  try {
    const snap = await db.collection('commentTemplates').doc(req.user.uid).get();
    return res.status(200).json({ templates: readTemplates(snap.data()?.items) });
  } catch (error) {
    console.error('getMyCommentTemplates error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load your templates.', 'טעינת התבניות נכשלה.') });
  }
};

export const updateMyCommentTemplates = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized', 'לא מורשה') });
  const raw = req.body?.templates;
  if (!Array.isArray(raw) || raw.length > MAX_TEMPLATES) {
    return res.status(400).json({ message: L(req, `Up to ${MAX_TEMPLATES} templates.`, `עד ${MAX_TEMPLATES} תבניות.`) });
  }
  const templates: CommentTemplate[] = [];
  for (const t of raw) {
    const text = typeof t?.text === 'string' ? t.text.trim() : '';
    if (!text || text.length > MAX_TEXT) {
      return res.status(400).json({ message: L(req, `Each template must be 1–${MAX_TEXT} characters.`, `כל תבנית צריכה להיות באורך 1–${MAX_TEXT} תווים.`) });
    }
    const id = typeof t?.id === 'string' && /^[\w-]{1,64}$/.test(t.id) ? t.id : randomUUID();
    templates.push({ id, text });
  }
  try {
    await db.collection('commentTemplates').doc(req.user.uid).set({ items: templates, updatedAt: new Date().toISOString() });
    return res.status(200).json({ templates });
  } catch (error) {
    console.error('updateMyCommentTemplates error:', error);
    return res.status(500).json({ message: L(req, 'Failed to save your templates.', 'שמירת התבניות נכשלה.') });
  }
};
