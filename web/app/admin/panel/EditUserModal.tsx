'use client';

// app/admin/panel/EditUserModal.tsx
// Ported from mobile's EditUserModal + panel.tsx's handleSaveUser. Same
// endpoint, same payload: { role, roles, facultyId } via role-update.

import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { VALID_ROLES, VALID_FACULTY_IDS, type AppRole } from '@/lib/roles';
import { roleLabel, facultyLabel } from '@/lib/i18n';
import { PermissionsEditorModal } from './PermissionsEditorModal';
import { CoordinatorScopesModal } from './CoordinatorScopesModal';
import { majorsForFaculty, type ScopeRule, type CoordinatorScope, type ActionType } from '@/lib/permissions';
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  const showCoordinatorScopes = role === 'coordinator' || additionalRoles.includes('coordinator');
  const isSupervisorLike =
    role === 'supervisor' || additionalRoles.includes('supervisor') || role === 'secondary_supervisor' || additionalRoles.includes('secondary_supervisor');
  const isStudent = role === 'student' || additionalRoles.includes('student');

  // Deduped across degree levels — same helper the coordinator-scope UI uses.
  const assignedMajorOptions = useMemo(() => majorsForFaculty(facultyId), [facultyId]);

  const toggleAdditionalRole = (r: AppRole) => {
    setAdditionalRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  const toggleAssignedMajor = (slug: string) => {
    setAssignedMajors((prev) => (prev.includes(slug) ? prev.filter((m) => m !== slug) : [...prev, slug]));
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
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg">
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

          {/* ── Coordinator Scope (coordinator role only) ── */}
          {showCoordinatorScopes && (
            <button
              type="button"
              onClick={() => setScopesModalOpen(true)}
              className="flex items-center justify-between rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm font-medium text-ink hover:border-primary"
            >
              <span>📋 {lang === 'he' ? 'היקף אחריות רכז' : 'Coordinator Scope'}</span>
              <span className="text-muted">
                {coordinatorScopes.length > 0
                  ? (lang === 'he' ? `${coordinatorScopes.length} תחומים ›` : `${coordinatorScopes.length} scopes ›`)
                  : '›'}
              </span>
            </button>
          )}
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

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
