'use client';

// app/academic-year/page.tsx
// Lets system_admin / administrative_secretary correct or advance a
// student's yearOfStudy, and/or explicitly "keep them in the same academic
// year" (hold-back). Previously there was NO way to change yearOfStudy after
// account creation at all — a student stuck showing as ineligible had no
// path out even after actually reaching their final year (see
// server/src/controllers/userController.ts's computeIsEligible fix).

import { useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, ApiError, SoftError } from '@/lib/apiClient';
import type { AppRole } from '@/lib/roles';

const ACADEMIC_YEAR_ROLES: AppRole[] = ['system_admin', 'administrative_secretary'];

interface StudentResult {
  id: string;
  displayName: string;
  email: string;
  studentId: string;
  facultyId: string;
  degreeType: string | null;
  major: string | null;
  yearOfStudy: number | null;
  isEligibleForProcess: boolean;
  academicYearHeld: boolean;
  academicYearHeldReason: string | null;
}

export default function AcademicYearPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(ACADEMIC_YEAR_ROLES);
  const { lang, t } = useLanguage();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [results, setResults] = useState<StudentResult[]>([]);
  const [selected, setSelected] = useState<StudentResult | null>(null);

  const handleSearch = async () => {
    if (query.trim().length < 2) {
      setSearchError(lang === 'he' ? 'הזן לפחות 2 תווים' : 'Enter at least 2 characters');
      return;
    }
    setSearching(true);
    setSearchError('');
    try {
      const res = await apiClient.searchStudents(query.trim());
      setResults(res.students ?? []);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : lang === 'he' ? 'החיפוש נכשל' : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  return (
    <DashboardShell
      title={lang === 'he' ? 'ניהול שנת לימודים' : 'Academic Year Management'}
      subtitle={lang === 'he' ? 'עדכון שנת לימודים או השארת סטודנט באותה שנה' : "Correct a student's year, or keep them in the same academic year"}
    >
      <div className="mb-4 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder={lang === 'he' ? 'חפש לפי שם, אימייל או ת.ז. סטודנט' : 'Search by name, email, or student ID'}
          className="w-full max-w-md rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
        >
          {searching ? '…' : lang === 'he' ? 'חיפוש' : 'Search'}
        </button>
      </div>

      {searchError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{searchError}</p>}

      <div className="grid gap-2 sm:grid-cols-2">
        {results.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSelected(s)}
            className={`rounded-[var(--radius)] border p-3 text-start hover:border-primary ${
              selected?.id === s.id ? 'border-primary bg-primary/5' : 'border-line bg-surface'
            }`}
          >
            <p className="text-sm font-semibold text-ink">{s.displayName}</p>
            <p className="mt-0.5 text-xs text-muted">{s.email} {s.studentId ? `· ${s.studentId}` : ''}</p>
            <p className="mt-1 text-xs text-muted">
              {s.degreeType ?? '—'} · {lang === 'he' ? 'שנה' : 'Year'} {s.yearOfStudy ?? '—'}
              {s.academicYearHeld && ` · 🔒 ${lang === 'he' ? 'נשאר באותה שנה' : 'Held back'}`}
            </p>
          </button>
        ))}
      </div>

      {selected && (
        <EditAcademicYearForm
          key={selected.id}
          student={selected}
          onSaved={(updated) => {
            setResults((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
            setSelected(updated);
          }}
        />
      )}
    </DashboardShell>
  );
}

function EditAcademicYearForm({
  student, onSaved,
}: {
  student: StudentResult;
  onSaved: (updated: StudentResult) => void;
}) {
  const { lang, t } = useLanguage();
  const [yearOfStudy, setYearOfStudy] = useState(String(student.yearOfStudy ?? ''));
  const [heldBack, setHeldBack] = useState(student.academicYearHeld);
  const [reason, setReason] = useState(student.academicYearHeldReason ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    const parsedYear = yearOfStudy.trim() ? Number(yearOfStudy) : undefined;
    if (parsedYear !== undefined && (!Number.isInteger(parsedYear) || parsedYear < 1)) {
      setError(lang === 'he' ? 'שנת לימודים לא תקינה' : 'Invalid year of study');
      return;
    }
    if (heldBack && !reason.trim()) {
      setError(lang === 'he' ? 'יש לציין סיבה להשארה באותה שנה' : 'A reason is required to hold the student back');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.updateStudentAcademicYear(student.id, {
        yearOfStudy: parsedYear,
        heldBack,
        reason: reason.trim() || undefined,
      });
      onSaved({
        ...student,
        yearOfStudy: parsedYear ?? student.yearOfStudy,
        academicYearHeld: heldBack,
        academicYearHeldReason: heldBack ? reason.trim() : null,
      });
    } catch (err) {
      setError(err instanceof ApiError || err instanceof SoftError ? err.message : lang === 'he' ? 'העדכון נכשל' : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 max-w-md rounded-[var(--radius)] border border-line bg-surface p-5">
      <p className="text-sm font-semibold text-ink">{student.displayName}</p>
      <p className="mt-0.5 text-xs text-muted">
        {lang === 'he' ? 'זכאות נוכחית לתהליך:' : 'Currently eligible for process:'}{' '}
        <span className={student.isEligibleForProcess ? 'text-success' : 'text-danger'}>
          {student.isEligibleForProcess ? (lang === 'he' ? 'כן' : 'Yes') : (lang === 'he' ? 'לא' : 'No')}
        </span>
      </p>

      <label className="mt-3 block">
        <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'שנת לימודים' : 'Year of study'}</span>
        <input
          type="number"
          min={1}
          value={yearOfStudy}
          onChange={(e) => setYearOfStudy(e.target.value)}
          className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
        />
      </label>

      <label className="mt-3 flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={heldBack} onChange={(e) => setHeldBack(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
        {lang === 'he' ? 'השאר את הסטודנט/ית באותה שנה (לא לקדם)' : 'Keep this student in the same academic year (do not advance)'}
      </label>

      {heldBack && (
        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'סיבה' : 'Reason'}</span>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
          />
        </label>
      )}

      {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
      >
        {saving ? '…' : t('save')}
      </button>
    </div>
  );
}
