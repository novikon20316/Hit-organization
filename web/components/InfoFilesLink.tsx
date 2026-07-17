'use client';

// components/InfoFilesLink.tsx
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';

export function InfoFilesLink() {
  const { lang } = useLanguage();
  return (
    <Link href="/info-files" className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-ink hover:border-primary hover:text-primary">
      📄 {lang === 'he' ? 'מסמכי מידע' : 'Info Files'}
    </Link>
  );
}
