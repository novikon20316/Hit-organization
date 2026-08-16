'use client';

// components/CommitteesLink.tsx
// Same shape as components/WorkflowTemplatesLink.tsx — links to the shared,
// top-level /committees route (thesis/final-project review committees).
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';

export function CommitteesLink() {
  const { lang } = useLanguage();
  return (
    <Link
      href="/committees"
      className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-ink hover:border-primary hover:text-primary"
    >
      🧑‍⚖️ {lang === 'he' ? 'ועדות' : 'Committees'}
    </Link>
  );
}
