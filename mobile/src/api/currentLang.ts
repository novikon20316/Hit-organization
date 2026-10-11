// src/api/currentLang.ts
// apiClient.ts's axios interceptor is a plain module, not a component, so it
// can't read ActiveRoleContext's `language` via a hook — this is a tiny
// synchronous mirror of it instead, kept in sync by that context's own
// sync() (see contexts/ActiveRoleContext.tsx), and read on every request to
// set the X-Lang header the server uses to localize response text.
export type Lang = 'he' | 'en';

let currentLang: Lang = 'he';

export function setCurrentLang(lang: Lang): void {
  currentLang = lang;
}

export function getCurrentLang(): Lang {
  return currentLang;
}
