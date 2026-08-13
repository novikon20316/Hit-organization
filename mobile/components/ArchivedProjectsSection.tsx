// components/ArchivedProjectsSection.tsx
// Mobile counterpart to web/components/ArchivedProjectsTab.tsx — shared by
// coordinator/home.tsx and admin/panel.tsx. Pending erasure requests to
// decide on, plus every archived project (search by name, milestone
// history, restore). See server/src/services/projectErasure.ts.

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { apiClient } from '@/src/api/apiClient';
import { tx, type Lang } from './i18n';

const MILESTONE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר', en: 'Research Proposal' },
  progress_report: { he: 'דו"ח התקדמות', en: 'Progress Report' },
  final_report: { he: 'דו"ח מסכם', en: 'Final Report' },
  defense: { he: 'הגנה', en: 'Defense' },
  poster: { he: 'פוסטר', en: 'Poster Session' },
};

interface ErasureRequest {
  id: string;
  projectTitleHe: string;
  projectTitleEn: string;
  requestedByRole: string;
  reason: string;
}

interface ArchivedProject {
  id: string;
  titleHe: string;
  titleEn: string;
  facultyId: string;
  supervisorName: string;
  enrolledStudentNames: string[];
  deletedAt: string | null;
  milestones: Array<{ id?: string; type: string; status: string }>;
}

