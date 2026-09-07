'use client';

// app/student/home/NoProjectTabPlaceholder.tsx
// Shown on the Milestones/Grades tabs (see ../navSections.ts) while
// studentState is 'no_project'/'choose_supervisor' — before this feature,
// those tabs just re-rendered the same BrowseProjects/BrowseSupervisors
// screen as Overview (the `tab` query param was never actually consulted
// in that state — see page.tsx), which reads as "the app is stuck showing
// the same screen" rather than explaining that milestones/grades don't
// exist yet because no project/thesis has been picked.

import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import type { DegreeType } from './types';
import type { StudentTrack } from '@/lib/studentTrack';

interface NoProjectTabPlaceholderProps {
  tab: 'milestones' | 'grades';
  studentDegree: DegreeType;
  studentTrack: StudentTrack | null;
}

export function NoProjectTabPlaceholder({ tab, studentDegree, studentTrack }: NoProjectTabPlaceholderProps) {
  const { lang } = useLanguage();

  // Bachelor's only ever has a Final Project. Master's can be either — named
  // specifically once the student's track is actually known (chosen at
  // signup, or resolved by a coordinator later), and generically ("Final
  // Project / Thesis") while it's still an open question.
  const trackLabel =
    studentDegree === 'bachelors'
      ? { he: 'פרויקט גמר', en: 'Final Project' }
      : studentTrack === 'thesis'
        ? { he: 'תזה', en: 'Thesis' }
        : studentTrack === 'project'
          ? { he: 'פרויקט גמר', en: 'Final Project' }
          : { he: 'פרויקט גמר / תזה', en: 'Final Project / Thesis' };

  const icon = tab === 'milestones' ? '🏁' : '🎓';
  const bodyHe =
    tab === 'milestones'
      ? 'אבני הדרך שלך יופיעו כאן לאחר שתתחיל בתהליך.'
      : 'הציונים שלך יופיעו כאן לאחר שתתחיל בתהליך.';
  const bodyEn =
    tab === 'milestones'
      ? 'Your milestones will show up here once your process starts.'
      : 'Your grades will show up here once your process starts.';

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-[var(--radius)] border border-line bg-surface p-8 text-center">
        <p className="mb-2 text-3xl">{icon}</p>
        <p className="mb-1.5 text-base font-bold text-ink">
          {lang === 'he' ? `עדיין אין לך ${trackLabel.he} נבחר` : `You don't have a ${trackLabel.en} chosen yet`}
        </p>
        <p className="mb-4 text-sm text-muted">{lang === 'he' ? bodyHe : bodyEn}</p>
        <Link
          href="/student/home"
          className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
        >
          {lang === 'he' ? 'עבור לסקירה' : 'Go to Overview'}
        </Link>
      </div>
    </div>
  );
}
