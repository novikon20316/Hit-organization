// app/admin/records/faculty.tsx
// Second level of system_admin's Project Records drill-down: lists the
// majors within one faculty. There's no dedicated "one faculty" endpoint,
// so this re-fetches the same taxonomy admin/records.tsx already fetched
// (GET /api/project-records/faculties) and filters to the selected
// facultyId client-side. Tap a major to see supervisors at
// records/supervisors.tsx. This is a flat query-param navigation, not a
// nested dynamic folder — records/faculty.tsx, not records/[facultyId]/...
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiClient } from '@/src/api/apiClient';
import { facultyLabel, type FacultyId, type Lang } from '@/components/i18n';
import { getFacultyByKey, stripDegreePrefix } from '@/constants/faculties';

// Majors come back from the taxonomy endpoint as bare subject slugs (e.g.
// "computer_science") — this looks up the matching program's real bilingual
// label from the shared faculty/program constants, stripping the leading
// degree abbreviation (see stripDegreePrefix's own comment) since a slug can
// be shared by both a bachelor's and a master's program. Falls back to the
// raw slug if no matching program is found.
function majorLabel(facultyId: string, major: string, lang: Lang): string {
  const faculty = getFacultyByKey(facultyId);
  const program = faculty?.programs.find((p) => p.slug === major);
  return program ? stripDegreePrefix(program.label[lang]) : major;
}

export default function AdminRecordsFacultyScreen() {
  const router = useRouter();
  const { facultyId, lang: langParam } = useLocalSearchParams<{ facultyId: string; lang?: string }>();
  const lang: Lang = langParam === 'en' ? 'en' : 'he';
  const isRtl = lang === 'he';

  const [majors, setMajors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!facultyId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    apiClient.getFacultyTaxonomyForRecords()
      .then((res) => {
        if (cancelled) return;
        const entry = (res.faculties ?? []).find((f) => f.facultyId === facultyId);
        setMajors(entry?.majors ?? []);
      })
      .catch((err) => {
        console.error('Failed to load faculty majors:', err);
        if (!cancelled) setError(lang === 'he' ? 'טעינת המגמות נכשלה' : 'Failed to load majors');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [facultyId, lang]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8FA' }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: '/admin/records', params: { lang } } as any))}
          style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: 12 }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#2E86FF' }}>
            {isRtl ? '→' : '←'} {lang === 'he' ? 'חזרה לפקולטות' : 'Back to faculties'}
          </Text>
        </Pressable>

        <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827' }}>
          {facultyId ? facultyLabel(facultyId as FacultyId, lang) : ''}
        </Text>
        <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
          {lang === 'he' ? 'בחר/י מגמה כדי להמשיך.' : 'Choose a major to continue.'}
        </Text>

        {loading && <ActivityIndicator size="large" color="#2E86FF" style={{ marginTop: 30 }} />}

        {!loading && !!error && (
          <View style={{ marginTop: 20, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 14 }}>
            <Text style={{ color: '#A8433A', fontSize: 13 }}>{error}</Text>
          </View>
        )}

        {!loading && !error && majors.length === 0 && (
          <View style={{ marginTop: 30, alignItems: 'center' }}>
            <Text style={{ fontSize: 32 }}>📭</Text>
            <Text style={{ marginTop: 8, fontSize: 13, color: '#6B7280', textAlign: 'center' }}>
              {lang === 'he' ? 'אין מגמות בפקולטה זו.' : 'No majors in this faculty.'}
            </Text>
          </View>
        )}

        {!loading && !error && majors.map((m) => (
          <Pressable
            key={m}
            onPress={() => router.push({ pathname: '/admin/records/supervisors', params: { facultyId, major: m, lang } } as any)}
            style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#E5E7EB' }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827', textAlign: isRtl ? 'right' : 'left' }}>
              {majorLabel(facultyId, m, lang)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
