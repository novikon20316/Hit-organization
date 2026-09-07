// components/StudentsListSection.tsx
//
// Read-only "Students List" tab body for faculty_admin and grad_school_head —
// mirrors components/ManagedStaffSection.tsx's shell (search + card list)
// but self-fetches from GET /api/admin/students-list (see
// server/src/controllers/studentsListController.ts for the server-side
// scoping: faculty_admin sees every student in their faculty regardless of
// major/degree, grad_school_head sees masters students only, narrowed to
// whichever majors their coordinatorScopes name, or the whole faculty if
// none are set). No create/edit/toggle actions.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { apiClient } from '../src/api/apiClient';
import { facultyLabel, type FacultyId } from './i18n';
import { majorsForFaculty } from '../constants/permissions';
import { adminPanelStyles } from '../constants/styles';
import { getDegreeTypeAccent, getTrackAccent } from './shared';

interface StudentRecord {
  id: string;
  displayName: string;
  email: string;
  studentId: string;
  facultyId: string;
  degreeType: 'bachelors' | 'masters' | null;
  major: string | null;
  yearOfStudy: number | null;
  track: 'thesis' | 'project' | null;
  hasActiveProject: boolean;
  isActive: boolean;
}

interface Props {
  lang: 'he' | 'en';
  isRtl: boolean;
}

const s = adminPanelStyles;

function majorLabel(facultyId: string, major: string | null, lang: 'he' | 'en'): string | null {
  if (!major) return null;
  const match = majorsForFaculty(facultyId).find((m) => m.slug === major);
  return match?.label[lang] ?? major;
}

export default function StudentsListSection({ lang, isRtl }: Props) {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .get('/api/admin/students-list')
      .then((res: any) => {
        if (!cancelled) setStudents(res.data?.students ?? []);
      })
      .catch((e: unknown) => {
        console.error('StudentsListSection fetch error:', e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter(
      (u) =>
        !q ||
        u.displayName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.studentId?.toLowerCase().includes(q)
    );
  }, [students, search]);

  if (loading) {
    return (
      <View style={{ padding: 20 }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View>
      <View style={s.searchBox}>
        <TextInput
          placeholder={lang === 'he' ? 'חפש סטודנט...' : 'Search students...'}
          value={search}
          onChangeText={setSearch}
          style={s.searchInput}
        />
      </View>

      <ScrollView>
        {filtered.map((u) => (
          <View key={u.id} style={s.projectMilestoneCard}>
            <Text style={s.projectTitle}>{u.displayName}</Text>
            <Text style={s.projectMeta}>{u.email}</Text>
            <Text style={s.projectMeta}>
              {facultyLabel(u.facultyId as FacultyId, lang)}
              {majorLabel(u.facultyId, u.major, lang) ? ` · ${majorLabel(u.facultyId, u.major, lang)}` : ''}
              {u.yearOfStudy != null ? ` · ${lang === 'he' ? `שנה ${u.yearOfStudy}` : `Year ${u.yearOfStudy}`}` : ''}
            </Text>
            {(() => {
              // Degree type (bachelors/masters) + track (thesis/project) as
              // colored badges — a second color dimension alongside the
              // faculty/major line above, same palette as web's
              // StudentsListTab (see lib/facultyColors.ts there,
              // components/shared.tsx's DEGREE_TYPE_ACCENT/TRACK_ACCENT here).
              const degreeAccent = getDegreeTypeAccent(u.degreeType);
              const trackAccent = getTrackAccent(u.track);
              if (!degreeAccent && !trackAccent) return null;
              return (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {degreeAccent && (
                    <View style={{ backgroundColor: degreeAccent.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: degreeAccent.text }}>
                        🎓 {degreeAccent.label[lang]}
                      </Text>
                    </View>
                  )}
                  {trackAccent && (
                    <View style={{ backgroundColor: trackAccent.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: trackAccent.text }}>
                        📘 {trackAccent.label[lang]}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })()}
            {u.hasActiveProject && (
              <Text style={[s.projectMeta, { marginTop: 4 }]}>
                {lang === 'he' ? '✅ פרויקט פעיל' : '✅ Active project'}
              </Text>
            )}
          </View>
        ))}
        {filtered.length === 0 && (
          <Text style={s.projectMeta}>{lang === 'he' ? 'לא נמצאו סטודנטים' : 'No students found'}</Text>
        )}
      </ScrollView>
    </View>
  );
}
