// app/admin/records.tsx
// Entry point for system_admin's "Project Records" drill-down: faculty →
// major → supervisor → project detail. This first level lists every
// faculty in the system's taxonomy (GET /api/project-records/faculties,
// system_admin only — see apiClient.getFacultyTaxonomyForRecords() and
// server/src/services/projectRecords.ts). Tap a faculty to see its majors
// at records/faculty.tsx.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiClient } from '@/src/api/apiClient';
import { facultyLabel, type FacultyId, type Lang } from '@/components/i18n';

interface FacultyRow { facultyId: string; majors: string[]; }

export default function AdminRecordsScreen() {
  const router = useRouter();
  const { lang: langParam } = useLocalSearchParams<{ lang?: string }>();
  const lang: Lang = langParam === 'en' ? 'en' : 'he';
  const isRtl = lang === 'he';

  const [faculties, setFaculties] = useState<FacultyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    apiClient.getFacultyTaxonomyForRecords()
      .then((res) => { if (!cancelled) setFaculties(res.faculties ?? []); })
      .catch((err) => {
        console.error('Failed to load faculty taxonomy:', err);
        if (!cancelled) setError(lang === 'he' ? 'טעינת רשימת הפקולטות נכשלה' : 'Failed to load faculties');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lang]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8FA' }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin/panel' as any))}
          style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: 12 }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#2E86FF' }}>
            {isRtl ? '→' : '←'} {lang === 'he' ? 'חזרה לפאנל הניהול' : 'Back to admin panel'}
          </Text>
        </Pressable>

        <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827' }}>
          📜 {lang === 'he' ? 'רישומי פרויקטים' : 'Project Records'}
        </Text>
        <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
          {lang === 'he' ? 'בחר/י פקולטה כדי להמשיך.' : 'Choose a faculty to continue.'}
        </Text>

        {loading && <ActivityIndicator size="large" color="#2E86FF" style={{ marginTop: 30 }} />}

        {!loading && !!error && (
          <View style={{ marginTop: 20, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 14 }}>
            <Text style={{ color: '#A8433A', fontSize: 13 }}>{error}</Text>
          </View>
        )}

        {!loading && !error && faculties.length === 0 && (
          <View style={{ marginTop: 30, alignItems: 'center' }}>
            <Text style={{ fontSize: 32 }}>📭</Text>
            <Text style={{ marginTop: 8, fontSize: 13, color: '#6B7280', textAlign: 'center' }}>
              {lang === 'he' ? 'לא נמצאו פקולטות.' : 'No faculties found.'}
            </Text>
          </View>
        )}

        {!loading && !error && faculties.map((f) => (
          <Pressable
            key={f.facultyId}
            onPress={() => router.push({ pathname: '/admin/records/faculty', params: { facultyId: f.facultyId, lang } } as any)}
            style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#E5E7EB' }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827', textAlign: isRtl ? 'right' : 'left' }}>
              {facultyLabel(f.facultyId as FacultyId, lang)}
            </Text>
            <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 4, textAlign: isRtl ? 'right' : 'left' }}>
              {f.majors.length} {lang === 'he' ? 'מגמות' : 'majors'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
