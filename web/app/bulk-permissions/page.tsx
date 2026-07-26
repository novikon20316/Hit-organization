'use client';

// app/bulk-permissions/page.tsx
// Grants a view/action permission scope to EVERY user of a chosen role in
// one action — instead of the existing one-user-at-a-time checkbox flow
// (PermissionsEditorModal.tsx, still available unchanged for individual
// exceptions). system_admin: unscoped (any role, any faculty). faculty_admin:
// locked server-side to their own faculty regardless of what this page sends.
// grad_school_head: cross-faculty by design, same as the rest of this app.

import { useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, ApiError, SoftError } from '@/lib/apiClient';
import { VALID_ROLES, type AppRole } from '@/lib/roles';
import { roleLabel, facultyLabel, type FacultyId } from '@/lib/i18n';
import {
  VIEW_TYPES, ACTION_TYPES, DEGREE_LEVELS, PROCESS_TYPES, PERMISSION_FACULTY_IDS,
  majorsForFaculty, degreeLevelsForFaculty, type ViewType, type ActionType, type DegreeLevel, type ProcessType,
} from '@/lib/permissions';

const BULK_PERMISSION_ROLES: AppRole[] = ['system_admin', 'faculty_admin', 'grad_school_head'];
const TARGETABLE_ROLES = VALID_ROLES.filter((r) => r !== 'student');

