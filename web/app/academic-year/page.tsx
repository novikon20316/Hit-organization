'use client';

// app/academic-year/page.tsx
// Lets system_admin / administrative coordinator correct or advance a
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
  completedCourses: { subject: string; grade?: number }[];
  trackPolicy: 'coordinator_gated' | 'signup_choice' | 'project_only';
  track: 'thesis' | 'project' | null;
  trackLocked: boolean;
  thesisEligibility: { eligible: boolean } | null;
}

export default function AcademicYearPage() {
  const { loading: guardLoading, isAllowed, userData } = useRequireRole(ACADEMIC_YEAR_ROLES);
  const { lang, t } = useLanguage();
  // Manual completed-courses editing is system_admin only, for now — unlike
  // the academic-year editor above, NOT extended to administrative_secretary.
  const isSystemAdmin = userData?.role === 'system_admin' || (userData?.roles ?? []).includes('system_admin');

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

      {searchError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{searchError}</p>}

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

      {selected && isSystemAdmin && (
        <EditCompletedCoursesForm
          key={`${selected.id}-courses`}
          student={selected}
          onSaved={(updated) => {
            setResults((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
            setSelected(updated);
          }}
        />
      )}

      {selected && isSystemAdmin && (
        <EditTrackForm
          key={`${selected.id}-track`}
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

      {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

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

// Manual stopgap, system_admin only — the real path is automatic (see
// applicationController.ts's mergeExtractedGradesIntoCompletedCourses, which
// reads grades straight off a transcript the student already uploaded).
// This exists for courses that pass never saw.
function EditCompletedCoursesForm({
  student, onSaved,
}: {
  student: StudentResult;
  onSaved: (updated: StudentResult) => void;
}) {
  const { lang } = useLanguage();
  const [rows, setRows] = useState<{ subject: string; grade?: number }[]>(student.completedCourses);
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = rows.map((r) => ({ subject: r.subject, grade: r.grade ?? 0 }));
      await apiClient.updateStudentCompletedCoursesAsAdmin(student.id, payload);
      onSaved({ ...student, completedCourses: payload });
    } catch {
      // Server error text is English-only — show a bilingual generic
      // message instead of surfacing it raw (client-side validation above
      // already covers the only case that would realistically fail here).
      setError(lang === 'he' ? 'העדכון נכשל' : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 max-w-md rounded-[var(--radius)] border border-line bg-surface p-5">
      <p className="text-sm font-semibold text-ink">
        📚 {lang === 'he' ? 'עריכת קורסים שהושלמו' : 'Edit Completed Courses'} — {student.displayName}
      </p>
      <p className="mt-1 text-xs text-muted">
        {lang === 'he'
          ? 'עריכה ידנית זו זמינה למנהל מערכת בלבד, כפתרון זמני עד שכל הציונים ייקלטו אוטומטית מגיליון ציונים.'
          : "Manual editing, system_admin only, as a stopgap until every grade is picked up automatically from a gradesheet."}
      </p>

      <div className="mt-3 grid gap-2">
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
      </div>

      {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
      >
        {saving ? '…' : lang === 'he' ? 'שמור' : 'Save'}
      </button>
    </div>
  );
}

// Rare escape hatch, system_admin only — see server/src/services/
// studentTrack.ts's adminOverrideStudentTrack. Bypasses the normal signup/
// coordinator-eligibility business rules entirely; use only to fix a stuck
// or wrong track state (e.g. undoing a coordinator's reversal).
function EditTrackForm({
  student, onSaved,
}: {
  student: StudentResult;
  onSaved: (updated: StudentResult) => void;
}) {
  const { lang } = useLanguage();
  const [track, setTrack] = useState<'thesis' | 'project' | ''>(student.track ?? '');
  const [trackLocked, setTrackLocked] = useState(student.trackLocked);
  const [thesisEligible, setThesisEligible] = useState(student.thesisEligibility?.eligible ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await apiClient.overrideStudentTrack(student.id, {
        track: track || null,
        trackLocked,
        thesisEligible: student.trackPolicy === 'coordinator_gated' ? thesisEligible : undefined,
      });
      onSaved({
        ...student,
        track: track || null,
        trackLocked,
        thesisEligibility: student.trackPolicy === 'coordinator_gated' ? { eligible: thesisEligible } : student.thesisEligibility,
      });
    } catch (err) {
      setError(err instanceof ApiError || err instanceof SoftError ? err.message : lang === 'he' ? 'העדכון נכשל' : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 max-w-md rounded-[var(--radius)] border border-line bg-surface p-5">
      <p className="text-sm font-semibold text-ink">
        🧭 {lang === 'he' ? 'עקיפת מסלול (תזה/פרויקט)' : 'Override Track (Thesis/Project)'} — {student.displayName}
      </p>
      <p className="mt-1 text-xs text-muted">
        {lang === 'he'
          ? 'פתח חירום, מנהל מערכת בלבד — עוקף את כללי ההרשמה/אישור הרכז הרגילים.'
          : 'Emergency escape hatch, system_admin only — bypasses the normal signup/coordinator-approval rules.'}
      </p>

      <label className="mt-3 block">
        <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'מסלול' : 'Track'}</span>
        <select
          value={track}
          onChange={(e) => setTrack(e.target.value as 'thesis' | 'project' | '')}
          className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
        >
          <option value="">{lang === 'he' ? '(לא נבחר)' : '(not set)'}</option>
          <option value="thesis">{lang === 'he' ? 'תזה' : 'Thesis'}</option>
          <option value="project">{lang === 'he' ? 'פרויקט' : 'Project'}</option>
        </select>
      </label>

      <label className="mt-3 flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={trackLocked} onChange={(e) => setTrackLocked(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
        {lang === 'he' ? 'נעל מסלול (הסטודנט לא יוכל לשנות בעצמו)' : "Lock track (student can't change it themselves)"}
      </label>

      {student.trackPolicy === 'coordinator_gated' && (
        <label className="mt-3 flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={thesisEligible} onChange={(e) => setThesisEligible(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
          {lang === 'he' ? 'זכאי/ת לתזה' : 'Thesis-eligible'}
        </label>
      )}

      {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
      >
        {saving ? '…' : lang === 'he' ? 'שמור' : 'Save'}
      </button>
    </div>
  );
}
