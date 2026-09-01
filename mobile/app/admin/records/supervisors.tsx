// app/admin/records/supervisors.tsx
// Third level of system_admin's Project Records drill-down: lists every
// supervisor in the selected faculty. getScopedSupervisorsForRecords()
// returns every supervisor system-wide for system_admin (unscoped) — this
// screen filters that list client-side to the selected facultyId, since the
// endpoint itself has no faculty filter param. `major` is carried through
// only for the breadcrumb title (a supervisor here only ever carries a
// facultyId, not a major restriction, so it can't actually filter this
// list). Tap a supervisor to see their projects at records/projects.tsx.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiClient } from '@/src/api/apiClient';
import { facultyLabel, type FacultyId, type Lang } from '@/components/i18n';
import { getFacultyByKey, stripDegreePrefix } from '@/constants/faculties';

interface SupervisorRow { id: string; displayName: string; email: string; facultyId: string; }

function majorLabel(facultyId: string, major: string, lang: Lang): string {
  const faculty = getFacultyByKey(facultyId);
  const program = faculty?.programs.find((p) => p.slug === major);
  return program ? stripDegreePrefix(program.label[lang]) : major;
}

export default function AdminRecordsSupervisorsScreen() {
  const router = useRouter();
  const { facultyId, major, lang: langParam } = useLocalSearchParams<{ facultyId: string; major?: string; lang?: string }>();
  const lang: Lang = langParam === 'en' ? 'en' : 'he';
  const isRtl = lang === 'he';

  const [supervisors, setSupervisors] = useState<SupervisorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!facultyId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    apiClient.getScopedSupervisorsForRecords()
      .then((res) => {
        if (cancelled) return;
        setSupervisors((res.supervisors ?? []).filter((s) => s.facultyId === facultyId));
      })
      .catch((err) => {
        console.error('Failed to load supervisors:', err);
        if (!cancelled) setError(lang === 'he' ? 'טעינת רשימת המנחים נכשלה' : 'Failed to load supervisors');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [facultyId, lang]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8FA' }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: '/admin/records/faculty', params: { facultyId, lang } } as any))}
          style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: 12 }}
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#2E86FF' }}>
            {isRtl ? '→' : '←'} {lang === 'he' ? 'חזרה למגמות' : 'Back to majors'}
          </Text>
        </Pressable>

        <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827' }}>
          {facultyId ? facultyLabel(facultyId as FacultyId, lang) : ''}
          {major ? ` · ${majorLabel(facultyId, major, lang)}` : ''}
        </Text>
        <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
          {lang === 'he' ? 'בחר/י מנחה כדי להמשיך.' : 'Choose a supervisor to continue.'}
        </Text>

        {loading && <ActivityIndicator size="large" color="#2E86FF" style={{ marginTop: 30 }} />}

        {!loading && !!error && (
          <View style={{ marginTop: 20, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 14 }}>
            <Text style={{ color: '#A8433A', fontSize: 13 }}>{error}</Text>
          </View>
        )}

        {!loading && !error && supervisors.length === 0 && (
          <View style={{ marginTop: 30, alignItems: 'center' }}>
            <Text style={{ fontSize: 32 }}>📭</Text>
            <Text style={{ marginTop: 8, fontSize: 13, color: '#6B7280', textAlign: 'center' }}>
              {lang === 'he' ? 'אין מנחים בפקולטה זו.' : 'No supervisors in this faculty.'}
            </Text>
          </View>
        )}

        {!loading && !error && supervisors.map((sup) => (
          <Pressable
            key={sup.id}
            onPress={() => router.push({ pathname: '/admin/records/projects', params: { facultyId, major: major ?? '', supervisorId: sup.id, lang } } as any)}
            style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#E5E7EB' }}
            accessibilityRole="link"
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827', textAlign: isRtl ? 'right' : 'left' }}>
              {sup.displayName}
            </Text>
            <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 4, textAlign: isRtl ? 'right' : 'left' }}>
              {sup.email}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
