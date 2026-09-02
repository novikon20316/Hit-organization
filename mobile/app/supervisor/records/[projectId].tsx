// app/supervisor/records/[projectId].tsx
// Full permanent, read-only timeline for one of this supervisor's own
// projects — reached from supervisor/records.tsx. Renders the shared
// ProjectRecordTimeline component; the backend's own auth check on
// GET /api/project-records/:projectId is what actually enforces that this
// project belongs to the requesting supervisor.
import React from 'react';
import { Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ProjectRecordTimeline } from '@/components/ProjectRecordTimeline';
import type { Lang } from '@/components/i18n';
import { ap } from '@/constants/theme';

export default function SupervisorRecordDetailScreen() {
  const router = useRouter();
  const { projectId, lang: langParam } = useLocalSearchParams<{ projectId: string; lang?: string }>();
  const lang: Lang = langParam === 'en' ? 'en' : 'he';
  const isRtl = lang === 'he';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ap.surface }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: '/supervisor/records', params: { lang } } as any))}
          style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: 12 }}
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: ap.primary }}>
            {isRtl ? '→' : '←'} {lang === 'he' ? 'חזרה לרשימת הפרויקטים' : 'Back to projects'}
          </Text>
        </Pressable>

        {projectId ? (
          <ProjectRecordTimeline projectId={projectId} lang={lang} />
        ) : (
          <Text style={{ color: '#A8433A', fontSize: 13 }}>
            {lang === 'he' ? 'פרויקט לא נמצא' : 'Project not found'}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
