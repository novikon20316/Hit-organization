// student/screens/BrowseProjects.tsx
import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Modal, ActivityIndicator, Linking
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { auth } from '../../src/firebase/firebase';
import { tx, type Lang } from '../../components/i18n';
import { browseProjectsStyles } from '../../constants/styles';
import type { ProjectProposal, PendingApplication } from '@/types';
import { apiClient } from '../../src/api/apiClient';
import { normalizePrerequisites, formatPrerequisite, meetsPrerequisite, type CompletedCourse } from '@/components/Prerequisites';
import CompletedCoursesList from '@/components/CompletedCoursesList';
import ApplicationStatusCard from '@/components/ApplicationStatusCard';

interface Props {
  proposals: ProjectProposal[];
  lang:      Lang;
  isRtl:    boolean;
  studentDegree: 'bachelors' | 'masters';
  pendingApplications: PendingApplication[];
  completedCourses?: CompletedCourse[];
  onApplicationsChanged: () => void;
}

type TypeFilter   = 'all' | 'project' | 'thesis';
type EligibilityFilter = 'all' | 'eligible';

export default function BrowseProjects({ proposals, lang, isRtl, studentDegree, pendingApplications, completedCourses = [], onApplicationsChanged }: Props) {
  const appliedProjectIds = useMemo(() => pendingApplications.map((a) => a.projectId), [pendingApplications]);
  // Inside BrowseProjects component, add at the top:
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [search,       setSearch]       = useState('');
  const [typeFilter,   setTypeFilter]   = useState<TypeFilter>('all');
  const [eligibilityFilter, setEligibilityFilter] = useState<EligibilityFilter>('all');
  const [selected,     setSelected]     = useState<ProjectProposal | null>(null);
  const [showApply,    setShowApply]    = useState(false);
  // The student's track choice for projects open to more than one project
  // type (project vs. thesis) — auto-filled with no UI step when the
  // project only offers one, same as today's single-select projects.
  const [selectedProjectType, setSelectedProjectType] = useState<'project' | 'thesis' | ''>('');

  // ── Apply form state ───────────────────────────────────────────────────────
  const [coverNote,       setCoverNote]       = useState('');
  const [transcriptUri,   setTranscriptUri]   = useState<string | null>(null);
  const [transcriptName,  setTranscriptName]  = useState<string | null>(null);
  const [cvUri,           setCvUri]           = useState<string | null>(null);
  const [cvName,          setCvName]          = useState<string | null>(null);
  // URLs from the student's most recent application, offered as "reuse this
  // file" so a repeat applicant doesn't have to re-upload the same PDFs —
  // cleared (per-field) the moment they pick a replacement or hit Remove.
  const [lastTranscriptUrl, setLastTranscriptUrl] = useState('');
  const [lastCvUrl,         setLastCvUrl]         = useState('');
  const [submitting,      setSubmitting]      = useState(false);
  const [applyMessage,    setApplyMessage]    = useState<string | null>(null);

  // ── Prerequisite/qualification check ──────────────────────────────────────
  // completedCourses now carries a self-reported grade per course (see
  // CompletedCoursesList) — entered by a system_admin or AI-extracted from
  // a transcript during application review, never self-reported by the
  // student. A prerequisite with a minGrade is only met if the recorded
  // grade meets it, not just by having taken the course.
  const getMissingCourses = (p: ProjectProposal) =>
    normalizePrerequisites(p.prerequisites).filter((pr) => !meetsPrerequisite(pr, completedCourses));

  // ── Filtered proposals ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const searchLower = (search || '').toLowerCase();

    return proposals.filter((p) => {
      const title =
        lang === 'he'
          ? (p.titleHe || '')
          : (p.titleEn || '');

      const titleMatch = title.toLowerCase().includes(searchLower);

      const supervisorMatch = (p.supervisorName || '')
        .toLowerCase()
        .includes(searchLower);

      const skillMatch = (p.requiredSkills || []).some((s) =>
        (s || '').toLowerCase().includes(searchLower)
      );

      const textOk =
        !search || titleMatch || supervisorMatch || skillMatch;

      // No degree filter here — `proposals` is already scoped to the
      // student's own degree by the query that fetched it (see
      // useStudentData.ts), so a filter offering "view the other degree
      // level's projects" would be actively misleading, not just redundant.
      // `?? [scalar]` keeps this correct against pre-migration projects that
      // only ever had the single scalar projectType field.
      const typeOk =
        typeFilter === 'all' || (p.projectTypes ?? [p.projectType]).includes(typeFilter);
      // Independent of the type filter above — "can apply" means the
      // student has already met every prerequisite and hasn't already applied.
      const eligibilityOk =
        eligibilityFilter === 'all' ||
        (getMissingCourses(p).length === 0 && !appliedProjectIds.includes(p.id));

      return textOk && typeOk && eligibilityOk;
    });
  }, [proposals, search, typeFilter, eligibilityFilter, completedCourses, appliedProjectIds, lang]);

  const projectTypesOf = (p: ProjectProposal): ('project' | 'thesis')[] => p.projectTypes ?? (p.projectType ? [p.projectType] : []);

  const openApply = (p: ProjectProposal) => {
    setSelected(p);
    const types = projectTypesOf(p);
    setSelectedProjectType(types.length === 1 ? types[0] : '');
    setShowApply(true);
    setTranscriptUri(null);
    setTranscriptName(null);
    setCvUri(null);
    setCvName(null);
    setLastTranscriptUrl('');
    setLastCvUrl('');
    apiClient
      .get<{ transcriptUrl: string; cvUrl: string }>('/api/applications/last-uploaded-files')
      .then((res) => {
        setLastTranscriptUrl(res.data?.transcriptUrl ?? '');
        setLastCvUrl(res.data?.cvUrl ?? '');
      })
      .catch(() => {
        // No previous application on file (or the lookup failed) — the
        // student just uploads fresh, same as before this feature existed.
      });
  };

  // ── File picker ────────────────────────────────────────────────────────────
  // `type: 'application/pdf'` above only filters what the OS picker *shows* —
  // some Android content providers still hand back files with a missing or
  // wrong mimeType, so re-check the returned asset before accepting it.
  const isPdfAsset = (asset: { mimeType?: string | null; name: string }) =>
    asset.mimeType === 'application/pdf' || asset.name.toLowerCase().endsWith('.pdf');

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

  // ── Upload file to Firebase Storage ───────────────────────────────────────
  // MEDIUM FIX: this raw fetch() had no timeout at all — on a weak
  // connection, a stalled upload never resolved or rejected, so
  // handleApply's Promise.all below just hung forever with submitting
  // stuck true and no way out except force-closing the app. A 30s ceiling
  // (longer than apiClient's own 15s JSON-request timeout, since this is a
  // real file upload rather than a small JSON payload) turns a stall into
  // a normal, catchable failure instead.
  const uploadFile = async (uri: string): Promise<string> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
    const formData = new FormData();

    formData.append('file', {
      uri,
      type: 'application/pdf',
      name: 'document.pdf',
    } as any);

    formData.append('upload_preset', 'student_uploads');

    const response = await fetch(
      'https://api.cloudinary.com/v1_1/dp7stlfas/raw/upload',
      {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      }
    );

    const data = await response.json();

    return data.secure_url;

  } catch (error) {
    console.error('UPLOAD ERROR:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

  // ── Submit application ─────────────────────────────────────────────────────
  const handleApply = async () => {
  if (!selected || (!transcriptUri && !lastTranscriptUrl) || (!cvUri && !lastCvUrl)) {
    setApplyMessage(lang === 'he'
      ? 'אנא העלה גיליון ציונים וקורות חיים'
      : 'Please upload transcript and CV');
    return;
  }
  if (projectTypesOf(selected).length > 1 && !selectedProjectType) {
    setApplyMessage(lang === 'he'
      ? 'פרויקט זה מציע יותר ממסלול אחד — יש לבחור מסלול'
      : 'This project offers more than one track — please choose one');
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
      projectId: selected.id,
      transcriptUrl,
      cvUrl,
      notes: coverNote,
      ...(selectedProjectType ? { selectedProjectType } : {}),
    });

    setApplyMessage('✅ ' + tx('applySuccess', lang));
    onApplicationsChanged();
    setTimeout(() => {
      setShowApply(false);
      setSelected(null);
      setApplyMessage(null);
      setCoverNote('');
      setTranscriptUri(null);
      setCvUri(null);
      setLastTranscriptUrl('');
      setLastCvUrl('');
      setSelectedProjectType('');
    }, 1500);

  } catch (e: any) {
    // ✅ Handle 409 duplicate specifically
    if (e?.response?.status === 409) {
      setApplyMessage(lang === 'he'
        ? '⚠️ כבר הגשת מועמדות לפרויקט זה'
        : '⚠️ You already applied to this project');
    } else {
      setApplyMessage(tx('applyError', lang));
    }
    console.error('Apply error:', e);
  } finally {
    setSubmitting(false);
  }
};

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      <CompletedCoursesList
        lang={lang}
        isRtl={isRtl}
        completedCourses={completedCourses}
      />

      {pendingApplications.length > 0 && (
        <View style={{ paddingHorizontal: 14, marginBottom: 8 }}>
          <Text style={[{ fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 8 }, isRtl && styles.textRight]}>
            {lang === 'he' ? 'הבקשות שלי' : 'My Applications'} ({pendingApplications.length})
          </Text>
          {pendingApplications.map((app) => (
            <ApplicationStatusCard key={app.id} application={app} lang={lang} isRtl={isRtl} onWithdrawn={onApplicationsChanged} />
          ))}
        </View>
      )}

      <Text style={[{ fontSize: 11, color: '#8899BB', paddingHorizontal: 14, marginBottom: 4 }, isRtl && styles.textRight]}>
        {lang === 'he' ? 'מוצגים פרויקטים עבור: ' : 'Showing projects for: '}
        <Text style={{ fontWeight: '700', color: '#333' }}>{tx(studentDegree === 'masters' ? 'masters' : 'bachelors', lang)}</Text>
      </Text>

      {/* Search + Filters */}
      <View style={styles.searchBar}>
        <TextInput
          style={[styles.searchInput, isRtl && styles.textRight]}
          placeholder={tx('searchPlaceholder', lang)}
          placeholderTextColor="#9BA8C0"
          value={search}
          onChangeText={setSearch}
          textAlign={isRtl ? 'right' : 'left'}
        />
        <Text style={styles.searchIcon}>🔍</Text>
      </View>

      {/* Filter chips */}
      {studentDegree === 'masters' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
          <View style={styles.chipDivider} />
          <View style={styles.filterRow}>
            {(['all', 'project', 'thesis'] as TypeFilter[]).map((tp) => (
              <Pressable
                key={tp}
                style={[styles.chip, typeFilter === tp && styles.chipActiveAlt]}
                onPress={() => setTypeFilter(tp)}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, typeFilter === tp && styles.chipTextActive]}>
                  {tp === 'all'     ? tx('all', lang) :
                  tp === 'project' ? tx('projectType', lang) :
                                      tx('thesisType', lang)}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Eligibility filter — independent of the type/degree filters above */}
      <View style={styles.filters}>
        <View style={styles.filterRow}>
          {(['all', 'eligible'] as EligibilityFilter[]).map((ef) => (
            <Pressable
              key={ef}
              style={[styles.chip, eligibilityFilter === ef && styles.chipActive]}
              onPress={() => setEligibilityFilter(ef)}
              accessibilityRole="button"
            >
              <Text style={[styles.chipText, eligibilityFilter === ef && styles.chipTextActive]}>
                {ef === 'all'
                  ? (lang === 'he' ? 'כל הפרויקטים' : 'All projects')
                  : (lang === 'he' ? 'פרויקטים שניתן להגיש להם' : 'Projects you can apply to')}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Results count */}
      <Text style={[styles.resultsCount, isRtl && styles.textRight]}>
        {filtered.length} {lang === 'he' ? 'פרויקטים' : 'projects'}
      </Text>

      {/* Project cards */}
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyText}>{tx('noProjects', lang)}</Text>
          </View>
        ) : (
          <>
            {filtered.map((p) => {
              const isExpanded = expandedProjectId === p.id;
              return (
                <Pressable
                  key={p.id}
                  style={styles.card}
                  onPress={() => setExpandedProjectId(isExpanded ? null : p.id)}
                  accessibilityRole="button"
                >
                  {/* Header row */}
                  <View style={styles.cardHeader}>
                    <View style={styles.badges}>
                      {(p.degreeTypes ?? [p.degreeType]).map((d) => (
                        <View key={d} style={[styles.badge, d === 'masters' ? styles.badgeMasters : styles.badgeBachelors]}>
                          <Text style={styles.badgeText}>
                            {tx(d === 'bachelors' ? 'bachelors' : 'masters', lang)}
                          </Text>
                        </View>
                      ))}
                      {(p.projectTypes ?? [p.projectType]).map((tp) => (
                        <View key={tp} style={[styles.badge, styles.badgeType]}>
                          <Text style={styles.badgeText}>
                            {tx(tp === 'project' ? 'projectType' : 'thesisType', lang)}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <Text style={{ fontSize: 16, color: '#8899BB' }}>{isExpanded ? '▲' : '▼'}</Text>
                  </View>

                  {/* Title */}
                  <Text style={[styles.cardTitle, isRtl && styles.textRight]}>
                    {lang === 'he' ? p.titleHe : p.titleEn}
                  </Text>

                  {/* ── NEW: Supervisor + Faculty + Duration row ── */}
                  <View style={{ marginTop: 6, gap: 4 }}>
                    
                    {/* Supervisor */}
                    <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 13, color: '#2E86FF', fontWeight: '700' }}>👨‍🏫</Text>
                      <Text style={{ fontSize: 13, color: '#445', fontWeight: '600' }}>
                        {p.supervisorName || (lang === 'he' ? 'לא צוין' : 'Not specified')}
                      </Text>
                    </View>

                    {/* Faculty */}
                    <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 13, color: '#8899BB' }}>🏛️</Text>
                      <Text style={{ fontSize: 13, color: '#8899BB' }}>
                        {lang === 'he' ? 'פקולטה: ' : 'Faculty: '}
                        <Text style={{ fontWeight: '600', color: '#445' }}>
                          {p.facultyId
                            ? p.facultyId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                            : (lang === 'he' ? 'לא צוין' : 'Not specified')}
                        </Text>
                      </Text>
                    </View>

                    {/* Duration */}
                    <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 13, color: '#8899BB' }}>📅</Text>
                      <Text style={{ fontSize: 13, color: '#8899BB' }}>
                        {lang === 'he' ? 'משך: ' : 'Duration: '}
                        <Text style={{ fontWeight: '600', color: '#445' }}>
                          {p.degreeType === 'masters'
                            ? (lang === 'he' ? 'שנה אחת' : '1 year')
                            : (lang === 'he' ? 'שנתיים' : '2 years')}
                        </Text>
                      </Text>
                    </View>

                  </View>
                  {/* ── END NEW ── */}

                  {/* Required skills — falls back to [] for any project doc
                      missing this field (legacy/pre-migration data), matching
                      the guard the search filter above already uses. */}
                  {(p.requiredSkills ?? []).length > 0 && (
                    <View style={[styles.skillsRow, isRtl && styles.rowReverse, { marginTop: 8 }]}>
                      {(p.requiredSkills ?? []).slice(0, 4).map((sk) => (
                        <View key={sk} style={styles.skillChip}>
                          <Text style={styles.skillText}>{sk}</Text>
                        </View>
                      ))}
                      {(p.requiredSkills ?? []).length > 4 && (
                        <Text style={styles.moreSkills}>+{(p.requiredSkills ?? []).length - 4}</Text>
                      )}
                    </View>
                  )}

                  {/* Expanded section */}
                  {isExpanded && (
                    <View style={styles.expanded}>
                      
                      {/* Description */}
                      {(lang === 'he' ? p.descriptionHe : p.descriptionEn) ? (
                        <Text style={[styles.descText, isRtl && styles.textRight]}>
                          {lang === 'he' ? p.descriptionHe : p.descriptionEn}
                        </Text>
                      ) : null}

                      {/* Academic year */}
                      {p.academicYear && (
                        <Text style={[styles.cardSupervisor, isRtl && styles.textRight]}>
                          📅 {lang === 'he' ? 'שנה"ל:' : 'Academic Year:'} {p.academicYear}
                        </Text>
                      )}

                      {/* Max students */}
                      <Text style={[styles.cardSupervisor, isRtl && styles.textRight]}>
                        👥 {lang === 'he' ? 'מקסימום סטודנטים:' : 'Max students:'} {p.NumberOfStudents ?? 1}
                      </Text>
                      
                      {/* ── PDF file — only shown if exists ── */}
                      {p.projectFileUrl ? (
                        <Pressable
                          style={{
                            flexDirection: isRtl ? 'row-reverse' : 'row',
                            alignItems: 'center',
                            gap: 8,
                            backgroundColor: '#FEF2F2',
                            borderRadius: 10,
                            padding: 12,
                            marginTop: 10,
                            borderWidth: 1,
                            borderColor: '#FECACA',
                          }}
                          onPress={() => {
                            Linking.openURL(p.projectFileUrl!);
                          }}
                          accessibilityRole="link"
                        >
                          <Text style={{ fontSize: 20 }}>📄</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={{
                              fontSize: 13,
                              fontWeight: '700',
                              color: '#DC2626',
                              textAlign: isRtl ? 'right' : 'left',
                            }}>
                              {lang === 'he' ? 'קובץ פרויקט' : 'Project File'}
                            </Text>
                            <Text style={{
                              fontSize: 11,
                              color: '#9BA8C0',
                              textAlign: isRtl ? 'right' : 'left',
                            }}>
                              {lang === 'he' ? 'לחץ לצפייה בקובץ PDF' : 'Tap to view PDF'}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '700' }}>
                            {isRtl ? '←' : '→'}
                          </Text>
                        </Pressable>
                      ) : null}
                      {normalizePrerequisites(p.prerequisites).length > 0 && (
                        <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 8, textAlign: isRtl ? 'right' : 'left' }}>
                          📚 {lang === 'he' ? 'דרישות קדם: ' : 'Prerequisites: '}
                          {normalizePrerequisites(p.prerequisites).map((pr) => formatPrerequisite(pr, lang)).join(', ')}
                        </Text>
                      )}
                      {/* Apply / qualification-request button */}
                      {appliedProjectIds.includes(p.id) ? (
                        <View style={[styles.applyBtn, { backgroundColor: '#F59E0B' }]}>
                          <Text style={[styles.applyBtnText, { color: '#fff' }]}>
                            {lang === 'he' ? '✓ בקשה נשלחה' : '✓ Sent Application'}
                          </Text>
                        </View>
                      ) : (() => {
                        const missingCourses = getMissingCourses(p);
                        const isQualified = missingCourses.length === 0;
                        return (
                          <>
                            <Pressable
                              style={[styles.applyBtn, !isQualified && { backgroundColor: '#E2E8F0' }]}
                              disabled={!isQualified}
                              onPress={(e) => {
                                e.stopPropagation?.();
                                openApply(p);
                              }}
                              accessibilityRole="button"
                            >
                              <Text style={[styles.applyBtnText, !isQualified && { color: '#94A3B8' }]}>
                                {tx('applyBtn', lang)}
                              </Text>
                            </Pressable>
                            {!isQualified && (
                              <Text style={{
                                color: '#DC2626', fontSize: 12, marginTop: 6,
                                textAlign: isRtl ? 'right' : 'left',
                              }}>
                                {lang === 'he'
                                  ? `אינך זכאי/ת לביצוע פרויקט/תזה זה. עליך ללמוד את: ${missingCourses.map((c) => formatPrerequisite(c, lang)).join(', ')}`
                                  : `You are not qualified to do this project/thesis. You had to study ${missingCourses.map((c) => formatPrerequisite(c, lang)).join(', ')}`}
                              </Text>
                            )}
                          </>
                        );
                      })()}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Application Modal ── */}
      <Modal visible={showApply} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
          <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
            <Text style={styles.modalTitle}>{tx('applyTitle', lang)}</Text>
            <Pressable
              onPress={() => setShowApply(false)}
              accessibilityRole="button"
              accessibilityLabel={lang === 'he' ? 'סגור' : 'Close'}
            >
              <Text style={styles.modalClose}>✕</Text>
            </Pressable>
          </View>

          {selected && (
            <View style={styles.applyProjectInfo}>
              <Text style={[styles.applyForLabel, isRtl && styles.textRight]}>
                {tx('applyFor', lang)}
              </Text>
              <Text style={[styles.applyProjectTitle, isRtl && styles.textRight]}>
                {lang === 'he' ? selected.titleHe : selected.titleEn}
              </Text>
            </View>
          )}

          {selected && projectTypesOf(selected).length > 1 && (
            <View style={{ marginTop: 16 }}>
              <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
                {lang === 'he' ? 'מסלול *' : 'Track *'}
              </Text>
              <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', gap: 12, marginTop: 6 }}>
                {projectTypesOf(selected).map((tp) => {
                  const isActive = selectedProjectType === tp;
                  return (
                    <Pressable
                      key={tp}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                      onPress={() => setSelectedProjectType(tp)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isActive }}
                    >
                      <View style={{
                        width: 20, height: 20, borderRadius: 10, borderWidth: 2,
                        borderColor: isActive ? '#2E86FF' : '#D0DEFF',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isActive && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#2E86FF' }} />}
                      </View>
                      <Text style={{ fontSize: 14, color: '#111' }}>
                        {tp === 'project' ? (lang === 'he' ? 'פרויקט' : 'Project') : (lang === 'he' ? 'תזה' : 'Thesis')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Cover note */}
          <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
            {tx('coverNote', lang)}
          </Text>
          <TextInput
            style={[styles.textarea, isRtl && styles.textRight]}
            multiline
            numberOfLines={5}
            placeholder={tx('coverPlaceholder', lang)}
            placeholderTextColor="#9BA8C0"
            value={coverNote}
            onChangeText={setCoverNote}
            textAlign={isRtl ? 'right' : 'left'}
          />

          {/* Transcript upload */}
          <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
            {tx('uploadTranscript', lang)} *
          </Text>
          <Pressable
            style={[styles.uploadBtn, (transcriptUri || lastTranscriptUrl) && styles.uploadBtnDone]}
            onPress={() => pickFile('transcript')}
            accessibilityRole="button"
          >
            <Text style={styles.uploadBtnText}>
              {transcriptUri
                ? `✓ ${transcriptName}`
                : lastTranscriptUrl
                  ? `✓ ${lang === 'he' ? 'נעשה שימוש בקובץ שהגשת לאחרונה' : 'Using the file from your last application'}`
                  : `📄 ${tx('tapToUpload', lang)}`}
            </Text>
          </Pressable>
          {!transcriptUri && lastTranscriptUrl ? (
            <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', gap: 16, marginTop: -6, marginBottom: 10 }}>
              <Pressable onPress={() => Linking.openURL(lastTranscriptUrl)} accessibilityRole="link">
                <Text style={{ fontSize: 12, color: '#2E86FF', fontWeight: '600' }}>{lang === 'he' ? 'צפייה בקובץ' : 'View file'}</Text>
              </Pressable>
              <Pressable onPress={() => setLastTranscriptUrl('')} accessibilityRole="button">
                <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '600' }}>{lang === 'he' ? 'הסר' : 'Remove'}</Text>
              </Pressable>
            </View>
          ) : null}

          {/* CV upload */}
          <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
            {tx('uploadCV', lang)} *
          </Text>
          <Pressable
            style={[styles.uploadBtn, (cvUri || lastCvUrl) && styles.uploadBtnDone]}
            onPress={() => pickFile('cv')}
            accessibilityRole="button"
          >
            <Text style={styles.uploadBtnText}>
              {cvUri
                ? `✓ ${cvName}`
                : lastCvUrl
                  ? `✓ ${lang === 'he' ? 'נעשה שימוש בקובץ שהגשת לאחרונה' : 'Using the file from your last application'}`
                  : `📄 ${tx('tapToUpload', lang)}`}
            </Text>
          </Pressable>
          {!cvUri && lastCvUrl ? (
            <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', gap: 16, marginTop: -6, marginBottom: 10 }}>
              <Pressable onPress={() => Linking.openURL(lastCvUrl)} accessibilityRole="link">
                <Text style={{ fontSize: 12, color: '#2E86FF', fontWeight: '600' }}>{lang === 'he' ? 'צפייה בקובץ' : 'View file'}</Text>
              </Pressable>
              <Pressable onPress={() => setLastCvUrl('')} accessibilityRole="button">
                <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '600' }}>{lang === 'he' ? 'הסר' : 'Remove'}</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Message */}
          {applyMessage && (
            <Text style={[
              styles.applyMessage,
              applyMessage.includes('✅') ? styles.applyMessageSuccess : styles.applyMessageError,
            ]}>
              {applyMessage}
            </Text>
          )}

          {/* Submit */}
          <Pressable
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleApply}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel={tx('submit', lang)}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>{tx('submit', lang)}</Text>
            }
          </Pressable>
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = browseProjectsStyles;