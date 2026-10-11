// src/utils/localize.ts
// Picks the right-language string for an API response, given either a
// request (reads req.lang, set by middleware/language.ts) or a bare Lang
// value for services that don't have a Request to hand (e.g.
// accountDeletion.ts's scheduled jobs). Server-side counterpart to
// web/lib/i18n.ts and mobile/components/i18n.ts's bilingual string tables —
// for one-off/templated response text (mostly error messages) that doesn't
// belong in either client's static dictionary.
import type { Request } from 'express';
import type { Lang } from '../middleware/language.js';

export function L(reqOrLang: Request | Lang, en: string, he: string): string {
  const lang = typeof reqOrLang === 'string' ? reqOrLang : reqOrLang.lang;
  return lang === 'en' ? en : he;
}
