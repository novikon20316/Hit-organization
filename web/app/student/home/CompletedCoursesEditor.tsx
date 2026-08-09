'use client';

// app/student/home/CompletedCoursesEditor.tsx
// Self-service editor for a student's completedCourses (subject + grade) —
// needed so a project prerequisite's minGrade (see lib/prerequisites.ts) can
// actually be checked against something real instead of just a course name.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { CompletedCourse } from '@/lib/prerequisites';

interface CompletedCoursesEditorProps {
  completedCourses: CompletedCourse[];
  onSaved: () => void;
}

export function CompletedCoursesEditor({ completedCourses, onSaved }: CompletedCoursesEditorProps) {
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<CompletedCourse[]>(completedCourses);
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Re-syncs the editable draft with the latest saved data every time the
  // panel is opened, so a prior unsaved edit never lingers into a later session.
  const open = () => {
    setRows(completedCourses);
    setSubject('');
    setGrade('');
    setError('');
    setExpanded(true);
  };

  const addRow = () => {
    const trimmed = subject.trim();
    if (!trimmed) return;
    const g = Number(grade);
    if (!Number.isFinite(g) || g < 0 || g > 100) {
      setError(lang === 'he' ? 'ציון חייב להיות בין 0 ל-100' : 'Grade must be between 0 and 100');
      return;
    }
    setRows((prev) => [...prev.filter((r) => r.subject !== trimmed), { subject: trimmed, grade: g }]);
    setSubject('');
    setGrade('');
    setError('');
  };

  const removeRow = (subj: string) => setRows((prev) => prev.filter((r) => r.subject !== subj));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await apiClient.updateCompletedCourses(rows.map((r) => ({ subject: r.subject, grade: r.grade ?? 0 })));
      setExpanded(false);
      onSaved();
    } catch {
      // Server error text is English-only — show a bilingual generic
      // message instead of surfacing it raw (client-side validation above
      // already covers the only case that would realistically fail here).
      setError(lang === 'he' ? 'שמירה נכשלה' : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-4 rounded-[var(--radius)] border border-line bg-surface p-4">
      <button type="button" onClick={() => (expanded ? setExpanded(false) : open())} className="flex w-full items-center justify-between text-start">
        <span className="text-sm font-semibold text-ink">
          📚 {lang === 'he' ? 'הקורסים שהשלמתי' : 'My Completed Courses'} ({completedCourses.length})
        </span>
        <span className="text-xs text-muted">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="mt-3 grid gap-2 border-t border-line pt-3">
          {rows.length === 0 && <p className="text-xs text-muted">{lang === 'he' ? 'לא נוספו קורסים עדיין' : 'No courses added yet'}</p>}
          {rows.map((r) => (
            <div key={r.subject} className="flex items-center justify-between rounded-lg bg-paper px-3 py-2 text-sm">
              <span className="text-ink">{r.subject}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">
                  {lang === 'he' ? 'ציון:' : 'Grade:'} {r.grade ?? '—'}
                </span>
                <button type="button" onClick={() => removeRow(r.subject)} className="text-danger hover:opacity-70">
                  ✕
                </button>
              </div>
            </div>
          ))}

          <div className="mt-1 flex gap-2">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={lang === 'he' ? 'שם הקורס' : 'Course name'}
              className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
            />
            <input
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              type="number"
              min={0}
              max={100}
              placeholder={lang === 'he' ? 'ציון' : 'Grade'}
              className="w-24 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={addRow}
              className="rounded-lg border border-primary px-3 py-2 text-xs font-semibold text-primary hover:bg-[#FBF3E3]"
            >
              + {lang === 'he' ? 'הוסף' : 'Add'}
            </button>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="mt-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
          >
            {saving ? '…' : lang === 'he' ? 'שמור' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
