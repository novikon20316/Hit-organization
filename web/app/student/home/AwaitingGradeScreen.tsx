'use client';

// app/student/home/AwaitingGradeScreen.tsx
// Shown when studentState === 'awaiting_grade' — a coordinator_gated masters
// computer_science student whose program_head/administrative coordinator
// hasn't entered a grade average yet (see config/studentTrack.ts). Distinct
// from an average below the thesis threshold, which falls straight through
// to the normal project-track browse UI instead of showing anything here.

import { useLanguage } from '@/contexts/LanguageContext';

export function AwaitingGradeScreen() {
  const { lang } = useLanguage();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-[var(--radius)] border border-accent bg-[#FBF3E3] p-5">
        <p className="mb-2 text-2xl">⏳</p>
        <p className="text-base font-bold text-ink">
          {lang === 'he' ? 'עוד לא הוזן לך ממוצע' : "Your average grade hasn't been entered yet."}
        </p>
      </div>
    </div>
  );
}
