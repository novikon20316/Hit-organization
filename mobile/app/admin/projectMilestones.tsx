// app/admin/projectMilestones.tsx
// Reached from admin/panel.tsx's Milestones tab (tap a project card). Mirrors
// web's app/admin/projects/[projectId]/milestones/page.tsx: that page's own
// header comment explains this mobile screen used to call a broken endpoint
// (GET /api/projects/:projectId/milestones expecting a `.data.milestones`
// shape that endpoint never returns) — this now calls the real,
// system_admin-gated endpoint instead, GET /api/admin/milestones?projectId=
// (adminController.ts's getAdminProjectMilestones, a bare array of raw
// milestone docs), and renders it with the shared "Mobile Milestone Tracker
// with Files" component (components/MilestoneRoadmap.tsx). Project header
// info (title/faculty/supervisor/student count) comes from the same
// GET /api/admin/dashboard-summary call panel.tsx itself already uses,
// filtered down to this one project client-side — there's no dedicated
// "get one admin project" endpoint.

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiClient } from '../../src/api/apiClient';
import { MilestoneRoadmap, type RoadmapMilestone } from '@/components/MilestoneRoadmap';
import { milestonePalette as p, milestoneRadius as radius, milestoneSpacing as spacing } from '@/constants/milestoneTheme';
import { facultyLabel, type FacultyId } from '@/components/i18n';

interface AdminProject {
  id: string;
  titleHe?: string;
  titleEn?: string;
  facultyId?: string;
  status?: string;
  supervisorName?: string;
  enrolledStudentIds?: string[];
  descriptionHe?: string;
  descriptionEn?: string;
}

// Same `{ _seconds, _nanoseconds }` vs ISO-string vs client-Timestamp
// normalization web's page uses — required because, unlike GET
// /api/milestones, this admin endpoint doesn't convert Timestamps to ISO
// strings server-side.
function toISO(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === 'object') {
    const obj = value as { toDate?: () => Date; _seconds?: number };
    if (typeof obj.toDate === 'function') return obj.toDate().toISOString();
    if (typeof obj._seconds === 'number') return new Date(obj._seconds * 1000).toISOString();
  }
  return null;
}

const LEGACY_TYPE_ORDER: Record<string, number> = {
  research_proposal: 0,
  progress_report: 1,
  final_report: 2,
  defense: 3,
  poster: 4,
};

function resolveOrder(m: { type?: string; order?: unknown }): number {
  if (typeof m.order === 'number') return m.order;
  const idx = m.type ? LEGACY_TYPE_ORDER[m.type] : undefined;
  return idx ?? Number.MAX_SAFE_INTEGER;
}

function toRoadmapMilestone(raw: Record<string, unknown> & { id: string }): RoadmapMilestone {
  return {
    id: raw.id,
    type: typeof raw.type === 'string' ? raw.type : 'research_proposal',
    status: typeof raw.status === 'string' ? raw.status : 'pending',
    dueDate: toISO(raw.dueDate),
    submittedAt: toISO(raw.submittedAt),
    fileUrls: Array.isArray(raw.fileUrls) ? (raw.fileUrls as string[]) : [],
    finalGrade: typeof raw.finalGrade === 'number' ? raw.finalGrade : null,
    defenseDate: toISO(raw.defenseDate),
    defenseRoom: typeof raw.defenseRoom === 'string' ? raw.defenseRoom : null,
    defenseBuilding: typeof raw.defenseBuilding === 'string' ? raw.defenseBuilding : null,
    defenseTime: typeof raw.defenseTime === 'string' ? raw.defenseTime : null,
    onlineDefenseLink: typeof raw.onlineDefenseLink === 'string' ? raw.onlineDefenseLink : null,
  };
}

export default function ProjectMilestonesScreen() {
  const router = useRouter();
  const { projectId, lang: langParam } = useLocalSearchParams<{ projectId: string; lang?: string }>();
  const lang: 'he' | 'en' = langParam === 'en' ? 'en' : 'he';
  const isRtl = lang === 'he';

  const [project, setProject] = useState<AdminProject | null>(null);
  const [milestones, setMilestones] = useState<RoadmapMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const [summaryRes, milestonesRes] = await Promise.all([
          apiClient.get('/api/admin/dashboard-summary'),
          apiClient.get('/api/admin/milestones', { params: { projectId } }),
        ]);
        if (cancelled) return;

        const projects: AdminProject[] = summaryRes.data?.projects ?? [];
        setProject(projects.find((p2) => p2.id === projectId) ?? null);

        const raw: Array<Record<string, unknown> & { id: string }> = milestonesRes.data ?? [];
        const mapped = raw.map(toRoadmapMilestone).sort((a, b) => resolveOrder(a) - resolveOrder(b));
        setMilestones(mapped);
      } catch (err) {
        console.error('Failed to load project milestones:', err);
        if (!cancelled) setError(lang === 'he' ? 'טעינת הנתונים נכשלה' : 'Failed to load data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, lang]);

  const title = project ? (lang === 'he' ? project.titleHe : project.titleEn) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.surfaceContainerLow }}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 40, gap: spacing.sm }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin/panel' as any))}
          style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: spacing.xs }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: p.primary }}>
            {isRtl ? '→' : '←'} {lang === 'he' ? 'חזרה לפאנל הניהול' : 'Back to admin panel'}
          </Text>
        </Pressable>

        {loading && <ActivityIndicator size="large" color={p.primary} style={{ marginTop: 24 }} />}
        {!!error && (
          <View style={{ backgroundColor: p.errorContainer, borderRadius: radius.md, padding: spacing.md }}>
            <Text style={{ color: p.error, fontSize: 13 }}>{error}</Text>
          </View>
        )}

        {!loading && !error && (
          <>
            <View
              style={{
                backgroundColor: p.surface,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: p.outlineVariant,
                padding: spacing.md,
                borderLeftWidth: 4,
                borderLeftColor: p.primary,
              }}
            >
              {project ? (
                <>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: p.onSurfaceVariant, textTransform: 'uppercase' }}>
                    {project.facultyId ? facultyLabel(project.facultyId as FacultyId, lang) : ''} {project.status ? `· ${project.status}` : ''}
                  </Text>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: p.onSurface, marginTop: 4 }}>{title || '—'}</Text>
                  <Text style={{ fontSize: 12, color: p.onSurfaceVariant, marginTop: 4 }}>
                    👨‍🏫 {project.supervisorName || (lang === 'he' ? 'ללא מנחה' : 'No Supervisor')}
                    {'  ·  '}
                    👥 {project.enrolledStudentIds?.length ?? 0} {lang === 'he' ? 'סטודנטים' : 'students'}
                  </Text>
                  {(project.descriptionHe || project.descriptionEn) && (
                    <Text style={{ fontSize: 12, color: p.onSurfaceVariant, marginTop: 6 }}>
                      {lang === 'he' ? project.descriptionHe : project.descriptionEn}
                    </Text>
                  )}
                </>
              ) : (
                <Text style={{ fontSize: 13, color: p.onSurfaceVariant }}>{lang === 'he' ? 'הפרויקט לא נמצא' : 'Project not found'}</Text>
              )}
            </View>

            <MilestoneRoadmap milestones={milestones} lang={lang} isRtl={isRtl} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
