'use client';

// components/AcademicYearLink.tsx
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';

export function AcademicYearLink() {
  const { lang } = useLanguage();
  return (
    <Link href="/academic-year" className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-ink hover:border-primary hover:text-primary">
      🎓 {lang === 'he' ? 'שנת לימודים' : 'Academic Year'}
    </Link>
  );
}
