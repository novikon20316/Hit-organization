// src/middleware/language.ts
// Resolves which language ('he' | 'en') to render API response text in, from
// the X-Lang header both clients attach on every request — mirrors each
// client's own UI language, not the account's stored `language` Firestore
// field (web's toggle is local-only and can disagree with it; see
// contexts/LanguageContext.tsx). Runs before auth, so it also covers
// pre-auth error responses (401s, rate limiting, etc), and defaults to 'he'
// (the system-wide default — see userController.ts's createUserDoc) for any
// caller that doesn't send it (curl, old clients).
import { Request, Response, NextFunction } from 'express';

export type Lang = 'he' | 'en';

declare global {
  namespace Express {
    interface Request {
      lang: Lang;
    }
  }
}

export function resolveLanguage(req: Request, _res: Response, next: NextFunction) {
  req.lang = req.header('X-Lang') === 'en' ? 'en' : 'he';
  next();
}