export function ArchivedProjectsSection({ lang }: { lang: Lang }) {
  const t = (key: Parameters<typeof tx>[0]) => tx(key, lang);
  const [requests, setRequests] = useState<ErasureRequest[]>([]);
  const [projects, setProjects] = useState<ArchivedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [rejectReasonById, setRejectReasonById] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setLoadError('');
    Promise.all([apiClient.listPendingErasureRequests(), apiClient.listArchivedProjects()])
      .then(([reqRes, projRes]) => {
        setRequests(reqRes.requests ?? []);
        setProjects(projRes.projects ?? []);
      })
      .catch((err: unknown) => {
        console.error('Failed to load archived projects:', err);
        setLoadError(lang === 'he' ? 'טעינת הארכיון נכשלה' : 'Failed to load the archive');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    setError('');
    if (decision === 'rejected' && !rejectReasonById[id]?.trim()) {
      setError(t('rejectErasureReasonRequired'));
      return;
    }
    setDecidingId(id);
    try {
      await apiClient.decideErasureRequest(id, decision, rejectReasonById[id]?.trim());
      load();
    } catch (err) {
      setError(lang === 'he' ? 'הפעולה נכשלה' : 'Action failed');
    } finally {
      setDecidingId(null);
    }
  };

  const restore = async (id: string) => {
    setRestoringId(id);
    try {
      await apiClient.restoreProject(id);
      load();
    } catch (err) {
      setError(lang === 'he' ? 'השחזור נכשל' : 'Restore failed');
    } finally {
      setRestoringId(null);
    }
  };

  if (loading) return <ActivityIndicator style={{ marginVertical: 12 }} />;

  const filteredProjects = projects.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.titleHe?.toLowerCase().includes(q) || p.titleEn?.toLowerCase().includes(q);
  });

  return (
    <View>
      {loadError ? <Text style={{ fontSize: 12, color: '#A8433A', marginBottom: 8 }}>⚠️ {loadError}</Text> : null}
      {error ? <Text style={{ fontSize: 12, color: '#A8433A', marginBottom: 8 }}>{error}</Text> : null}

      <Text style={{ fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 8 }}>
        {t('pendingErasureRequests')} {requests.length > 0 ? `(${requests.length})` : ''}
      </Text>
      {requests.length === 0 ? (
        <Text style={{ fontSize: 12, color: '#8899BB', marginBottom: 16 }}>{t('noErasureRequests')}</Text>
      ) : (
        requests.map((r) => (
          <View key={r.id} style={{ backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#F2C7C2', padding: 12, marginBottom: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#111' }}>{lang === 'he' ? r.projectTitleHe : r.projectTitleEn}</Text>
            <Text style={{ fontSize: 11, color: '#8899BB', marginTop: 2 }}>{t('erasureRequestedBy')}: {r.requestedByRole}</Text>
            <Text style={{ fontSize: 12, color: '#111', marginTop: 4 }}>{t('erasureReason')}: {r.reason}</Text>

            <TextInput
              value={rejectReasonById[r.id] ?? ''}
              onChangeText={(text) => setRejectReasonById((prev) => ({ ...prev, [r.id]: text }))}
              placeholder={t('rejectErasureReasonRequired')}
              placeholderTextColor="#9CA3AF"
              style={{ borderWidth: 1, borderColor: '#D0DEFF', borderRadius: 8, padding: 8, marginTop: 8, fontSize: 12 }}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Pressable
                onPress={() => decide(r.id, 'rejected')}
                disabled={decidingId === r.id}
                style={{ borderWidth: 1, borderColor: '#A8433A', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, opacity: decidingId === r.id ? 0.6 : 1 }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#A8433A' }}>{t('rejectErasure')}</Text>
              </Pressable>
              <Pressable
                onPress={() => decide(r.id, 'approved')}
                disabled={decidingId === r.id}
                style={{ backgroundColor: '#2E86FF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, opacity: decidingId === r.id ? 0.6 : 1 }}
              >
                {decidingId === r.id
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{t('approveErasure')}</Text>}
              </Pressable>
            </View>
          </View>
        ))
      )}

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={t('searchArchivedProjects')}
        placeholderTextColor="#9CA3AF"
        style={{ borderWidth: 1, borderColor: '#D0DEFF', borderRadius: 8, padding: 10, marginTop: 8, marginBottom: 12, fontSize: 13 }}
      />

      {filteredProjects.length === 0 ? (
        <Text style={{ fontSize: 12, color: '#8899BB' }}>{t('noArchivedProjects')}</Text>
      ) : (
        filteredProjects.map((p) => {
          const isOpen = !!expanded[p.id];
          return (
            <View key={p.id} style={{ backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', padding: 12, marginBottom: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#111' }}>{lang === 'he' ? p.titleHe : p.titleEn}</Text>
              {p.deletedAt ? (
                <Text style={{ fontSize: 11, color: '#8899BB', marginTop: 2 }}>
                  {t('erasedOn')}: {new Date(p.deletedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}
                </Text>
              ) : null}
              <Text style={{ fontSize: 12, color: '#8899BB', marginTop: 2 }}>
                👨‍🏫 {p.supervisorName || (lang === 'he' ? 'ללא מנחה' : 'No Supervisor')}
              </Text>
              <Text style={{ fontSize: 12, color: '#8899BB', marginTop: 2 }}>
                👥 {p.enrolledStudentNames.join(', ') || (lang === 'he' ? 'אין סטודנטים' : 'No students')}
              </Text>

              <Pressable onPress={() => setExpanded((prev) => ({ ...prev, [p.id]: !prev[p.id] }))} style={{ marginTop: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#2E86FF' }}>
                  {isOpen ? '▲' : '▼'} {lang === 'he' ? 'התקדמות' : 'Progress'}
                </Text>
              </Pressable>

              {isOpen && (
                <View style={{ backgroundColor: '#F9FAFB', borderRadius: 8, padding: 8, marginTop: 6 }}>
                  {p.milestones.length === 0 ? (
                    <Text style={{ fontSize: 11, color: '#8899BB' }}>{lang === 'he' ? 'לא נוצרו אבני דרך' : 'No milestones created'}</Text>
                  ) : (
                    p.milestones.map((m, idx) => (
                      <View key={m.id ?? idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#111' }}>{MILESTONE_LABEL[m.type]?.[lang] ?? m.type}</Text>
                        <Text style={{ fontSize: 11, color: '#8899BB' }}>{m.status}</Text>
                      </View>
                    ))
                  )}
                </View>
              )}

              <Pressable
                onPress={() => restore(p.id)}
                disabled={restoringId === p.id}
                style={{ borderWidth: 1, borderColor: '#D0DEFF', borderRadius: 8, paddingVertical: 8, marginTop: 8, alignItems: 'center', opacity: restoringId === p.id ? 0.6 : 1 }}
              >
                {restoringId === p.id
                  ? <ActivityIndicator size="small" />
                  : <Text style={{ fontSize: 12, fontWeight: '600', color: '#111' }}>♻️ {t('restoreProject')}</Text>}
              </Pressable>
            </View>
          );
        })
      )}
    </View>
  );
}
