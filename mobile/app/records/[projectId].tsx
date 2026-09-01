// app/records/[projectId].tsx
// Shared, role-agnostic detail screen for the "project records" feature.
// Reached from every coordinator-tier role's drill-down (coordinator,
// administrative_coordinator, faculty_admin, program_head, grad_school_head)
// and from system_admin's deeper faculty → major → supervisor drill-down —
// see app/<role>/records/[supervisorId].tsx and app/admin/records/projects.tsx.
// GET /api/project-records/:projectId (server/src/services/projectRecords.ts)
// is itself the real authorization boundary for who may view a given
// project's record, so one shared screen here is safe instead of
// duplicating it once per role. Supervisors have their own dedicated detail
// screen at app/supervisor/records/[projectId].tsx (their own projects only,
// no cross-role sharing needed there).
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ProjectRecordTimeline } from '@/components/ProjectRecordTimeline';
import type { Lang } from '@/components/i18n';

export default function SharedProjectRecordDetailScreen() {
  const router = useRouter();
  const { projectId, lang: langParam } = useLocalSearchParams<{ projectId: string; lang?: string }>();
  // Carried forward from whichever list screen pushed here, but this screen
  // also offers its own toggle — it has no role-specific TopBar to borrow
  // one from, since it's shared across every role's drill-down.
  const [lang, setLang] = useState<Lang>(langParam === 'en' ? 'en' : 'he');
  const isRtl = lang === 'he';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8FA' }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/' as any))}
            style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center' }}
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#2E86FF' }}>
              {isRtl ? '→' : '←'} {lang === 'he' ? 'חזרה' : 'Back'}
            </Text>
          </Pressable>
          <Pressable onPress={() => setLang(lang === 'he' ? 'en' : 'he')} accessibilityRole="button">
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#6B7280' }}>
              {lang === 'he' ? 'EN' : 'עב'}
            </Text>
          </Pressable>
        </View>

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
