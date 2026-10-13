'use client';

// app/student/home/FinalReportCard.tsx
// Shown once the student's final grade is approved — opens their view-only
// final report (app/final-report/page.tsx) in a new tab. Same link they got
// by email; renders nothing until one exists.

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, type FinalReportLinkInfo } from '@/lib/apiClient';

export function FinalReportCard() {
  const { lang } = useLanguage();
  const [links, setLinks] = useState<FinalReportLinkInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getMyFinalReportLinks()
      .then((res) => {
        if (!cancelled) setLinks(res.links ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (links.length === 0) return null;

  return (
    <div className="mb-6 grid gap-2">
      {links.map((l) => (
        <div
          key={l.link}
          className="flex flex-wrap items-center justify-between gap-3 rounded-student border border-student-primary bg-student-surface-container-low p-4"
        >
          <div>
            <p className="font-semibold text-student-on-surface">
              🎓 {lang === 'he' ? 'הדוח המסכם שלך מוכן' : 'Your final report is ready'}
            </p>
            <p className="text-sm text-student-on-surface-variant">
              {lang === 'he' ? l.projectTitleHe || l.projectTitleEn : l.projectTitleEn || l.projectTitleHe}
            </p>
          </div>
          <a
            href={l.link}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-student bg-student-primary px-4 py-2 text-sm font-semibold text-student-on-primary hover:opacity-90"
          >
            {lang === 'he' ? 'צפייה והדפסה' : 'View & print'}
          </a>
        </div>
      ))}
    </div>
  );
}
