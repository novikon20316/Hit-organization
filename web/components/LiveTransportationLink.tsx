'use client';

// components/LiveTransportationLink.tsx
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';

export function LiveTransportationLink() {
  const { lang } = useLanguage();
  return (
    <Link href="/admin/live-transportation" className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-ink hover:border-primary hover:text-primary">
      📡 {lang === 'he' ? 'תנועה חיה' : 'Live Transportation'}
    </Link>
  );
}
