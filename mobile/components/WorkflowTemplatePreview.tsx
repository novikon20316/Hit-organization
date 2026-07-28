// components/WorkflowTemplatePreview.tsx
// Shared read-only preview for the Add Project flow: for every selected
// faculty x degreeType x projectType combination, shows the currently-
// approved workflow template that combination would be based on (see
// server's resolveWorkflowTemplateRefs, which does the real, authoritative
// resolution at submit time — this is purely a preview so staff aren't
// surprised by a submit-time error). Mirrors
// web/components/WorkflowTemplatePreview.tsx.
//
// This is a convenience, not the enforcement boundary — if the faculty's
// own view-scope can't resolve a preview, this shows a neutral "will be
// validated on submit" message rather than a false "blocked" error; the
// server re-validates for real regardless.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { apiClient } from '@/src/api/apiClient';
import { getFacultyByKey } from '../constants/faculties';

type DegreeType = 'bachelors' | 'masters';
type ProjectType = 'project' | 'thesis';
type ProcessType = 'msc_thesis' | 'msc_project' | 'bsc_project';

function deriveProcessType(degreeType: DegreeType, projectType: ProjectType): ProcessType {
  if (degreeType === 'masters') return projectType === 'thesis' ? 'msc_thesis' : 'msc_project';
  return 'bsc_project';
}

const DEGREE_LABEL: Record<DegreeType, { he: string; en: string }> = {
  bachelors: { he: 'תואר ראשון', en: "Bachelor's" },
  masters: { he: 'תואר שני', en: "Master's" },
};
const TYPE_LABEL: Record<ProjectType, { he: string; en: string }> = {
  project: { he: 'פרויקט', en: 'Project' },
  thesis: { he: 'תזה', en: 'Thesis' },
};

interface Props {
  facultyIds: string[];
  degreeTypes: DegreeType[];
  projectTypes: ProjectType[];
  major?: string | null;
  lang: 'he' | 'en';
}

type Row = {
  key: string;
  facultyId: string;
  degreeType: DegreeType;
  projectType: ProjectType;
  state: 'loading' | 'found' | 'missing' | 'unknown';
  templateVersion?: number;
};

export default function WorkflowTemplatePreview({ facultyIds, degreeTypes, projectTypes, major, lang }: Props) {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (facultyIds.length === 0 || degreeTypes.length === 0 || projectTypes.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;

    const combos = facultyIds.flatMap((facultyId) =>
      degreeTypes.flatMap((degreeType) => projectTypes.map((projectType) => ({ facultyId, degreeType, projectType })))
    );
    setRows(combos.map((c) => ({ ...c, key: `${c.facultyId}|${c.degreeType}|${c.projectType}`, state: 'loading' as const })));

    Promise.all(
      facultyIds.map((facultyId) =>
        apiClient
          .get('/api/workflow-templates', { params: { facultyId, major: major ? major : 'all' } })
          .then((res) => [facultyId, res.data.templates as any[]] as const)
          .catch(() => [facultyId, null] as const)
      )
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
          return match ? { ...c, key, state: 'found', templateVersion: match.version } : { ...c, key, state: 'missing' };
        })
      );
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- array deps compared by joined-string, not identity
  }, [facultyIds.join(','), degreeTypes.join(','), projectTypes.join(','), major]);

  if (rows.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>📋 {lang === 'he' ? 'תבנית תהליך מבוססת על' : 'Based on workflow template'}</Text>
      {rows.map((r) => (
        <View key={r.key} style={styles.row}>
          <Text style={styles.rowLabel}>
            {getFacultyByKey(r.facultyId)?.label?.[lang] ?? r.facultyId} · {DEGREE_LABEL[r.degreeType][lang]} · {TYPE_LABEL[r.projectType][lang]}
          </Text>
          {r.state === 'loading' && <Text style={styles.muted}>…</Text>}
          {r.state === 'found' && <Text style={styles.found}>{lang === 'he' ? `גרסה ${r.templateVersion}` : `v${r.templateVersion}`}</Text>}
          {r.state === 'missing' && (
            <Text style={styles.missing}>{lang === 'he' ? 'אין תבנית מאושרת' : 'No approved template'}</Text>
          )}
          {r.state === 'unknown' && <Text style={styles.muted}>{lang === 'he' ? 'ייבדק בעת השליחה' : 'Validated on submit'}</Text>}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderRadius: 12, borderWidth: 1, borderColor: '#D0DEFF', backgroundColor: '#F8FAFF', padding: 12, marginBottom: 16 },
  title: { fontSize: 13, fontWeight: '600', color: '#111', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3, gap: 8 },
  rowLabel: { fontSize: 11, color: '#8899BB', flexShrink: 1 },
  muted: { fontSize: 11, color: '#8899BB' },
  found: { fontSize: 11, fontWeight: '700', color: '#10B981' },
  missing: { fontSize: 11, fontWeight: '700', color: '#EF4444' },
});
