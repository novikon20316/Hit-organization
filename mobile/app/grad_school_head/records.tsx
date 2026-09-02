// app/grad_school_head/records.tsx
// Entry point for the graduate school head's "Project Records" drill-down:
// lists every supervisor system-wide (the server resolves this role's scope
// as unrestricted — see apiClient.getScopedSupervisorsForRecords() and
// server/src/services/projectRecords.ts). Tap a supervisor to see their
// projects at records/[supervisorId].tsx.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiClient } from '@/src/api/apiClient';
import type { Lang } from '@/components/i18n';
import { ap } from '@/constants/theme';

interface SupervisorRow { id: string; displayName: string; email: string; facultyId: string; }

export default function GradSchoolHeadRecordsScreen() {
  const router = useRouter();
  const { lang: langParam } = useLocalSearchParams<{ lang?: string }>();
  const lang: Lang = langParam === 'en' ? 'en' : 'he';
  const isRtl = lang === 'he';

  const [supervisors, setSupervisors] = useState<SupervisorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    apiClient.getScopedSupervisorsForRecords()
      .then((res) => { if (!cancelled) setSupervisors(res.supervisors ?? []); })
      .catch((err) => {
        console.error('Failed to load supervisors:', err);
        if (!cancelled) setError(lang === 'he' ? 'טעינת רשימת המנחים נכשלה' : 'Failed to load supervisors');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lang]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ap.surface }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/grad_school_head/grad_school_head_dashboard' as any))}
          style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: 12 }}
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#2E86FF' }}>
            {isRtl ? '→' : '←'} {lang === 'he' ? 'חזרה' : 'Back'}
          </Text>
        </Pressable>

        <Text style={{ fontSize: 20, fontWeight: '700', color: ap.onSurface }}>
          📜 {lang === 'he' ? 'רישומי פרויקטים' : 'Project Records'}
        </Text>
        <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, marginTop: 4 }}>
          {lang === 'he' ? 'בחר/י מנחה כדי לצפות בפרויקטים שלו/שלה.' : "Choose a supervisor to see their projects."}
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
            <Text style={{ marginTop: 8, fontSize: 13, color: ap.onSurfaceVariant, textAlign: 'center' }}>
              {lang === 'he' ? 'אין מנחים בהיקף שלך.' : 'No supervisors in your scope.'}
            </Text>
          </View>
        )}

        {!loading && !error && supervisors.map((sup) => (
          <Pressable
            key={sup.id}
            onPress={() => router.push({ pathname: '/grad_school_head/records/[supervisorId]', params: { supervisorId: sup.id, lang } } as any)}
            style={{ backgroundColor: ap.surfaceContainerLowest, borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: ap.outlineVariant }}
            accessibilityRole="link"
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: ap.onSurface, textAlign: isRtl ? 'right' : 'left' }}>
              {sup.displayName}
            </Text>
            <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, marginTop: 4, textAlign: isRtl ? 'right' : 'left' }}>
              {sup.email}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
