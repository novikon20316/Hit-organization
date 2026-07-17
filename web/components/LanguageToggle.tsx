'use client';

import { useLanguage } from '@/contexts/LanguageContext';

export function LanguageToggle() {
  const { lang, toggleLang, t } = useLanguage();

  return (
    <button
      type="button"
      onClick={toggleLang}
      className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-ink transition-colors hover:border-primary hover:text-primary"
      aria-label={t('language')}
    >
      {lang === 'he' ? t('english') : t('hebrew')}
    </button>
  );
}
