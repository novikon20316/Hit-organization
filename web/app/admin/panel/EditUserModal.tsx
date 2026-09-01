'use client';

// app/admin/panel/EditUserModal.tsx
// Ported from mobile's EditUserModal + panel.tsx's handleSaveUser. Same
// endpoint, same payload: { role, roles, facultyId } via role-update.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import { VALID_ROLES, VALID_FACULTY_IDS, type AppRole } from '@/lib/roles';
import { roleLabel, facultyLabel, type FacultyId } from '@/lib/i18n';
import { PermissionsEditorModal } from './PermissionsEditorModal';
import { CoordinatorScopesModal } from './CoordinatorScopesModal';
import { majorsForFaculty, type ScopeRule, type CoordinatorScope, type ActionType } from '@/lib/permissions';
import { ROLE_FACULTY_PICKER_FIELD, type RoleFacultyField } from '@/lib/roleFacultyPicker';
import type { AdminUserRecord, StudentStatusConfig } from './types';

interface EditUserModalProps {
  user: AdminUserRecord;
  onClose: () => void;
  onSaved: () => void;
  /** Narrows this modal for a delegate (faculty_admin/program_head/
   *  grad_school_head) instead of system_admin — see NewUserModal's `scope`
   *  for the same idea on the create side. `restrictedActions` hides
   *  delete_users/all_actions from the permissions editor (still rejected
   *  server-side regardless). */
  scope?: { selectableRoles: AppRole[]; lockedFacultyId?: string; restrictedActions?: ActionType[] };
}

