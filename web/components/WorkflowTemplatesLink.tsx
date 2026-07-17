'use client';

// components/WorkflowTemplatesLink.tsx
// Same shape as components/ReportsLink.tsx — links to the shared,
// top-level /workflow-templates route (milestone-workflow configuration),
// wired into the three dashboards that mobile links this feature from:
// faculty_admin, coordinator, and grad_school_head.
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';

export function WorkflowTemplatesLink() {
  const { lang } = useLanguage();
  return (
    <Link
      href="/workflow-templates"
      className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-ink hover:border-primary hover:text-primary"
    >
      🧬 {lang === 'he' ? 'תבניות תהליך' : 'Process Templates'}
    </Link>
  );
}
