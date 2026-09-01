// app/(tabs)/BrowseSupervisors.tsx
// Shown instead of Browseprojects.tsx when the student's faculty+degree's
// approved workflow-template configured firstStepMode: 'choose_supervisor'
// (see hooks/useStudentData.ts, server's workflowTemplates.ts's
// resolveFirstStepMode). Supervisor-grouped view of the same eligible-project
// data Browseprojects.tsx shows flat — the student still ends up applying to
// (or being enrolled in) one of the supervisor's existing projects, just
// discovered this way instead. Mirrors web/app/student/home/BrowseSupervisors.tsx.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Modal, ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { auth } from '../../src/firebase/firebase';
import { tx, type Lang } from '../../components/i18n';
import { apiClient } from '../../src/api/apiClient';
import type { PendingApplication } from '@/types';
import ApplicationStatusCard from '@/components/ApplicationStatusCard';

interface BrowseSupervisorProject {
  id: string;
  titleHe: string;
  titleEn: string;
  descriptionHe: string;
  descriptionEn: string;
  projectTypes: string[];
  major: string | null;
  remainingCapacity: number;
}

interface BrowseSupervisorEntry {
  supervisorId: string;
  supervisorName: string;
  projects: BrowseSupervisorProject[];
}

interface Props {
  lang: Lang;
  isRtl: boolean;
  pendingApplications: PendingApplication[];
  supervisorSelectionRequiresApproval: boolean;
  onApplicationsChanged: () => void;
}

function isPdfAsset(asset: { mimeType?: string; name?: string }): boolean {
  return asset.mimeType === 'application/pdf' || (asset.name ?? '').toLowerCase().endsWith('.pdf');
}

