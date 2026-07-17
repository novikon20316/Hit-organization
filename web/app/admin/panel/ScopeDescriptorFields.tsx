'use client';

// app/admin/panel/ScopeDescriptorFields.tsx
// The Faculty -> optional Major -> optional Degree Level -> optional Process
// Type picker shared by PermissionsEditorModal's rule rows (system_admin's
// granular permission rules) and CoordinatorScopesModal's scope rows (a
// coordinator's own operational scope) — same narrowing logic, just used for
// different purposes downstream. See lib/permissions.ts's ScopeDescriptor.
//
// Ported from mobile/components/modals/ScopeDescriptorFields.tsx; mobile
// renders each choice as a stack of checkbox rows, this uses plain
// <select>s to match this codebase's other single-choice fields (see
// NewUserModal.tsx / NewProjectModal.tsx's faculty/degree/major pickers).

import { useLanguage } from '@/contexts/LanguageContext';
import { facultyLabel } from '@/lib/i18n';
import {
  PERMISSION_FACULTY_IDS, DEGREE_LEVELS, PROCESS_TYPES, majorsForFaculty,
  type ScopeDescriptor, type PermissionFacultyId,
} from '@/lib/permissions';

interface ScopeDescriptorFieldsProps {
  scope: ScopeDescriptor;
  onChange: (patch: Partial<ScopeDescriptor>) => void;
}

const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';

export function ScopeDescriptorFields({ scope, onChange }: ScopeDescriptorFieldsProps) {
  const { lang } = useLanguage();
  const majors = scope.facultyId !== 'all' ? majorsForFaculty(scope.facultyId) : [];

  return (
    <div className="grid gap-3">
      {/* Faculty */}
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'פקולטה' : 'Faculty'}</span>
        <select
          value={scope.facultyId}
          onChange={(e) => onChange({ facultyId: e.target.value as PermissionFacultyId, major: undefined })}
          className={inputCls}
        >
          {PERMISSION_FACULTY_IDS.map((fid) => (
            <option key={fid} value={fid}>
              {facultyLabel(fid, lang)}
            </option>
          ))}
        </select>
      </label>

      {/* Major (only when a specific faculty, not 'all') */}
      {scope.facultyId !== 'all' && (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            {lang === 'he' ? 'מגמה (אופציונלי)' : 'Major (optional)'}
          </span>
          <select value={scope.major ?? ''} onChange={(e) => onChange({ major: e.target.value || undefined })} className={inputCls}>
            <option value="">{lang === 'he' ? 'כל המגמות בפקולטה' : 'All majors in this faculty'}</option>
            {majors.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.label[lang]}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Degree level */}
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">
          {lang === 'he' ? 'תואר (אופציונלי)' : 'Degree Level (optional)'}
        </span>
        <select
          value={scope.degreeLevel ?? ''}
          onChange={(e) => {
            const degreeLevel = (e.target.value || undefined) as ScopeDescriptor['degreeLevel'];
            onChange({ degreeLevel, processType: degreeLevel === 'masters' ? scope.processType : undefined });
          }}
          className={inputCls}
        >
          <option value="">{lang === 'he' ? 'שני התארים' : 'Both degree levels'}</option>
          {DEGREE_LEVELS.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label[lang]}
            </option>
          ))}
        </select>
      </label>

      {/* Process type — master's only */}
      {scope.degreeLevel === 'masters' && (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            {lang === 'he' ? 'מסלול (אופציונלי)' : 'Process Type (optional)'}
          </span>
          <select
            value={scope.processType ?? ''}
            onChange={(e) => onChange({ processType: (e.target.value || undefined) as ScopeDescriptor['processType'] })}
            className={inputCls}
          >
            <option value="">{lang === 'he' ? 'שני המסלולים' : 'Both tracks'}</option>
            {PROCESS_TYPES.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label[lang]}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
