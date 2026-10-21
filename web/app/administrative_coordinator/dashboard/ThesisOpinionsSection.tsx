'use client';

// app/administrative_coordinator/dashboard/ThesisOpinionsSection.tsx
// The administrative coordinator's queue for the thesis examiner opinion
// form (see components/ExaminerOpinionForm.tsx and server's
// examinerOpinionController.ts): theses whose examiners have all answered —
// approved (she enters and approves the final grade) or returned (she and
// the supervisor update the student, and she can send it back for
// corrections). Shown under the grade-overrides list, so every grade
// waiting for her is in one tab.

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, type ThesisOpinionQueueItem } from '@/lib/apiClient';
import { ExaminerOpinionFormModal } from '@/components/ExaminerOpinionFormModal';

const OUTCOME_LABEL = {
  continue: { he: '✅ הבוחנים אישרו — יש להזין ציון סופי', en: '✅ Examiners approved — enter the final grade', color: 'var(--success)' },
  revise: { he: '✏️ בוחן/ת ביקש/ה תיקונים מהותיים', en: '✏️ An examiner requested major corrections', color: 'var(--accent)' },
  reject: { he: '⛔ בוחן/ת קבע/ה שהעבודה אינה ראויה', en: '⛔ An examiner found the thesis not acceptable', color: 'var(--danger)' },
} as const;

export function ThesisOpinionsSection() {
  const { lang } = useLanguage();
  const he = lang === 'he';
  const [items, setItems] = useState<ThesisOpinionQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openFor, setOpenFor] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return apiClient.getThesisOpinionQueue()
      .then((res) => { setItems(res.items); setError(''); })
      .catch((err) => setError(err instanceof Error ? err.message : he ? 'לא ניתן לטעון נתונים' : 'Could not load data'))
      .finally(() => setLoading(false));
  }, [he]);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="mt-8" aria-labelledby="thesis-opinions-title">
      <h2 id="thesis-opinions-title" className="text-base font-semibold text-administrative-coordinator-on-surface">
        {he ? 'עבודות תזה — חוות דעת בוחנים' : 'Theses — examiner opinions'}
      </h2>
      {loading ? (
        <p className="mt-2 text-sm text-administrative-coordinator-on-surface-variant">…</p>
      ) : error ? (
        <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-sm text-administrative-coordinator-on-surface-variant">✅ {he ? 'אין עבודות תזה הממתינות לטיפולך' : 'No theses awaiting your action'}</p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const outcome = OUTCOME_LABEL[item.outcome];
            return (
              <div key={item.milestoneId} className="role-rail rounded-administrative-coordinator border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-lowest p-4" style={{ '--rail-color': outcome.color } as React.CSSProperties}>
                <p className="text-sm font-semibold text-administrative-coordinator-on-surface">{he ? item.projectTitleHe : item.projectTitleEn}</p>
                <p className="mt-0.5 text-xs text-administrative-coordinator-on-surface-variant">👤 {item.students.map((s) => s.name).join(', ')}</p>
                <p className="mt-2 text-sm font-medium" style={{ color: outcome.color }}>{he ? outcome.he : outcome.en}</p>
                {item.round > 1 && <p className="text-xs text-administrative-coordinator-on-surface-variant">{he ? `סבב בדיקה ${item.round}` : `Review round ${item.round}`}</p>}
                <button
                  type="button"
                  onClick={() => setOpenFor(item.milestoneId)}
                  className="mt-3 w-full rounded-lg bg-administrative-coordinator-primary px-2.5 py-1.5 text-xs font-semibold text-administrative-coordinator-on-primary hover:bg-administrative-coordinator-primary-container"
                >
                  {item.outcome === 'continue'
                    ? (he ? '📄 פתח/י טופס והזן/י ציון' : '📄 Open the form and enter the grade')
                    : (he ? '📄 פתח/י חוות דעת וטפל/י' : '📄 Open the opinions and act')}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {openFor && <ExaminerOpinionFormModal milestoneId={openFor} onClose={() => setOpenFor(null)} onChanged={load} />}
    </section>
  );
}
