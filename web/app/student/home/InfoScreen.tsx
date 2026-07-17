'use client';

// app/student/home/InfoScreen.tsx
// Ported from mobile/app/student/info.tsx — shown when studentState ===
// 'ineligible'. Same as mobile, this isn't its own route; home/page.tsx
// renders it inline in place of the normal dashboard content.

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';

interface InfoFile {
  id: string;
  titleHe: string;
  titleEn: string;
  fileUrl: string;
  fileName: string;
}

interface InfoScreenProps {
  studentDegree?: string;
}

export function InfoScreen({ studentDegree }: InfoScreenProps) {
  const { lang, t } = useLanguage();
  const isBachelor = studentDegree === 'bachelors';
  const [files, setFiles] = useState<InfoFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getInfoFiles()
      .then((res) => {
        if (!cancelled) setFiles(res.files ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const steps = isBachelor
    ? [
        { he: 'בחירת נושא ומנחה', en: 'Topic & Supervisor Selection' },
        { he: 'הגשת אפיון', en: 'Specification Submission' },
        { he: 'דוח ביניים', en: 'Interim Report' },
        { he: 'תוצר סופי ומצגת', en: 'Final Product & Presentation' },
      ]
    : [
        { he: 'בחירת מנחה ונושא', en: 'Supervisor & Topic Selection' },
        { he: 'הצעת מחקר', en: 'Research Proposal' },
        { he: 'עבודה פעילה ודוחות התקדמות', en: 'Active Work & Progress Reports' },
        { he: 'הגשה לשיפוט', en: 'Submission for Examination' },
        { he: 'הגנה וציון סופי', en: 'Defense & Final Grade' },
      ];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 rounded-[var(--radius)] border border-accent bg-[#FBF3E3] p-5">
        <p className="mb-2 text-2xl">⏳</p>
        <p className="mb-1.5 text-base font-bold text-ink">{t('studentNotEligibleTitle')}</p>
        <p className="text-sm text-muted">{t('studentNotEligibleSub')}</p>
      </div>

      <div className="mb-4 rounded-[var(--radius)] border border-line bg-surface p-5">
        <p className="mb-2 text-lg">📘</p>
        <p className="mb-1.5 text-sm font-semibold text-primary">{isBachelor ? t('bachelorProjectInfo') : t('masterThesisInfo')}</p>
        <p className="text-sm text-muted">
          {isBachelor
            ? lang === 'he'
              ? 'פרויקט הגמר הוא פרויקט קבוצתי או אישי המשלב יישום מעשי של הנלמד בתואר. הוא כולל בחירת נושא, אישור מנחה, הגשות ביניים, תוצר סופי והצגה.'
              : "The final project integrates practical application of your degree's content. It includes topic selection, supervisor approval, interim submissions, a final product, and a presentation."
            : lang === 'he'
              ? 'תזה לתואר שני היא עבודת מחקר מקורית. התהליך כולל הצעת מחקר, עבודה מודרכת, שיפוט על ידי בוחנים, הגנה וציון סופי.'
              : "A master's thesis is an original research work. The process includes a research proposal, guided work, examination by reviewers, a defense session, and a final grade."}
        </p>
      </div>

      <div className="mb-4 rounded-[var(--radius)] border border-line bg-surface p-5">
        <p className="mb-3 text-sm font-semibold text-ink">📋 {lang === 'he' ? 'שלבים עיקריים בתהליך:' : 'Main Process Steps:'}</p>
        <div className="grid gap-2.5">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-ink">
                {i + 1}
              </span>
              <p className="text-sm text-ink">{lang === 'he' ? step.he : step.en}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[var(--radius)] border border-line bg-surface p-5">
        <p className="mb-3 text-sm font-semibold text-ink">📎 {lang === 'he' ? 'מסמכים והסברים' : 'Documents & Guidance'}</p>
        {loading ? (
          <p className="text-sm text-muted">…</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-muted">{lang === 'he' ? 'אין קבצים זמינים כרגע' : 'No files available yet'}</p>
        ) : (
          <div className="grid gap-2">
            {files.map((f) => (
              <a
                key={f.id}
                href={f.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink hover:border-primary hover:text-primary"
              >
                <span>📄</span>
                <span className="flex-1">{lang === 'he' ? f.titleHe || f.titleEn : f.titleEn || f.titleHe}</span>
                <span>⬇️</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
