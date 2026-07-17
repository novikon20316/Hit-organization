'use client';

// contexts/LanguageContext.tsx
// Web has no per-user Firestore `language` field to read until after login,
// so this starts from localStorage (falling back to 'he', matching the
// default in mobile's createUserDoc) and keeps <html lang/dir> in sync —
// that's what makes Tailwind's automatic RTL-aware logical properties
// (border-inline-start, ms-*, me-*, etc.) do the right thing everywhere.

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { t as translations, tx, type Lang } from '@/lib/i18n';

interface LanguageContextValue {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  t: (key: keyof typeof translations) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = 'hit-web-lang';

function readStoredLang(): Lang {
  if (typeof window === 'undefined') return 'he';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'he' || stored === 'en' ? stored : 'he';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Lazy initializer instead of reading localStorage in an effect — avoids
  // an extra render just to apply the stored preference. Server-rendered
  // markup still starts as 'he' (matching the <html> default in layout.tsx)
  // since window isn't available during SSR; the client then reconciles to
  // whatever was actually stored, in the same pass as hydration.
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const toggleLang = useCallback(() => setLangState((l) => (l === 'he' ? 'en' : 'he')), []);
  const t = useCallback((key: keyof typeof translations) => tx(key, lang), [lang]);

  return (
    <LanguageContext.Provider value={{ lang, dir: lang === 'he' ? 'rtl' : 'ltr', setLang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
