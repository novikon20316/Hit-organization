'use client';

// app/admin/panel/NewUserModal.tsx
// Ported from mobile's NewUserModal + panel.tsx's handleCreateUser — same
// validation, same POST /api/admin/users/create payload shape.

import { useMemo, useState, type FormEvent } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { CROSS_FACULTY_ROLES, VALID_ROLES, type AppRole } from '@/lib/roles';
import { roleLabel, facultyLabel } from '@/lib/i18n';
import { VALID_FACULTY_IDS } from '@/lib/roles';
import { HIT_FACULTIES } from '@/lib/faculties';

interface NewUserModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const SELECTABLE_FACULTIES = VALID_FACULTY_IDS.filter((id) => id !== 'all');

export function NewUserModal({ open, onClose, onCreated }: NewUserModalProps) {
  const { lang } = useLanguage();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<AppRole>('student');
  const [facultyId, setFacultyId] = useState('');
  const [degreeType, setDegreeType] = useState<'bachelors' | 'masters'>('bachelors');
  const [major, setMajor] = useState('');
  const [yearOfStudy, setYearOfStudy] = useState('1');
  const [studentId, setStudentId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isStudent = role === 'student';
  const isCrossFaculty = CROSS_FACULTY_ROLES.includes(role);

  const majorOptions = useMemo(() => {
    const faculty = HIT_FACULTIES.find((f) => f.key === facultyId);
    if (!faculty) return [];
    const seen = new Set<string>();
    return faculty.programs.filter((p) => p.level === degreeType && !seen.has(p.slug) && seen.add(p.slug));
  }, [facultyId, degreeType]);

  const reset = () => {
    setName('');
    setEmail('');
    setPhone('');
    setRole('student');
    setFacultyId('');
    setDegreeType('bachelors');
    setMajor('');
    setYearOfStudy('1');
    setStudentId('');
    setError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(lang === 'he' ? 'יש למלא שם' : 'Name is required');
      return;
    }
    if (!email.trim()) {
      setError(lang === 'he' ? 'יש למלא אימייל' : 'Email is required');
      return;
    }
    if (!isCrossFaculty && !facultyId) {
      setError(lang === 'he' ? 'יש לבחור פקולטה' : 'Please select a faculty');
      return;
    }
    if (isStudent && !major) {
      setError(lang === 'he' ? 'יש לבחור מגמה' : 'Please select a major');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await apiClient.createAdminUser({
        displayName: name.trim(),
        email: email.trim().toLowerCase(),
        phoneNumber: phone.trim() || null,
        role,
        facultyId: isCrossFaculty ? 'all' : facultyId,
        degreeType: isStudent ? degreeType : null,
        yearOfStudy: isStudent ? parseInt(yearOfStudy, 10) || 1 : null,
        major: isStudent ? major : null,
        studentId: isStudent ? studentId.trim() || null : null,
      });
      reset();
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'יצירת המשתמש נכשלה' : 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'משתמש חדש' : 'New User'}</h2>

        <div className="mt-4 grid gap-4">
          <Field label={lang === 'he' ? 'שם מלא' : 'Full Name'}>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required />
          </Field>

          <Field label={lang === 'he' ? 'דוא"ל' : 'Email'}>
            <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} required />
          </Field>

          <Field label={lang === 'he' ? 'טלפון (אופציונלי)' : 'Phone (optional)'}>
            <input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </Field>

          <Field label={lang === 'he' ? 'תפקיד' : 'Role'}>
            <select value={role} onChange={(e) => setRole(e.target.value as AppRole)} className={inputCls}>
              {VALID_ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r, lang)}
                </option>
              ))}
            </select>
          </Field>

          {!isCrossFaculty && (
            <Field label={lang === 'he' ? 'פקולטה' : 'Faculty'}>
              <select
                value={facultyId}
                onChange={(e) => {
                  setFacultyId(e.target.value);
                  setMajor('');
                }}
                className={inputCls}
              >
                <option value="">{lang === 'he' ? 'בחר פקולטה' : 'Select faculty'}</option>
                {SELECTABLE_FACULTIES.map((id) => (
                  <option key={id} value={id}>
                    {facultyLabel(id, lang)}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {isStudent && (
            <>
              <Field label={lang === 'he' ? 'תואר' : 'Degree'}>
                <select
                  value={degreeType}
                  onChange={(e) => {
                    setDegreeType(e.target.value as 'bachelors' | 'masters');
                    setMajor('');
                  }}
                  className={inputCls}
                >
                  <option value="bachelors">{lang === 'he' ? 'תואר ראשון' : "Bachelor's"}</option>
                  <option value="masters">{lang === 'he' ? 'תואר שני' : "Master's"}</option>
                </select>
              </Field>

              <Field label={lang === 'he' ? 'מגמה' : 'Major'}>
                <select value={major} onChange={(e) => setMajor(e.target.value)} className={inputCls} disabled={!facultyId}>
                  <option value="">{lang === 'he' ? 'בחר מגמה' : 'Select major'}</option>
                  {majorOptions.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.label[lang]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={lang === 'he' ? 'שנת לימודים' : 'Year of Study'}>
                <select value={yearOfStudy} onChange={(e) => setYearOfStudy(e.target.value)} className={inputCls}>
                  {[1, 2, 3, 4].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={lang === 'he' ? 'מספר סטודנט (אופציונלי)' : 'Student ID (optional)'}>
                <input dir="ltr" value={studentId} onChange={(e) => setStudentId(e.target.value)} className={inputCls} />
              </Field>
            </>
          )}
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper"
          >
            {lang === 'he' ? 'ביטול' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
          >
            {submitting ? '…' : lang === 'he' ? 'צור משתמש' : 'Create User'}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none disabled:opacity-60';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}
