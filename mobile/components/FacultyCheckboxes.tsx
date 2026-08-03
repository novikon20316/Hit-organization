// components/FacultyCheckboxes.tsx
// Shared faculty multi-select for the Add Project flow — options are
// whichever faculties the logged-in staff member is actually authorized to
// add_projects in (GET /api/permissions/my-grants, see server's
// scopeAuthorization.ts's grantedFacultyIdsFor), not every faculty in the
// institution. Used by NewProjectModal.tsx (admin/faculty_admin modes) and
// the administrative coordinator/grad_school_head Add Project screens —
// supervisor's own modal stays locked/single and doesn't use this.
// Mirrors web/components/FacultyCheckboxes.tsx; mobile has no shared
// checkbox component to reuse, so this follows the same inline
// Pressable+checkmark convention as EditUserModal.tsx's additional-roles list.

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { apiClient } from '@/src/api/apiClient';
import { getFacultyByKey } from '../constants/faculties';

interface Props {
  selected: string[];
  onChange: (facultyIds: string[]) => void;
  lang: 'he' | 'en';
}

export default function FacultyCheckboxes({ selected, onChange, lang }: Props) {
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<{ facultyIds: string[] }>('/api/permissions/my-grants', { params: { action: 'add_projects' } })
      .then((res) => {
        if (!cancelled) setOptions(res.data.facultyIds ?? []);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (facultyId: string) => {
    onChange(selected.includes(facultyId) ? selected.filter((id) => id !== facultyId) : [...selected, facultyId]);
  };

  if (loading) return <ActivityIndicator size="small" />;
  if (options.length === 0) {
    return (
      <Text style={styles.emptyText}>
        {lang === 'he' ? 'אין לך הרשאה ליצור פרויקטים באף פקולטה.' : "You aren't authorized to create projects in any faculty."}
      </Text>
    );
  }

  return (
    <View>
      {options.map((facultyId) => {
        const isActive = selected.includes(facultyId);
        const faculty = getFacultyByKey(facultyId);
        const label = faculty?.label?.[lang] ?? facultyId;
        return (
          <Pressable key={facultyId} style={styles.row} onPress={() => toggle(facultyId)}>
            <View style={[styles.checkbox, isActive && styles.checkboxActive]}>{isActive && <Text style={styles.checkmark}>✓</Text>}</View>
            <Text style={styles.label}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: '#D0DEFF', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  checkboxActive: { borderColor: '#2E86FF', backgroundColor: '#2E86FF' },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  label: { fontSize: 14, color: '#111' },
  emptyText: { fontSize: 13, color: '#EF4444' },
});