export default function BulkPermissionsPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(BULK_PERMISSION_ROLES);
  const { userData } = useAuth();
  const { lang, t } = useLanguage();

  const role = userData?.role as AppRole | undefined;
  const isFacultyLocked = role === 'faculty_admin';
  const ownFacultyId = userData?.facultyId;

  const [targetRole, setTargetRole] = useState<AppRole>('supervisor');
  // '' means "every faculty" — only selectable by system_admin/grad_school_head.
  const [facultyId, setFacultyId] = useState('');
  const [major, setMajor] = useState('');
  const [degreeLevel, setDegreeLevel] = useState<DegreeLevel | ''>('');
  const [processType, setProcessType] = useState<ProcessType | ''>('');
  const [view, setView] = useState<ViewType[]>([]);
  const [actions, setActions] = useState<ActionType[]>([]);

  const [affectedCount, setAffectedCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const effectiveFacultyId = isFacultyLocked ? (ownFacultyId ?? '') : facultyId;
  const majors = effectiveFacultyId ? majorsForFaculty(effectiveFacultyId) : [];
  const degreeLevelOptions = DEGREE_LEVELS.filter((d) => degreeLevelsForFaculty(effectiveFacultyId || 'all').includes(d.key));

  const loadPreview = useCallback(async () => {
    setCountLoading(true);
    try {
      const res = await apiClient.getUsersByRole(targetRole);
      const scoped = effectiveFacultyId ? res.users.filter((u) => u.facultyId === effectiveFacultyId) : res.users;
      setAffectedCount(scoped.length);
    } catch {
      setAffectedCount(null);
    } finally {
      setCountLoading(false);
    }
  }, [targetRole, effectiveFacultyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/filter-change; setState happens after the awaited network call resolves, not synchronously in this effect
    if (isAllowed) loadPreview();
  }, [isAllowed, loadPreview]);

  const toggleView = (key: ViewType) => setView((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const toggleAction = (key: ActionType) => setActions((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const handleApply = async () => {
    if (view.length === 0 && actions.length === 0) {
      setError(lang === 'he' ? 'יש לבחור לפחות הרשאת צפייה או פעולה אחת' : 'Select at least one view or action permission');
      return;
    }
    setApplying(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiClient.applyPermissionsToRole({
        targetRole,
        facultyId: effectiveFacultyId || undefined,
        major: major || undefined,
        degreeLevel: degreeLevel || undefined,
        processType: processType || undefined,
        view,
        actions,
      });
      setSuccess(
        lang === 'he'
          ? `ההרשאה הוחלה על ${res.affectedCount} משתמשים בהצלחה`
          : `Permission applied to ${res.affectedCount} user(s) successfully`
      );
    } catch (err) {
      setError(err instanceof ApiError || err instanceof SoftError ? err.message : lang === 'he' ? 'הפעולה נכשלה' : 'Action failed');
    } finally {
      setApplying(false);
    }
  };

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';

  return (
    <DashboardShell
      title={lang === 'he' ? 'הרשאות מרוכזות לפי תפקיד' : 'Bulk Permissions by Role'}
      subtitle={
        lang === 'he'
          ? 'החל הרשאה על כל המשתמשים בעלי תפקיד מסוים בבת אחת, במקום משתמש-משתמש'
          : 'Apply a permission to every user of a role at once, instead of one user at a time'
      }
    >
      <div className="max-w-xl">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'תפקיד יעד' : 'Target role'}</span>
          <select value={targetRole} onChange={(e) => setTargetRole(e.target.value as AppRole)} className={inputCls}>
            {TARGETABLE_ROLES.map((r) => (
              <option key={r} value={r}>{roleLabel(r, lang)}</option>
            ))}
          </select>
        </label>

        {isFacultyLocked ? (
          <p className="mt-3 text-sm text-muted">
            {lang === 'he' ? 'פקולטה: ' : 'Faculty: '}
            <span className="font-medium text-ink">{ownFacultyId ? facultyLabel(ownFacultyId as FacultyId, lang) : '—'}</span>
            <span className="ms-1 text-xs">({lang === 'he' ? 'נעול לפקולטה שלך' : 'locked to your own faculty'})</span>
          </p>
        ) : (
          <label className="mt-3 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'פקולטה' : 'Faculty'}</span>
            <select
              value={facultyId}
              onChange={(e) => {
                const fid = e.target.value;
                setFacultyId(fid);
                setMajor('');
                const validLevels = degreeLevelsForFaculty(fid || 'all');
                if (degreeLevel && !validLevels.includes(degreeLevel)) {
                  setDegreeLevel('');
                  setProcessType('');
                }
              }}
              className={inputCls}
            >
              <option value="">{lang === 'he' ? 'כל הפקולטות' : 'All faculties'}</option>
              {PERMISSION_FACULTY_IDS.filter((id) => id !== 'all').map((id) => (
                <option key={id} value={id}>{facultyLabel(id, lang)}</option>
              ))}
            </select>
          </label>
        )}

        {effectiveFacultyId && majors.length > 0 && (
          <label className="mt-3 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'מגמה (אופציונלי)' : 'Major (optional)'}</span>
            <select value={major} onChange={(e) => setMajor(e.target.value)} className={inputCls}>
              <option value="">{lang === 'he' ? 'כל המגמות' : 'All majors'}</option>
              {majors.map((m) => (
                <option key={m.slug} value={m.slug}>{m.label[lang]}</option>
              ))}
            </select>
          </label>
        )}

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'תואר (אופציונלי)' : 'Degree level (optional)'}</span>
          <select
            value={degreeLevel}
            onChange={(e) => { const v = e.target.value as DegreeLevel | ''; setDegreeLevel(v); if (v !== 'masters') setProcessType(''); }}
            className={inputCls}
          >
            <option value="">{lang === 'he' ? 'שני התארים' : 'Both degree levels'}</option>
            {degreeLevelOptions.map((d) => (
              <option key={d.key} value={d.key}>{d.label[lang]}</option>
            ))}
          </select>
        </label>

        {degreeLevel === 'masters' && (
          <label className="mt-3 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'מסלול (אופציונלי)' : 'Process type (optional)'}</span>
            <select value={processType} onChange={(e) => setProcessType(e.target.value as ProcessType | '')} className={inputCls}>
              <option value="">{lang === 'he' ? 'שני המסלולים' : 'Both tracks'}</option>
              {PROCESS_TYPES.map((p) => (
                <option key={p.key} value={p.key}>{p.label[lang]}</option>
              ))}
            </select>
          </label>
        )}

        <p className="mt-4 rounded-lg bg-paper px-3 py-2 text-sm text-ink">
          {lang === 'he' ? '👥 משתמשים שיושפעו: ' : '👥 Users affected: '}
          <span className="font-semibold">{countLoading ? '…' : affectedCount ?? '—'}</span>
        </p>

        <div className="mt-4">
          <p className="mb-1.5 text-sm font-medium text-ink">👁️ {lang === 'he' ? 'צפייה' : 'View'}</p>
          <div className="grid gap-1.5">
            {VIEW_TYPES.map((v) => (
              <label key={v.key} className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
                <input type="checkbox" checked={view.includes(v.key)} onChange={() => toggleView(v.key)} className="h-4 w-4 accent-[var(--primary)]" />
                <span className="text-sm text-ink">{v.label[lang]}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-1.5 text-sm font-medium text-ink">⚡ {lang === 'he' ? 'פעולות' : 'Actions'}</p>
          <div className="grid gap-1.5">
            {ACTION_TYPES.map((a) => (
              <label key={a.key} className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
                <input type="checkbox" checked={actions.includes(a.key)} onChange={() => toggleAction(a.key)} className="h-4 w-4 accent-[var(--primary)]" />
                <span className="text-sm text-ink">{a.label[lang]}</span>
              </label>
            ))}
          </div>
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
        {success && <p className="mt-4 rounded-md bg-success-bg px-3 py-2 text-sm text-success">{success}</p>}

        <button
          type="button"
          onClick={handleApply}
          disabled={applying}
          className="mt-5 w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
        >
          {applying
            ? '…'
            : lang === 'he'
              ? `החל על ${affectedCount ?? '?'} משתמשים`
              : `Apply to ${affectedCount ?? '?'} user(s)`}
        </button>
      </div>
    </DashboardShell>
  );
}
