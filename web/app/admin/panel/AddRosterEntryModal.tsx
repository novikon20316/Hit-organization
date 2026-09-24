'use client';

// app/admin/panel/AddRosterEntryModal.tsx
// Manual single-entry counterpart to BulkImportModal's Excel roster import —
// the "+" button on StudentRosterTab, for adding one approved student
// without building a file. Posts to POST /api/admin/student-roster (see
// server/src/services/studentRoster.ts's createApprovedStudentEntry).

import { useRef, useState, type FormEvent } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { VALID_FACULTY_IDS } from '@/lib/roles';
import { useModalA11y } from '@/hooks/useModalA11y';

interface AddRosterEntryModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const inputCls = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none';
const SELECTABLE_FACULTIES = VALID_FACULTY_IDS.filter((id) => id !== 'all') as FacultyId[];

export function AddRosterEntryModal({ onClose, onCreated }: AddRosterEntryModalProps) {
  const { lang } = useLanguage();
  const dialogRef = useRef<HTMLFormElement>(null);
  useModalA11y(dialogRef, true, onClose);

  const [studentId, setStudentId] = useState('');
  const [fullName, setFullName] = useState('');
  const [facultyId, setFacultyId] = useState<FacultyId>(SELECTABLE_FACULTIES[0]!);
  const [degreeType, setDegreeType] = useState<'bachelors' | 'masters'>('bachelors');
  const [major, setMajor] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{9}$/.test(studentId.trim())) {
      setError(lang === 'he' ? 'מספר ת.ז. חייב להיות בן 9 ספרות' : 'Student ID must be exactly 9 digits');
      return;
    }
    if (!fullName.trim()) {
      setError(lang === 'he' ? 'יש למלא שם מלא' : 'Full name is required');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await apiClient.createStudentRosterEntry({
        studentId: studentId.trim(),
        facultyId,
        degreeType,
        fullName: fullName.trim(),
        major: major.trim() || null,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'הוספת הרשומה נכשלה' : 'Failed to add the entry');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg outline-none"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'הוספת סטודנט מאושר' : 'Add Approved Student'}</h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          {lang === 'he'
            ? 'הסטודנט יופיע ברשימת המאושרים לרישום, גם ללא העלאת קובץ.'
            : 'Adds this student to the pre-registration allowlist without needing a file upload.'}
        </p>

        <div className="mt-4 grid gap-3.5">
          <Field label={lang === 'he' ? 'מספר ת.ז.' : 'Student ID'}>
            <input dir="ltr" value={studentId} onChange={(e) => setStudentId(e.target.value)} className={inputCls} maxLength={9} required />
          </Field>

          <Field label={lang === 'he' ? 'שם מלא' : 'Full Name'}>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} required />
          </Field>

          <Field label={lang === 'he' ? 'פקולטה' : 'Faculty'}>
            <select value={facultyId} onChange={(e) => setFacultyId(e.target.value as FacultyId)} className={inputCls}>
              {SELECTABLE_FACULTIES.map((id) => (
                <option key={id} value={id}>
                  {facultyLabel(id, lang)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={lang === 'he' ? 'תואר' : 'Degree'}>
            <select value={degreeType} onChange={(e) => setDegreeType(e.target.value as 'bachelors' | 'masters')} className={inputCls}>
              <option value="bachelors">{lang === 'he' ? 'תואר ראשון' : "Bachelor's"}</option>
              <option value="masters">{lang === 'he' ? 'תואר שני' : "Master's"}</option>
            </select>
          </Field>

          <Field label={lang === 'he' ? 'מגמה (אופציונלי)' : 'Major (optional)'}>
            <input value={major} onChange={(e) => setMajor(e.target.value)} className={inputCls} />
          </Field>
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:border-primary hover:text-primary"
          >
            {lang === 'he' ? 'ביטול' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
          >
            {submitting ? '…' : lang === 'he' ? 'הוסף' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}
