// app/coordinator/records/[supervisorId].tsx
// Second level of the faculty coordinator's Project Records drill-down:
// lists one supervisor's own projects that already have an enrolled
// student, then hands off to the shared, role-agnostic detail screen at
// app/records/[projectId].tsx — the backend's own auth check on
// GET /api/project-records/:projectId is the real authorization boundary,
// so there is no need for a separate detail screen per role.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiClient } from '@/src/api/apiClient';
import type { Lang } from '@/components/i18n';

interface RecordProject {
  id: string; titleHe: string; titleEn: string; status: string | null;
  supervisorId: string | null; enrolledStudentCount: number;
}

export default function CoordinatorSupervisorRecordsScreen() {
  const router = useRouter();
  const { supervisorId, lang: langParam } = useLocalSearchParams<{ supervisorId: string; lang?: string }>();
  const lang: Lang = langParam === 'en' ? 'en' : 'he';
  const isRtl = lang === 'he';

  const [projects, setProjects] = useState<RecordProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supervisorId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    apiClient.getSupervisorProjectRecords(supervisorId)
      .then((res) => { if (!cancelled) setProjects(res.projects ?? []); })
      .catch((err) => {
        console.error('Failed to load supervisor project records:', err);
        if (!cancelled) setError(lang === 'he' ? 'טעינת הפרויקטים נכשלה' : 'Failed to load projects');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [supervisorId, lang]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8FA' }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: '/coordinator/records', params: { lang } } as any))}
          style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: 12 }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#2E86FF' }}>
            {isRtl ? '→' : '←'} {lang === 'he' ? 'חזרה לרשימת המנחים' : 'Back to supervisors'}
          </Text>
        </Pressable>

        <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827' }}>
          📜 {lang === 'he' ? 'הפרויקטים של המנחה' : "Supervisor's Projects"}
        </Text>

        {loading && <ActivityIndicator size="large" color="#2E86FF" style={{ marginTop: 30 }} />}

        {!loading && !!error && (
          <View style={{ marginTop: 20, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 14 }}>
            <Text style={{ color: '#A8433A', fontSize: 13 }}>{error}</Text>
          </View>
        )}

        {!loading && !error && projects.length === 0 && (
          <View style={{ marginTop: 30, alignItems: 'center' }}>
            <Text style={{ fontSize: 32 }}>📭</Text>
            <Text style={{ marginTop: 8, fontSize: 13, color: '#6B7280', textAlign: 'center' }}>
              {lang === 'he'
                ? 'למנחה זה אין עדיין פרויקטים עם סטודנטים רשומים.'
                : 'This supervisor has no projects with enrolled students yet.'}
            </Text>
          </View>
        )}

        {!loading && !error && projects.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => router.push({ pathname: '/records/[projectId]', params: { projectId: p.id, lang } } as any)}
            style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#E5E7EB' }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827', textAlign: isRtl ? 'right' : 'left' }}>
              {lang === 'he' ? p.titleHe : p.titleEn}
            </Text>
            <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 4, textAlign: isRtl ? 'right' : 'left' }}>
              {p.status ? `${p.status} · ` : ''}
              👥 {p.enrolledStudentCount} {lang === 'he' ? 'סטודנטים' : 'students'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
