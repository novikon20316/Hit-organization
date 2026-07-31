'use client';

// app/admin/panel/NewUserModal.tsx
// Ported from mobile's NewUserModal + panel.tsx's handleCreateUser — same
// validation, same POST /api/admin/users/create payload shape.

import { useMemo, useState, type FormEvent } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { CROSS_FACULTY_ROLES, VALID_ROLES, type AppRole } from '@/lib/roles';
import { roleLabel, facultyLabel, tx } from '@/lib/i18n';
import { VALID_FACULTY_IDS } from '@/lib/roles';
import { HIT_FACULTIES } from '@/lib/faculties';
import { majorsForFaculty } from '@/lib/permissions';

interface NewUserModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** Narrows this modal for a delegate (faculty_admin/program_head/
   *  grad_school_head) instead of system_admin: only these roles are
   *  selectable, and facultyId is locked to (and hidden, pre-filled with)
   *  the delegate's own faculty — omit `lockedFacultyId` for
   *  grad_school_head, who can create staff in any faculty. Enforced for
   *  real server-side by createAdminUser's delegate scope check — this is
   *  just so the form doesn't even offer an option the server would reject. */
  scope?: { selectableRoles: AppRole[]; lockedFacultyId?: string };
}

const SELECTABLE_FACULTIES = VALID_FACULTY_IDS.filter((id) => id !== 'all');

