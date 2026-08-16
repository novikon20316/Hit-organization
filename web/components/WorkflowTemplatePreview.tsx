'use client';

// components/WorkflowTemplatePreview.tsx
// Shared read-only preview for the Add Project flow: for every selected
// faculty x degreeType x projectType combination, shows the currently-
// approved workflow template that combination would be based on (see
// server/src/services/workflowTemplates.ts's resolveWorkflowTemplateRefs,
// which does the real, authoritative resolution at submit time — this is
// purely a preview so staff aren't surprised by a submit-time error). Used
// by every Add Project modal (admin/panel, faculty_admin, supervisor,
// administrative coordinator, grad_school_head dashboards) instead of
// duplicating this fetch+cross-product logic five times.
//
// This is a convenience, not the enforcement boundary — same "server is the
// real gate" precedent as applyApplication's major check. If the faculty's
// own view-scope (e.g. administrative coordinator's coordinatorScopes) can't
// resolve a preview, this shows a neutral "will be validated on submit"
// message rather than a false "blocked" error; createAdminProject/
// createSupervisorProject re-validate for real regardless.

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { facultyLabel, type FacultyId } from '@/lib/i18n';

type DegreeType = 'bachelors' | 'masters';
type ProjectType = 'project' | 'thesis';
type ProcessType = 'msc_thesis' | 'msc_project' | 'bsc_project';

function deriveProcessType(degreeType: DegreeType, projectType: ProjectType): ProcessType {
  if (degreeType === 'masters') return projectType === 'thesis' ? 'msc_thesis' : 'msc_project';
  return 'bsc_project';
}

const DEGREE_LABEL: Record<DegreeType, { he: string; en: string }> = {
  bachelors: { he: 'תואר ראשון', en: "Bachelor's" },
  masters:   { he: 'תואר שני',   en: "Master's" },
};
const TYPE_LABEL: Record<ProjectType, { he: string; en: string }> = {
  project: { he: 'פרויקט', en: 'Project' },
  thesis:  { he: 'תזה',    en: 'Thesis' },
};

interface Props {
  facultyIds: string[];
  degreeTypes: DegreeType[];
  projectTypes: ProjectType[];
  major?: string;
}

type Row = {
  key: string;
  facultyId: string;
  degreeType: DegreeType;
  projectType: ProjectType;
  state: 'loading' | 'found' | 'missing' | 'unknown';
  templateVersion?: number;
  approvedAt?: string;
};

export function WorkflowTemplatePreview({ facultyIds, degreeTypes, projectTypes, major }: Props) {
  const { lang } = useLanguage();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (facultyIds.length === 0 || degreeTypes.length === 0 || projectTypes.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;

    const combos = facultyIds.flatMap((facultyId) =>
      degreeTypes.flatMap((degreeType) =>
        projectTypes.map((projectType) => ({ facultyId, degreeType, projectType }))
      )
    );
    setRows(combos.map((c) => ({ ...c, key: `${c.facultyId}|${c.degreeType}|${c.projectType}`, state: 'loading' as const })));

    Promise.all(
      facultyIds.map(async (facultyId) => {
        try {
          // Fetch both the exact-major tier and the "all majors" (major:
          // null) fallback tier — an approved template scoped to null
          // applies to every major, including whichever one is selected
          // here. Mirrors services/workflowTemplates.ts's
          // findApprovedTemplateId, which does this same two-tier lookup
          // server-side at actual submit time; this preview used to only
          // check the exact-major tier, so it could show a false "no
          // approved template" warning for a combination that would
          // actually succeed on submit.
          const [exact, fallback] = await Promise.all([
            apiClient.getWorkflowTemplates(facultyId, major ?? null),
            major ? apiClient.getWorkflowTemplates(facultyId, null) : Promise.resolve(null),
          ]);
          const seen = new Set<string>();
          const merged = [...exact.templates, ...(fallback?.templates ?? [])].filter((t) => {
            if (seen.has(t.id)) return false;
            seen.add(t.id);
            return true;
          });
          return [facultyId, merged] as const;
        } catch {
          return [facultyId, null] as const;
        }
      })
    ).then((pairs) => {
      if (cancelled) return;
      const templatesByFaculty = new Map(pairs);
      setRows(
        combos.map((c) => {
          const templates = templatesByFaculty.get(c.facultyId);
          const key = `${c.facultyId}|${c.degreeType}|${c.projectType}`;
          if (templates === null || templates === undefined) return { ...c, key, state: 'unknown' };
          const processType = deriveProcessType(c.degreeType, c.projectType);
          const match = templates.find((t) => t.processType === processType && t.status === 'approved');
          return match
            ? { ...c, key, state: 'found', templateVersion: match.version, approvedAt: match.approvedAt }
            : { ...c, key, state: 'missing' };
        })
      );
    });

    return () => {
      cancelled = true;
    };
  }, [facultyIds.join(','), degreeTypes.join(','), projectTypes.join(','), major]);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-line bg-paper p-3">
      <span className="mb-2 block text-sm font-medium text-ink">
        📋 {lang === 'he' ? 'תבנית תהליך מבוססת על' : 'Based on workflow template'}
      </span>
      <div className="grid gap-1.5">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted">
              {facultyLabel(r.facultyId as FacultyId, lang)} · {DEGREE_LABEL[r.degreeType][lang]} · {TYPE_LABEL[r.projectType][lang]}
            </span>
            {r.state === 'loading' && <span className="text-muted">…</span>}
            {r.state === 'found' && (
              <span className="font-medium text-success">
                {lang === 'he' ? `גרסה ${r.templateVersion}` : `v${r.templateVersion}`}
                {r.approvedAt ? ` · ${new Date(r.approvedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}` : ''}
              </span>
            )}
            {r.state === 'missing' && (
              <span className="font-medium text-danger">
                {lang === 'he' ? 'אין תבנית מאושרת — יש לאשר אחת במסך תבניות תהליך' : 'No approved template — approve one in Workflow Templates first'}
              </span>
            )}
            {r.state === 'unknown' && (
              <span className="text-muted">{lang === 'he' ? 'ייבדק בעת השליחה' : 'Will be validated on submit'}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
