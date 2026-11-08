// src/controllers/formDraftController.ts
//
// E3 — examiner form drafts (see services/formDrafts.ts). Two front doors to
// the same store: internal examiners by account (verifyToken; must be on the
// milestone's panel), external examiners by access token after the email
// code (isOtpSessionFresh). Neither path lets anyone read another examiner's
// draft — the owner key is always derived from the caller, never the body.
import { Request, Response } from 'express';
import { db } from '../config/firebase.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { isOtpSessionFresh } from '../services/examinerAccess.js';
import { getDraft, saveDraft, deleteDraft, isValidFormKey } from '../services/formDrafts.js';
import { L } from '../utils/localize.js';

type Scope = { milestoneId: string; ownerKey: string; formKey: string };

async function internalScope(req: AuthenticatedRequest, res: Response): Promise<Scope | null> {
  const uid = req.user?.uid;
  const { milestoneId, formKey } = req.params as Record<string, string>;
  if (!uid) {
    res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
    return null;
  }
  if (typeof milestoneId !== 'string' || !milestoneId || !isValidFormKey(formKey)) {
    res.status(400).json({ message: L(req, 'Invalid request.', 'בקשה לא תקינה.') });
    return null;
  }
  const m = (await db.collection('milestones').doc(milestoneId).get()).data();
  const onPanel = !!m && (
    (m.examinerIds ?? []).includes(uid)
    || (m.defensePanel ?? []).some((p: { type?: string; ref?: string }) => p.type === 'internal' && p.ref === uid)
  );
  if (!onPanel) {
    res.status(403).json({ message: L(req, 'You are not an examiner on this milestone.', 'אינך בוחן/ת באבן דרך זו.') });
    return null;
  }
  return { milestoneId, ownerKey: `internal:${uid}`, formKey };
}

async function externalScope(req: Request, res: Response): Promise<Scope | null> {
  const { token, formKey } = req.params as Record<string, string>;
  if (typeof token !== 'string' || !token || !isValidFormKey(formKey)) {
    res.status(400).json({ message: L(req, 'Invalid request.', 'בקשה לא תקינה.') });
    return null;
  }
  const tokenDoc = (await db.collection('examinerTokens').doc(token).get()).data();
  if (!tokenDoc) {
    res.status(404).json({ message: L(req, 'Invalid or unknown token.', 'אסימון לא תקין או לא מוכר.') });
    return null;
  }
  if (!isOtpSessionFresh(tokenDoc)) {
    res.status(403).json({ message: L(req, 'Please verify your access code first.', 'יש לאמת את קוד הגישה שלך תחילה.') });
    return null;
  }
  // The token is the examiner's identity for this one assignment; it may be
  // project-level (no milestoneId), so scope by whichever the token names.
  return { milestoneId: tokenDoc.milestoneId || tokenDoc.projectId || 'token', ownerKey: `external:${token}`, formKey };
}

function handlers(scopeOf: (req: Request, res: Response) => Promise<Scope | null>) {
  return {
    get: async (req: Request, res: Response) => {
      try {
        const s = await scopeOf(req, res);
        if (!s) return;
        return res.json({ draft: await getDraft(s.milestoneId, s.ownerKey, s.formKey) });
      } catch (err) {
        console.error('getDraft error:', err);
        return res.status(500).json({ message: L(req, 'Failed to load the saved draft.', 'טעינת הטיוטה השמורה נכשלה.') });
      }
    },
    put: async (req: Request, res: Response) => {
      try {
        const s = await scopeOf(req, res);
        if (!s) return;
        const ok = await saveDraft(s.milestoneId, s.ownerKey, s.formKey, req.body?.data);
        if (!ok) return res.status(400).json({ message: L(req, 'The draft is too large to save.', 'הטיוטה גדולה מכדי לשמור.') });
        return res.json({ success: true });
      } catch (err) {
        console.error('saveDraft error:', err);
        return res.status(500).json({ message: L(req, 'Failed to save the draft.', 'שמירת הטיוטה נכשלה.') });
      }
    },
    delete: async (req: Request, res: Response) => {
      try {
        const s = await scopeOf(req, res);
        if (!s) return;
        await deleteDraft(s.milestoneId, s.ownerKey, s.formKey);
        return res.json({ success: true });
      } catch (err) {
        console.error('deleteDraft error:', err);
        return res.status(500).json({ message: L(req, 'Failed to discard the draft.', 'מחיקת הטיוטה נכשלה.') });
      }
    },
  };
}

/** /api/examiner/drafts/:milestoneId/:formKey (verifyToken) */
export const internalDraft = handlers((req, res) => internalScope(req as AuthenticatedRequest, res));
/** /api/examiner-access/:token/drafts/:formKey (public, OTP-gated) */
export const externalDraft = handlers(externalScope);