// Rendered by the parent with `key={user.id}` (only when a user is actually
// being edited) so a different user means a fresh mount of this component —
// that's what lets the form fields below initialize straight from props
// with plain useState, no reset-on-prop-change effect required.
export function EditUserModal({ user, onClose, onSaved, scope }: EditUserModalProps) {
  const { lang } = useLanguage();
  // Always includes the target's current role even if it's outside the
  // delegate's manageable set (e.g. faculty_admin opening this on a
  // student — whose only actual reason to be here is the primary/secondary
  // status fields below, not a role change) — never silently offer the full
  // VALID_ROLES list to a delegate, only their scope plus whatever this user
  // already is.
  const roleOptions = scope?.selectableRoles ? Array.from(new Set([user.role, ...scope.selectableRoles])) : VALID_ROLES;
  const [role, setRole] = useState<AppRole>(user.role);
  const [additionalRoles, setAdditionalRoles] = useState<AppRole[]>(
    user.roles?.length ? user.roles.filter((r) => r !== user.role) : []
  );
  const [facultyId, setFacultyId] = useState<string>(user.facultyId);
  const [assignedMajors, setAssignedMajors] = useState<string[]>(user.assignedMajors ?? []);
  // One "additional faculties" array per role that supports it (see
  // ROLE_FACULTY_PICKER_FIELD) — keyed by field name, not role, since that's
  // what the field actually maps to on the user doc / role-update payload.
  const [facultyIdsByField, setFacultyIdsByField] = useState<Record<RoleFacultyField, string[]>>({
    supervisorFacultyIds: user.supervisorFacultyIds ?? [],
    secondarySupervisorFacultyIds: user.secondarySupervisorFacultyIds ?? [],
    facultyAdminFacultyIds: user.facultyAdminFacultyIds ?? [],
    programHeadFacultyIds: user.programHeadFacultyIds ?? [],
    gradSchoolHeadFacultyIds: user.gradSchoolHeadFacultyIds ?? [],
    internalExaminerFacultyIds: user.internalExaminerFacultyIds ?? [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(modalRef, true, onClose);

  // Student status — options come from the shared admin-manageable lists
  // (see StudentStatusesModal.tsx); fetched once when this modal opens.
  const [statusConfig, setStatusConfig] = useState<StudentStatusConfig>({ primary: [], secondary: [] });
  const [primaryStatus, setPrimaryStatus] = useState<string>(user.primaryStatus ?? '');
  const [secondaryStatus, setSecondaryStatus] = useState<string>(user.secondaryStatus ?? '');

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getStudentStatusOptions()
      .then((res) => {
        if (!cancelled) setStatusConfig(res);
      })
      .catch(() => {
        // Non-fatal — the dropdowns just stay empty aside from "— none —".
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Granular permissions — persisted via updateUserRoleAdmin's
  // permissionRules/coordinatorScopes fields (see lib/permissions.ts,
  // PermissionsEditorModal, and server/src/services/scopeAuthorization.ts
  // for how these get enforced).
  const [permissionRules, setPermissionRules] = useState<ScopeRule[]>(user.permissionRules ?? []);
  const [coordinatorScopes, setCoordinatorScopes] = useState<CoordinatorScope[]>(user.coordinatorScopes ?? []);
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [scopesModalOpen, setScopesModalOpen] = useState(false);

  // Same generic scope field also used to assign an administrative coordinator
  // to one or more specific subjects (facultyId+major) — "keep a separation
  // between degrees" for the workflow-templates screen. See
  // resolveCoordinatorScope in server/src/controllers/workflowTemplateController.ts.
  // Also doubles as grad_school_head's optional major narrowing for the
  // Students List tab — no scopes set means the whole (masters-only) faculty,
  // see studentsListController.ts's majorAllowed.
  const showCoordinatorScopes =
    role === 'coordinator' || additionalRoles.includes('coordinator') ||
    role === 'administrative_secretary' || additionalRoles.includes('administrative_secretary') ||
    role === 'grad_school_head' || additionalRoles.includes('grad_school_head');
  const isSupervisor = role === 'supervisor' || additionalRoles.includes('supervisor');
  const isSecondarySupervisor = role === 'secondary_supervisor' || additionalRoles.includes('secondary_supervisor');
  const isSupervisorLike = isSupervisor || isSecondarySupervisor;
  const isStudent = role === 'student' || additionalRoles.includes('student');

  // Every role currently assigned (primary + additional) that has a
  // matching entry in ROLE_FACULTY_PICKER_FIELD — one "additional faculties"
  // block gets rendered per entry, so adding/removing a role adds/removes
  // its block automatically instead of needing a new hardcoded section.
  const pickerRoles = useMemo(
    () => Array.from(new Set([role, ...additionalRoles])).filter((r) => ROLE_FACULTY_PICKER_FIELD[r]),
    [role, additionalRoles]
  );

  // Deduped across degree levels — same helper the coordinator-scope UI uses.
  const assignedMajorOptions = useMemo(() => majorsForFaculty(facultyId), [facultyId]);

  const toggleAdditionalRole = (r: AppRole) => {
    setAdditionalRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  const toggleAssignedMajor = (slug: string) => {
    setAssignedMajors((prev) => (prev.includes(slug) ? prev.filter((m) => m !== slug) : [...prev, slug]));
  };

  const toggleRoleFaculty = (field: RoleFacultyField, id: string) => {
    setFacultyIdsByField((prev) => ({
      ...prev,
      [field]: prev[field].includes(id) ? prev[field].filter((f) => f !== id) : [...prev[field], id],
    }));
  };

  const handleFacultyChange = (value: string) => {
    setFacultyId(value);
    const validSlugs = new Set(majorsForFaculty(value).map((m) => m.slug));
    setAssignedMajors((prev) => prev.filter((m) => validSlugs.has(m)));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await apiClient.updateUserRoleAdmin(user.id, {
        role,
        roles: [role, ...additionalRoles.filter((r) => r !== role)],
        facultyId,
        assignedMajors: isSupervisorLike ? assignedMajors : undefined,
        supervisorFacultyIds: isSupervisor ? facultyIdsByField.supervisorFacultyIds : undefined,
        secondarySupervisorFacultyIds: isSecondarySupervisor ? facultyIdsByField.secondarySupervisorFacultyIds : undefined,
        facultyAdminFacultyIds: pickerRoles.includes('faculty_admin') ? facultyIdsByField.facultyAdminFacultyIds : undefined,
        programHeadFacultyIds: pickerRoles.includes('program_head') ? facultyIdsByField.programHeadFacultyIds : undefined,
        gradSchoolHeadFacultyIds: pickerRoles.includes('grad_school_head') ? facultyIdsByField.gradSchoolHeadFacultyIds : undefined,
        internalExaminerFacultyIds: pickerRoles.includes('internal_examiner') ? facultyIdsByField.internalExaminerFacultyIds : undefined,
        permissionRules,
        coordinatorScopes: showCoordinatorScopes ? coordinatorScopes : undefined,
      });

      if (isStudent) {
        const primaryChanged = (user.primaryStatus ?? '') !== primaryStatus;
        const secondaryChanged = (user.secondaryStatus ?? '') !== secondaryStatus;
        if (primaryChanged || secondaryChanged) {
          await apiClient.setStudentStatus(user.id, {
            primaryStatus: primaryStatus || null,
            secondaryStatus: secondaryStatus || null,
          });
        }
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'עדכון המשתמש נכשל' : 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg outline-none"
      >
        <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'עריכת משתמש' : 'Edit User'}</h2>
        <p className="mt-1 text-sm text-muted">{user.displayName} — {user.email}</p>

        <div className="mt-4 grid gap-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'תפקיד ראשי' : 'Primary Role'}</span>
            <select value={role} onChange={(e) => setRole(e.target.value as AppRole)} className={inputCls}>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r, lang)}
                </option>
              ))}
            </select>
          </label>

          {!scope?.lockedFacultyId && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'פקולטה' : 'Faculty'}</span>
              <select value={facultyId} onChange={(e) => handleFacultyChange(e.target.value)} className={inputCls}>
                {VALID_FACULTY_IDS.map((id) => (
                  <option key={id} value={id}>
                    {facultyLabel(id, lang)}
                  </option>
                ))}
              </select>
            </label>
          )}

          {isStudent && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'סטטוס ראשי' : 'Primary Status'}</span>
                <select value={primaryStatus} onChange={(e) => setPrimaryStatus(e.target.value)} className={inputCls}>
                  <option value="">{lang === 'he' ? '— ללא —' : '— none —'}</option>
                  {statusConfig.primary.map((o) => (
                    <option key={o.key} value={o.key}>
                      {lang === 'he' ? o.labelHe : o.labelEn}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'סטטוס משני' : 'Secondary Status'}</span>
                <select value={secondaryStatus} onChange={(e) => setSecondaryStatus(e.target.value)} className={inputCls}>
                  <option value="">{lang === 'he' ? '— ללא —' : '— none —'}</option>
                  {statusConfig.secondary.map((o) => (
                    <option key={o.key} value={o.key}>
                      {lang === 'he' ? o.labelHe : o.labelEn}
                    </option>
                  ))}
                </select>
              </label>
            </div>
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
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        checked ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink hover:border-primary'
                      }`}
                    >
                      {m.label[lang]}
                    </button>
                  );
                })}
                {assignedMajorOptions.length === 0 && (
                  <span className="text-xs text-muted">{lang === 'he' ? 'אין מגמות לפקולטה זו' : 'No majors for this faculty'}</span>
                )}
              </div>
            </div>
          )}

          {/* One block per currently-assigned role that supports it (see
              ROLE_FACULTY_PICKER_FIELD) — only shown once that role has been
              added, so this stays hidden for everyone else. For a
              cross-faculty account (facultyId 'all'), the picker RESTRICTS
              which faculties the person holds that role in (empty = every
              faculty). For a normal single-faculty account, it ADDS extra
              faculties on top of their own — e.g. a Data Science supervisor
              who's ALSO offered as supervisor in Engineering. */}
          {pickerRoles.map((r) => {
            const field = ROLE_FACULTY_PICKER_FIELD[r]!;
            const label = roleLabel(r, lang);
            const article = /^[aeiou]/i.test(label) ? 'an' : 'a';
            return (
              <div key={field}>
                <span className="mb-1.5 block text-sm font-medium text-ink">
                  {lang === 'he' ? `${label} גם בפקולטות נוספות (אופציונלי)` : `Also ${article} ${label} in additional faculties (optional)`}
                </span>
                <p className="mb-1.5 text-xs text-muted">
                  {facultyId === 'all'
                    ? (lang === 'he'
                      ? `ללא בחירה — המשתמש יופיע כ${label} זמין בכל הפקולטות (ברירת המחדל לתפקיד חוצה-פקולטות). סמן פקולטות ספציפיות כדי להגביל אליהן בלבד.`
                      : `Leave unselected — this account will appear as ${article} available ${label} in EVERY faculty (the default for a cross-faculty role). Check specific faculties to restrict it to only those.`)
                    : (lang === 'he'
                      ? `המשתמש כבר מוצג כ${label} בפקולטה שלו (${facultyLabel(facultyId as FacultyId, lang)}). סמן פקולטות נוספות כדי להוסיף אותו שם גם כן.`
                      : `This user is already offered as ${article} ${label} in their own faculty (${facultyLabel(facultyId as FacultyId, lang)}). Check additional faculties to also offer them there.`)}
                </p>
                <div className="flex flex-wrap gap-2">
                  {VALID_FACULTY_IDS.filter((id) => id !== 'all' && id !== facultyId).map((id) => {
                    const checked = facultyIdsByField[field].includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleRoleFaculty(field, id)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          checked ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink hover:border-primary'
                        }`}
                      >
                        {facultyLabel(id, lang)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">
              {lang === 'he' ? 'תפקידים נוספים (אופציונלי)' : 'Additional Roles (optional)'}
            </span>
            <div className="flex flex-wrap gap-2">
              {roleOptions.filter((r) => r !== role).map((r) => {
                const checked = additionalRoles.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleAdditionalRole(r)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      checked ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink hover:border-primary'
                    }`}
                  >
                    {roleLabel(r, lang)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Granular Permissions ── */}
          <button
            type="button"
            onClick={() => setPermissionsModalOpen(true)}
            className="flex items-center justify-between rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm font-medium text-ink hover:border-primary"
          >
            <span>🔐 {lang === 'he' ? 'הרשאות מפורטות' : 'Granular Permissions'}</span>
            <span className="text-muted">
              {permissionRules.length > 0
                ? (lang === 'he' ? `${permissionRules.length} כללים ›` : `${permissionRules.length} rules ›`)
                : '›'}
            </span>
          </button>

          {/* ── Coordinator Scope / Subject Responsibility (coordinator or
                administrative coordinator) — same underlying field either way,
                just a role-appropriate label. ── */}
          {showCoordinatorScopes && (
            <button
              type="button"
              onClick={() => setScopesModalOpen(true)}
              className="flex items-center justify-between rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm font-medium text-ink hover:border-primary"
            >
              <span>
                📋{' '}
                {role === 'administrative_secretary' || additionalRoles.includes('administrative_secretary')
                  ? lang === 'he' ? 'תחום אחריות (רכזת)' : 'Subject Responsibility'
                  : lang === 'he' ? 'היקף אחריות רכז' : 'Coordinator Scope'}
              </span>
              <span className="text-muted">
                {coordinatorScopes.length > 0
                  ? (lang === 'he' ? `${coordinatorScopes.length} תחומים ›` : `${coordinatorScopes.length} scopes ›`)
                  : '›'}
              </span>
            </button>
          )}
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
            {lang === 'he' ? 'ביטול' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
          >
            {saving ? '…' : lang === 'he' ? 'שמור' : 'Save'}
          </button>
        </div>
      </div>

      <PermissionsEditorModal
        open={permissionsModalOpen}
        onClose={() => setPermissionsModalOpen(false)}
        rules={permissionRules}
        onChange={setPermissionRules}
        restrictedActions={scope?.restrictedActions}
      />

      {showCoordinatorScopes && (
        <CoordinatorScopesModal
          open={scopesModalOpen}
          onClose={() => setScopesModalOpen(false)}
          scopes={coordinatorScopes}
          onChange={setCoordinatorScopes}
        />
      )}
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';
