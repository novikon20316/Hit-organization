'use client';

// app/faculty_admin/dashboard/EnrollStudentModal.tsx
import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import type { FacultyAdminProjectRecord, FacultyAdminUserRecord } from './types';

interface EnrollStudentModalProps {
  project: FacultyAdminProjectRecord;
  availableStudents: FacultyAdminUserRecord[];
  onClose: () => void;
  onEnrolled: () => void;
}

export function EnrollStudentModal({ project, availableStudents, onClose, onEnrolled }: EnrollStudentModalProps) {
  const { lang, t } = useLanguage();
  const [studentId, setStudentId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);

  const handleEnroll = async () => {
    if (!studentId) {
      setError(lang === 'he' ? 'יש לבחור סטודנט' : 'Please select a student');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await apiClient.enrollStudentToProject(project.id, studentId);
      onEnrolled();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שיוך הסטודנט נכשל' : 'Failed to enroll student');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-[var(--radius)] bg-surface p-6 shadow-lg outline-none"
      >
        <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'שיוך סטודנט לפרויקט' : 'Enroll Student in Project'}</h2>
        <p className="mt-1 text-sm text-muted">{lang === 'he' ? project.titleHe : project.titleEn}</p>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'סטודנט (ללא פרויקט פעיל)' : 'Student (no active project)'}</span>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
          >
            <option value="">{lang === 'he' ? 'בחר סטודנט' : 'Select student'}</option>
            {availableStudents.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName} — {s.email}
              </option>
            ))}
          </select>
        </label>

        {availableStudents.length === 0 && (
          <p className="mt-2 text-xs text-muted">{lang === 'he' ? 'אין סטודנטים ללא פרויקט בפקולטה' : 'No project-less students in this faculty'}</p>
        )}

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleEnroll}
            disabled={submitting}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
          >
            {submitting ? '…' : lang === 'he' ? 'שייך' : 'Enroll'}
          </button>
        </div>
      </div>
    </div>
  );
}
