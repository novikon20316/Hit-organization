// app/supervisor/records.tsx
// Entry point for a supervisor's own "Project Records" — the permanent,
// read-only per-project timeline (see components/ProjectRecordTimeline.tsx).
// Lists this supervisor's own projects that already have at least one
// enrolled student (apiClient.getMyProjectRecords() deliberately excludes
// empty projects — see server/src/services/projectRecords.ts). Tap one to
// drill into its full timeline at records/[projectId].tsx.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiClient } from '@/src/api/apiClient';
import type { Lang } from '@/components/i18n';
import { ap } from '@/constants/theme';

interface RecordProject {
  id: string;
  titleHe: string;
  titleEn: string;
  status: string | null;
  supervisorId: string | null;
  enrolledStudentCount: number;
}

export default function SupervisorRecordsScreen() {
  const router = useRouter();
  const { lang: langParam } = useLocalSearchParams<{ lang?: string }>();
  const lang: Lang = langParam === 'en' ? 'en' : 'he';
  const isRtl = lang === 'he';

  const [projects, setProjects] = useState<RecordProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    apiClient.getMyProjectRecords()
      .then((res) => { if (!cancelled) setProjects(res.projects ?? []); })
      .catch((err) => {
        console.error('Failed to load project records:', err);
        if (!cancelled) setError(lang === 'he' ? 'טעינת הפרויקטים נכשלה' : 'Failed to load projects');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lang]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ap.surface }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/supervisor/dashboard' as any))}
          style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: 12 }}
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: ap.primary }}>
            {isRtl ? '→' : '←'} {lang === 'he' ? 'חזרה' : 'Back'}
          </Text>
        </Pressable>

        <Text style={{ fontSize: 20, fontWeight: '700', color: ap.onSurface }}>
          📜 {lang === 'he' ? 'רישומי פרויקטים' : 'Project Records'}
        </Text>
        <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, marginTop: 4 }}>
          {lang === 'he'
            ? 'רישום קבוע לצפייה בלבד של כל אחד מהפרויקטים שלך.'
            : 'A permanent, read-only record for each of your projects.'}
        </Text>

        {loading && <ActivityIndicator size="large" color={ap.primary} style={{ marginTop: 30 }} />}

        {!loading && !!error && (
          <View style={{ marginTop: 20, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 14 }}>
            <Text style={{ color: '#A8433A', fontSize: 13 }}>{error}</Text>
          </View>
        )}

        {!loading && !error && projects.length === 0 && (
          <View style={{ marginTop: 30, alignItems: 'center' }}>
            <Text style={{ fontSize: 32 }}>📭</Text>
            <Text style={{ marginTop: 8, fontSize: 13, color: ap.onSurfaceVariant, textAlign: 'center' }}>
              {lang === 'he'
                ? 'אין עדיין פרויקטים עם סטודנטים רשומים.'
                : 'No projects with enrolled students yet.'}
            </Text>
          </View>
        )}

        {!loading && !error && projects.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => router.push({ pathname: '/supervisor/records/[projectId]', params: { projectId: p.id, lang } } as any)}
            style={{ backgroundColor: ap.surfaceContainerLowest, borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: ap.outlineVariant }}
            accessibilityRole="link"
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: ap.onSurface, textAlign: isRtl ? 'right' : 'left' }}>
              {lang === 'he' ? p.titleHe : p.titleEn}
            </Text>
            <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, marginTop: 4, textAlign: isRtl ? 'right' : 'left' }}>
              {p.status ? `${p.status} · ` : ''}
              👥 {p.enrolledStudentCount} {lang === 'he' ? 'סטודנטים' : 'students'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