async function uploadFile(uri: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const formData = new FormData();
    formData.append('file', { uri, type: 'application/pdf', name: 'document.pdf' } as any);
    formData.append('upload_preset', 'student_uploads');
    const response = await fetch('https://api.cloudinary.com/v1_1/dp7stlfas/raw/upload', {
      method: 'POST', body: formData, signal: controller.signal,
    });
    const data = await response.json();
    return data.secure_url;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default function BrowseSupervisors({ lang, isRtl, pendingApplications, supervisorSelectionRequiresApproval, onApplicationsChanged }: Props) {
  const appliedProjectIds = useMemo(() => pendingApplications.map((a) => a.projectId), [pendingApplications]);

  const [supervisors, setSupervisors] = useState<BrowseSupervisorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [expandedSupervisorId, setExpandedSupervisorId] = useState<string | null>(null);

  // Apply modal (approval-required path).
  const [applyTarget, setApplyTarget] = useState<BrowseSupervisorProject | null>(null);
  const [coverNote, setCoverNote] = useState('');
  const [transcriptUri, setTranscriptUri] = useState<string | null>(null);
  const [transcriptName, setTranscriptName] = useState<string | null>(null);
  const [cvUri, setCvUri] = useState<string | null>(null);
  const [cvName, setCvName] = useState<string | null>(null);
  const [lastTranscriptUrl, setLastTranscriptUrl] = useState('');
  const [lastCvUrl, setLastCvUrl] = useState('');
  const [selectedProjectType, setSelectedProjectType] = useState<'project' | 'thesis' | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  // Direct-join confirm (no-approval path).
  const [joinTarget, setJoinTarget] = useState<BrowseSupervisorProject | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const fetchSupervisors = () => {
    setLoading(true);
    setLoadError('');
    apiClient.get('/api/student/browse-supervisors')
      .then((res) => setSupervisors(res.data?.supervisors ?? []))
      .catch(() => setLoadError(lang === 'he' ? 'טעינת המנחים נכשלה' : 'Failed to load supervisors'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSupervisors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return supervisors;
    return supervisors
      .map((s) => ({
        ...s,
        projects: s.projects.filter(
          (p) => s.supervisorName.toLowerCase().includes(q) || (lang === 'he' ? p.titleHe : p.titleEn)?.toLowerCase().includes(q)
        ),
      }))
      .filter((s) => s.projects.length > 0 || s.supervisorName.toLowerCase().includes(q));
  }, [supervisors, search, lang]);

  const projectTypeLabel = (tp: string) => (tp === 'project' ? (lang === 'he' ? 'פרויקט' : 'Project') : lang === 'he' ? 'תזה' : 'Thesis');

  const openApply = (project: BrowseSupervisorProject) => {
    setApplyTarget(project);
    setSelectedProjectType(project.projectTypes.length === 1 ? (project.projectTypes[0] as 'project' | 'thesis') : '');
    setApplyMessage(null);
    setCoverNote('');
    setTranscriptUri(null);
    setTranscriptName(null);
    setCvUri(null);
    setCvName(null);
    setLastTranscriptUrl('');
    setLastCvUrl('');
    apiClient.get('/api/applications/last-uploaded-files')
      .then((res) => {
        setLastTranscriptUrl(res.data?.transcriptUrl ?? '');
        setLastCvUrl(res.data?.cvUrl ?? '');
      })
      .catch(() => {});
  };

  const pickFile = async (type: 'transcript' | 'cv') => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (!isPdfAsset(asset)) {
      setApplyMessage(lang === 'he' ? 'ניתן להעלות קובצי PDF בלבד' : 'Only PDF files can be uploaded');
      return;
    }
    if (type === 'transcript') {
      setTranscriptUri(asset.uri);
      setTranscriptName(asset.name);
    } else {
      setCvUri(asset.uri);
      setCvName(asset.name);
    }
  };

  const handleApply = async () => {
    if (!applyTarget || (!transcriptUri && !lastTranscriptUrl) || (!cvUri && !lastCvUrl)) {
      setApplyMessage(lang === 'he' ? 'אנא העלה גיליון ציונים וקורות חיים' : 'Please upload transcript and CV');
      return;
    }
    if (applyTarget.projectTypes.length > 1 && !selectedProjectType) {
      setApplyMessage(lang === 'he' ? 'פרויקט זה מציע יותר ממסלול אחד — יש לבחור מסלול' : 'This project offers more than one track — please choose one');
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSubmitting(true);
    setApplyMessage(null);
    try {
      const [transcriptUrl, cvUrl] = await Promise.all([
        transcriptUri ? uploadFile(transcriptUri) : Promise.resolve(lastTranscriptUrl),
        cvUri ? uploadFile(cvUri) : Promise.resolve(lastCvUrl),
      ]);
      await apiClient.post('/api/applications/apply', {
        projectId: applyTarget.id,
        transcriptUrl,
        cvUrl,
        notes: coverNote,
        ...(selectedProjectType ? { selectedProjectType } : {}),
      });
      setApplyMessage('✅ ' + tx('applySuccess', lang));
      onApplicationsChanged();
      setTimeout(() => setApplyTarget(null), 1500);
    } catch (e: any) {
      if (e?.response?.status === 409) {
        setApplyMessage(lang === 'he' ? '⚠️ כבר הגשת מועמדות לפרויקט זה' : '⚠️ You already applied to this project');
      } else {
        setApplyMessage(lang === 'he' ? 'שגיאה בהגשת המועמדות' : 'Failed to submit application');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinDirect = async () => {
    if (!joinTarget) return;
    setJoining(true);
    setJoinError('');
    try {
      await apiClient.post('/api/student/join-project-direct', { projectId: joinTarget.id });
      setJoinTarget(null);
      onApplicationsChanged();
    } catch (e: any) {
      setJoinError(e?.response?.data?.message ?? (lang === 'he' ? 'ההצטרפות נכשלה' : 'Failed to join'));
    } finally {
      setJoining(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
      {pendingApplications.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8, textAlign: isRtl ? 'right' : 'left' }}>
            {lang === 'he' ? 'הבקשות שלי' : 'My Applications'} ({pendingApplications.length})
          </Text>
          {pendingApplications.map((app) => (
            <ApplicationStatusCard key={app.id} application={app} onWithdrawn={onApplicationsChanged} lang={lang} isRtl={isRtl} />
          ))}
        </View>
      )}

      <Text style={{ fontSize: 12, color: '#8899BB', marginBottom: 8, textAlign: isRtl ? 'right' : 'left' }}>
        {lang === 'he' ? 'בחר/י מנחה כדי לראות את הפרויקטים/תזות הפתוחים שלו/שלה.' : 'Choose a supervisor to see their open projects/theses.'}
      </Text>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={lang === 'he' ? 'חיפוש לפי שם מנחה או פרויקט...' : 'Search by supervisor or project name...'}
        style={{ borderWidth: 1, borderColor: '#D0DEFF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, textAlign: isRtl ? 'right' : 'left' }}
      />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 16 }} color="#2E86FF" />
      ) : loadError ? (
        <Text style={{ marginTop: 16, color: '#EF4444' }}>{loadError}</Text>
      ) : (
        <>
          <Text style={{ marginTop: 12, fontSize: 12, color: '#8899BB' }}>
            {filtered.length} {lang === 'he' ? 'מנחים' : 'supervisors'}
          </Text>
          {filtered.length === 0 && (
            <Text style={{ marginTop: 8, fontSize: 13, color: '#8899BB' }}>
              {lang === 'he' ? '📭 לא נמצאו מנחים' : '📭 No supervisors found'}
            </Text>
          )}
          {filtered.map((s) => {
            const isExpanded = expandedSupervisorId === s.supervisorId;
            return (
              <View key={s.supervisorId} style={{ marginTop: 8, borderWidth: 1, borderColor: '#E5EAF5', borderRadius: 12, padding: 14, backgroundColor: '#fff' }}>
                <Pressable
                  onPress={() => setExpandedSupervisorId(isExpanded ? null : s.supervisorId)}
                  accessibilityRole="button"
                >
                  <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: '600' }}>👨‍🏫 {s.supervisorName}</Text>
                      <Text style={{ marginTop: 2, fontSize: 12, color: '#8899BB' }}>
                        {s.projects.length} {lang === 'he' ? 'פרויקטים/תזות פתוחים' : 'open projects/theses'}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: '#8899BB' }}>{isExpanded ? '▲' : '▼'}</Text>
                  </View>
                </Pressable>

                {isExpanded && (
                  <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: '#E5EAF5', paddingTop: 10, gap: 8 }}>
                    {s.projects.map((p) => {
                      const alreadyApplied = appliedProjectIds.includes(p.id);
                      return (
                        <View key={p.id} style={{ borderWidth: 1, borderColor: '#E5EAF5', borderRadius: 10, padding: 10, backgroundColor: '#F8FAFF' }}>
                          <Text style={{ fontSize: 13, fontWeight: '600' }}>{lang === 'he' ? p.titleHe : p.titleEn}</Text>
                          <Text style={{ marginTop: 2, fontSize: 12, color: '#8899BB' }}>{lang === 'he' ? p.descriptionHe : p.descriptionEn}</Text>
                          <Text style={{ marginTop: 2, fontSize: 12, color: '#8899BB' }}>
                            👥 {lang === 'he' ? 'מקומות פנויים:' : 'Open seats:'} {p.remainingCapacity}
                          </Text>
                          {alreadyApplied ? (
                            <View style={{ marginTop: 8, backgroundColor: '#F59E0B', borderRadius: 8, paddingVertical: 8, alignItems: 'center' }}>
                              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                                {lang === 'he' ? '✓ בקשה נשלחה' : '✓ Sent Application'}
                              </Text>
                            </View>
                          ) : (
                            <Pressable
                              onPress={() => (supervisorSelectionRequiresApproval ? openApply(p) : setJoinTarget(p))}
                              style={{ marginTop: 8, backgroundColor: '#2E86FF', borderRadius: 8, paddingVertical: 8, alignItems: 'center' }}
                              accessibilityRole="button"
                            >
                              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                                {supervisorSelectionRequiresApproval
                                  ? lang === 'he' ? 'הגש מועמדות' : 'Apply'
                                  : lang === 'he' ? 'הצטרף/י' : 'Join'}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}

      {/* ── Apply modal ── */}
      <Modal visible={!!applyTarget} animationType="slide" transparent onRequestClose={() => setApplyTarget(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '85%' }}>
            <ScrollView>
              <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 16, fontWeight: '700' }}>{lang === 'he' ? 'הגשת מועמדות' : 'Apply to Project'}</Text>
                <Pressable
                  onPress={() => setApplyTarget(null)}
                  accessibilityRole="button"
                  accessibilityLabel={lang === 'he' ? 'סגור' : 'Close'}
                ><Text style={{ fontSize: 16 }}>✕</Text></Pressable>
              </View>
              {applyTarget && <Text style={{ marginTop: 4, fontSize: 13, color: '#8899BB' }}>{lang === 'he' ? applyTarget.titleHe : applyTarget.titleEn}</Text>}

              {applyTarget && applyTarget.projectTypes.length > 1 && (
                <View style={{ marginTop: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', marginBottom: 6 }}>{lang === 'he' ? 'מסלול *' : 'Track *'}</Text>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    {applyTarget.projectTypes.map((tp) => (
                      <Pressable
                        key={tp}
                        onPress={() => setSelectedProjectType(tp as 'project' | 'thesis')}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selectedProjectType === tp }}
                      >
                        <Text>{selectedProjectType === tp ? '◉' : '○'}</Text>
                        <Text>{projectTypeLabel(tp)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              <Text style={{ marginTop: 12, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>{lang === 'he' ? 'הודעה למנחה (אופציונלי)' : 'Cover note (optional)'}</Text>
              <TextInput
                value={coverNote}
                onChangeText={setCoverNote}
                multiline
                numberOfLines={3}
                style={{ borderWidth: 1, borderColor: '#D0DEFF', borderRadius: 10, padding: 10, fontSize: 13, textAlignVertical: 'top' }}
              />

              <Pressable
                onPress={() => pickFile('transcript')}
                style={{ marginTop: 12, borderWidth: 1, borderColor: '#D0DEFF', borderStyle: 'dashed', borderRadius: 10, padding: 12 }}
                accessibilityRole="button"
              >
                <Text style={{ fontSize: 13 }}>
                  {transcriptUri ? `✓ ${transcriptName}` : lastTranscriptUrl ? `✓ ${lang === 'he' ? 'נעשה שימוש בקובץ אחרון' : 'Using last file'}` : `📄 ${lang === 'he' ? 'גיליון ציונים *' : 'Transcript *'}`}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => pickFile('cv')}
                style={{ marginTop: 8, borderWidth: 1, borderColor: '#D0DEFF', borderStyle: 'dashed', borderRadius: 10, padding: 12 }}
                accessibilityRole="button"
              >
                <Text style={{ fontSize: 13 }}>
                  {cvUri ? `✓ ${cvName}` : lastCvUrl ? `✓ ${lang === 'he' ? 'נעשה שימוש בקובץ אחרון' : 'Using last file'}` : `📄 ${lang === 'he' ? 'קורות חיים *' : 'CV *'}`}
                </Text>
              </Pressable>

              {applyMessage && <Text style={{ marginTop: 12, fontSize: 13, color: applyMessage.startsWith('✅') ? '#16A34A' : '#EF4444' }}>{applyMessage}</Text>}

              <Pressable
                onPress={handleApply}
                disabled={submitting}
                style={{ marginTop: 16, backgroundColor: '#2E86FF', borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: submitting ? 0.6 : 1 }}
                accessibilityRole="button"
                accessibilityLabel={tx('submit', lang)}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{tx('submit', lang)}</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Join-direct confirm ── */}
      <Modal visible={!!joinTarget} animationType="fade" transparent onRequestClose={() => setJoinTarget(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18 }}>
            <Text style={{ fontSize: 15, fontWeight: '700' }}>{lang === 'he' ? 'הצטרפות לפרויקט' : 'Join Project'}</Text>
            {joinTarget && (
              <Text style={{ marginTop: 8, fontSize: 13, color: '#475569' }}>
                {lang === 'he' ? `האם להצטרף ל"${joinTarget.titleHe}"? הצטרפות זו מיידית וללא צורך באישור.` : `Join "${joinTarget.titleEn}"? This enrolls you immediately, no approval needed.`}
              </Text>
            )}
            {joinError && <Text style={{ marginTop: 8, fontSize: 13, color: '#EF4444' }}>{joinError}</Text>}
            <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <Pressable
                onPress={() => setJoinTarget(null)}
                style={{ paddingVertical: 8, paddingHorizontal: 14 }}
                accessibilityRole="button"
              >
                <Text>{tx('cancel', lang)}</Text>
              </Pressable>
              <Pressable
                onPress={handleJoinDirect}
                disabled={joining}
                style={{ backgroundColor: '#2E86FF', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, opacity: joining ? 0.6 : 1 }}
                accessibilityRole="button"
                accessibilityLabel={lang === 'he' ? 'הצטרף/י' : 'Join'}
              >
                {joining ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{lang === 'he' ? 'הצטרף/י' : 'Join'}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