// Client-side convenience default only — purely cosmetic. The real
// generate-if-blank behavior always happens server-side (generateTempPassword
// in services/userImportExport.ts); this just gives the admin something
// readable to start from if they click "Generate" instead of typing their own.
function generateReadableTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${out}Aa1!`;
}

export function NewUserModal({ open, onClose, onCreated, scope }: NewUserModalProps) {
  const { lang } = useLanguage();
  const roleOptions = scope?.selectableRoles ?? VALID_ROLES;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<AppRole>(roleOptions[0] ?? 'student');
  const [facultyId, setFacultyId] = useState(scope?.lockedFacultyId ?? '');
  const [degreeType, setDegreeType] = useState<'bachelors' | 'masters'>('bachelors');
  const [major, setMajor] = useState('');
  const [yearOfStudy, setYearOfStudy] = useState('1');
  const [studentId, setStudentId] = useState('');
  const [assignedMajors, setAssignedMajors] = useState<string[]>([]);
  const [tempPassword, setTempPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Set once the create call succeeds — switches the modal into a success
  // view showing the (server-resolved) temp password so the admin can copy
  // it before dismissing. Matters most when they left the field blank.
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const isStudent = role === 'student';
  const isCrossFaculty = CROSS_FACULTY_ROLES.includes(role);
  const isSupervisorLike = role === 'supervisor' || role === 'secondary_supervisor';

  const majorOptions = useMemo(() => {
    const faculty = HIT_FACULTIES.find((f) => f.key === facultyId);
    if (!faculty) return [];
    const seen = new Set<string>();
    return faculty.programs.filter((p) => p.level === degreeType && !seen.has(p.slug) && seen.add(p.slug));
  }, [facultyId, degreeType]);

  // Some faculties only offer one degree level (e.g. data_science is
  // masters-only, medical_tech is bachelors-only) — lock the degree selector
  // to that level instead of letting the admin pick the other one and get an
  // empty major list. No faculty selected yet → both levels stay available.
  const availableDegreeLevels = useMemo((): Array<'bachelors' | 'masters'> => {
    const faculty = HIT_FACULTIES.find((f) => f.key === facultyId);
    if (!faculty) return ['bachelors', 'masters'];
    return Array.from(new Set(faculty.programs.map((p) => p.level)));
  }, [facultyId]);

  // Deduped across degree levels — unlike majorOptions above, which is
  // filtered per degree level for the student major picker.
  const assignedMajorOptions = useMemo(() => majorsForFaculty(facultyId), [facultyId]);

  const toggleAssignedMajor = (slug: string) => {
    setAssignedMajors((prev) => (prev.includes(slug) ? prev.filter((m) => m !== slug) : [...prev, slug]));
  };

  const reset = () => {
    setName('');
    setEmail('');
    setPhone('');
    setRole(roleOptions[0] ?? 'student');
    setFacultyId(scope?.lockedFacultyId ?? '');
    setDegreeType('bachelors');
    setMajor('');
    setYearOfStudy('1');
    setStudentId('');
    setAssignedMajors([]);
    setTempPassword('');
    setError('');
    setCreated(null);
    setCopied(false);
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
      const trimmedEmail = email.trim().toLowerCase();
      const result = await apiClient.createAdminUser({
        displayName: name.trim(),
        email: trimmedEmail,
        phoneNumber: phone.trim() || null,
        role,
        facultyId: isCrossFaculty ? 'all' : facultyId,
        degreeType: isStudent ? degreeType : null,
        yearOfStudy: isStudent ? parseInt(yearOfStudy, 10) || 1 : null,
        major: isStudent ? major : null,
        studentId: isStudent ? studentId.trim() || null : null,
        tempPassword: tempPassword.trim() || undefined,
        assignedMajors: isSupervisorLike ? assignedMajors : undefined,
      });
      onCreated();
      // Keep the modal open to show the confirmation screen — reset() (and
      // the actual close) only happens once the admin dismisses it, so a
      // blank field's server-generated password isn't lost.
      setCreated({ email: trimmedEmail, tempPassword: result.tempPassword });
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'יצירת המשתמש נכשלה' : 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismissSuccess = () => {
    reset();
    onClose();
  };

  const handleCopyPassword = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable/denied — the value is still visible on
      // screen for the admin to select and copy manually.
    }
  };

  if (!open) return null;

  if (created) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-lg rounded-[var(--radius)] bg-surface p-6 shadow-lg">
          <h2 className="text-lg font-semibold text-ink">✅ {tx('adminUserCreatedTitle', lang)}</h2>

          <div className="mt-4 grid gap-3 rounded-lg border border-line bg-paper p-4">
            <div>
              <span className="block text-xs font-medium text-muted">{lang === 'he' ? 'דוא"ל' : 'Email'}</span>
              <span dir="ltr" className="block text-sm text-ink">{created.email}</span>
            </div>
            <div>
              <span className="block text-xs font-medium text-muted">{lang === 'he' ? 'סיסמה זמנית' : 'Temporary Password'}</span>
              <div className="mt-1 flex items-center gap-2">
                <code dir="ltr" className="flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
                  {created.tempPassword}
                </code>
                <button
                  type="button"
                  onClick={handleCopyPassword}
                  className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-surface"
                >
                  {copied ? tx('adminCopied', lang) : tx('adminCopyPassword', lang)}
                </button>
              </div>
            </div>
          </div>

          <p className="mt-3 text-sm text-muted">
            {lang === 'he'
              ? 'המשתמש יתבקש להחליף את הסיסמה הזמנית בכניסה הראשונה.'
              : 'The user will be required to change this temporary password on first login.'}
          </p>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={handleDismissSuccess}
              className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
            >
              {tx('adminDone', lang)}
            </button>
          </div>
        </div>
      </div>
    );
  }

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

          <Field label={tx('adminTempPasswordLabel', lang)}>
            <div className="flex gap-2">
              <input
                dir="ltr"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                className={inputCls}
                placeholder={tx('adminTempPasswordHelp', lang)}
              />
              <button
                type="button"
                onClick={() => setTempPassword(generateReadableTempPassword())}
                className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-paper"
              >
                {tx('adminGeneratePassword', lang)}
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">{tx('adminTempPasswordHelp', lang)}</p>
          </Field>

          <Field label={lang === 'he' ? 'תפקיד' : 'Role'}>
            <select value={role} onChange={(e) => setRole(e.target.value as AppRole)} className={inputCls}>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r, lang)}
                </option>
              ))}
            </select>
          </Field>

          {!isCrossFaculty && !scope?.lockedFacultyId && (
            <Field label={lang === 'he' ? 'פקולטה' : 'Faculty'}>
              <select
                value={facultyId}
                onChange={(e) => {
                  const newFacultyId = e.target.value;
                  setFacultyId(newFacultyId);
                  setMajor('');
                  setAssignedMajors([]);
                  const faculty = HIT_FACULTIES.find((f) => f.key === newFacultyId);
                  const levels = faculty ? Array.from(new Set(faculty.programs.map((p) => p.level))) : [];
                  if (levels.length === 1) setDegreeType(levels[0]!);
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

          {isSupervisorLike && (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {lang === 'he' ? 'מגמות משויכות (אופציונלי)' : 'Assigned Majors (optional)'}
              </span>
              <p className="mb-1.5 text-xs text-muted">
                {lang === 'he'
                  ? 'ללא בחירה — המנחה יהיה משויך לכל המגמות בפקולטה.'
                  : 'Leave unselected to allow all majors in the faculty.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {assignedMajorOptions.map((m) => {
                  const checked = assignedMajors.includes(m.slug);
                  return (
                    <button
                      key={m.slug}
                      type="button"
                      onClick={() => toggleAssignedMajor(m.slug)}
                      disabled={!facultyId}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                        checked ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink hover:border-primary'
                      }`}
                    >
                      {m.label[lang]}
                    </button>
                  );
                })}
                {facultyId && assignedMajorOptions.length === 0 && (
                  <span className="text-xs text-muted">{lang === 'he' ? 'אין מגמות לפקולטה זו' : 'No majors for this faculty'}</span>
                )}
              </div>
            </div>
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
                  disabled={availableDegreeLevels.length === 1}
                >
                  {availableDegreeLevels.includes('bachelors') && (
                    <option value="bachelors">{lang === 'he' ? 'תואר ראשון' : "Bachelor's"}</option>
                  )}
                  {availableDegreeLevels.includes('masters') && (
                    <option value="masters">{lang === 'he' ? 'תואר שני' : "Master's"}</option>
                  )}
                </select>
                {availableDegreeLevels.length === 1 && (
                  <p className="mt-1 text-xs text-muted">
                    {lang === 'he' ? 'לפקולטה זו יש רק תואר אחד' : 'This faculty only offers one degree level'}
                  </p>
                )}
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
