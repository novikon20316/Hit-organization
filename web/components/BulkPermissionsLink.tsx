'use client';

// components/BulkPermissionsLink.tsx
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';

export function BulkPermissionsLink() {
  const { lang } = useLanguage();
  return (
    <Link href="/bulk-permissions" className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-ink hover:border-primary hover:text-primary">
      🛡️ {lang === 'he' ? 'הרשאות מרוכזות' : 'Bulk Permissions'}
    </Link>
  );
}
