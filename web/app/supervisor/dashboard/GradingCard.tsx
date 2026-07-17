'use client';

// app/supervisor/dashboard/GradingCard.tsx
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getFacultyColor } from '@/lib/facultyColors';
import { MILESTONE_LABEL, type SupervisorPendingMilestone } from './types';

interface GradingCardProps {
  milestone: SupervisorPendingMilestone;
  onGrade: (milestone: SupervisorPendingMilestone) => void;
}

export function GradingCard({ milestone: m, onGrade }: GradingCardProps) {
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const facultyColor = getFacultyColor(m.facultyId);
  const label = MILESTONE_LABEL[m.type]?.[lang] ?? m.type;

  const timing = (() => {
    if (!m.dueDate || !m.submittedAt) return null;
    const diffDays = Math.ceil((new Date(m.dueDate).getTime() - new Date(m.submittedAt).getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 0) return { text: lang === 'he' ? `✅ הוגש בזמן (${diffDays} ימים מוקדם)` : `✅ Submitted on time (${diffDays} days early)`, color: 'var(--success)' };
    if (diffDays === 0) return { text: lang === 'he' ? '✅ הוגש ביום היעד' : '✅ Submitted on due date', color: 'var(--accent)' };
    return { text: lang === 'he' ? `⚠️ איחור של ${Math.abs(diffDays)} ימים` : `⚠️ ${Math.abs(diffDays)} days overdue`, color: 'var(--danger)' };
  })();

  return (
    <div className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': facultyColor } as React.CSSProperties}>
      <button type="button" onClick={() => setExpanded((v) => !v)} className="w-full text-start">
        <p className="text-xs font-semibold" style={{ color: facultyColor }}>
          {label}
        </p>
        <p className="mt-1 text-sm font-semibold text-ink">📁 {lang === 'he' ? m.projectTitleHe : m.projectTitleEn}</p>
        <p className="mt-0.5 text-xs text-muted">👤 {m.studentNames.join(', ')}</p>
        {!expanded && m.fileUrls.length > 0 && (
          <p className="mt-1 text-xs text-muted">
            📎 {m.fileUrls.length} {lang === 'he' ? 'קבצים מצורפים' : 'files attached'}
          </p>
        )}
      </button>

      {expanded && (
        <div className="mt-3 grid gap-2 border-t border-line pt-3">
          {timing && <p className="text-xs font-medium" style={{ color: timing.color }}>{timing.text}</p>}
          {m.submissionNote && <p className="text-xs text-ink">💬 {m.submissionNote}</p>}

          {m.fileUrls.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {m.fileUrls.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-[#3E6C8C] bg-[#E9F0F5] px-2.5 py-1 text-xs font-medium text-[#3E6C8C]"
                >
                  📥 {lang === 'he' ? `הורד קובץ ${i + 1}` : `Download File ${i + 1}`}
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs italic text-muted">{lang === 'he' ? 'אין קבצים מצורפים להורדה' : 'No attached files available'}</p>
          )}

          <button
            type="button"
            onClick={() => onGrade(m)}
            className="mt-1 rounded-lg px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
            style={{ backgroundColor: facultyColor }}
          >
            ✏️ {lang === 'he' ? 'תן ציון' : 'Grade'}
          </button>
        </div>
      )}
    </div>
  );
}
