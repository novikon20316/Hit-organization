'use client';

// app/student/home/CompletedCoursesList.tsx
// Read-only view of a student's completedCourses (subject + grade), so a
// project prerequisite's minGrade (see lib/prerequisites.ts) can be checked
// against something real. Students can no longer self-report entries here —
// that was trivially falsifiable — so this only ever reflects courses a
// system_admin entered manually or that were AI-extracted from a transcript
// during application review (see server/src/controllers/applicationController.ts).

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { CompletedCourse } from '@/lib/prerequisites';

interface CompletedCoursesListProps {
  completedCourses: CompletedCourse[];
}

export function CompletedCoursesList({ completedCourses }: CompletedCoursesListProps) {
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-4 rounded-[var(--radius)] border border-line bg-surface p-4">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between text-start">
        <span className="text-sm font-semibold text-ink">
          📚 {lang === 'he' ? 'הקורסים שהשלמתי' : 'My Completed Courses'} ({completedCourses.length})
        </span>
        <span className="text-xs text-muted">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="mt-3 grid gap-2 border-t border-line pt-3">
          {completedCourses.length === 0 && (
            <p className="text-xs text-muted">
              {lang === 'he' ? 'טרם נרשמו קורסים שהושלמו' : 'No completed courses on record yet'}
            </p>
          )}
          {completedCourses.map((r) => (
            <div key={r.subject} className="flex items-center justify-between rounded-lg bg-paper px-3 py-2 text-sm">
              <span className="text-ink">{r.subject}</span>
              <span className="text-xs text-muted">
                {lang === 'he' ? 'ציון:' : 'Grade:'} {r.grade ?? '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
