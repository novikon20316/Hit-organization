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
import type { ProjectProposal } from '@/types';
import { apiClient } from '../../src/api/apiClient';

interface Props {
  proposals: ProjectProposal[];
  lang:      Lang;
  isRtl:    boolean;
  studentDegree: 'bachelors' | 'masters';
  appliedProjectIds: string[];
  // Placeholder until per-student course history is tracked in the app —
  // defaults to []. Until then, any project with prerequisites listed shows
  // as not-yet-qualified, since we can't confirm the student has completed them.
  completedCourses?: string[];
}

type DegreeFilter = 'all' | 'bachelors' | 'masters';
type TypeFilter   = 'all' | 'project' | 'thesis';

export default function BrowseProjects({ proposals, lang, isRtl, studentDegree, appliedProjectIds, completedCourses = [] }: Props) {
  // Inside BrowseProjects component, add at the top:
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);  
  const [search,       setSearch]       = useState('');
  const [degreeFilter, setDegreeFilter] = useState<DegreeFilter>('all');
  const [typeFilter,   setTypeFilter]   = useState<TypeFilter>('all');
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
  const [submitting,      setSubmitting]      = useState(false);
  const [applyMessage,    setApplyMessage]    = useState<string | null>(null);

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

      // `?? [scalar]` keeps this correct against pre-migration projects that
      // only ever had the single scalar degreeType/projectType field.
      const degreeOk =
        degreeFilter === 'all' ||
        (p.degreeTypes ?? [p.degreeType]).includes(degreeFilter);
      const typeOk =
        typeFilter === 'all' || (p.projectTypes ?? [p.projectType]).includes(typeFilter);

      return textOk && degreeOk && typeOk;
    });
  }, [proposals, search, degreeFilter, typeFilter, lang]);

  // ── Prerequisite/qualification check ──────────────────────────────────────
  const getMissingCourses = (p: ProjectProposal): string[] =>
    (p.prerequisites ?? []).filter((course) => !completedCourses.includes(course));

  const projectTypesOf = (p: ProjectProposal): ('project' | 'thesis')[] => p.projectTypes ?? (p.projectType ? [p.projectType] : []);

  // ── File picker ────────────────────────────────────────────────────────────
  const pickFile = async (type: 'transcript' | 'cv') => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
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

    console.log('UPLOAD RESULT:', data);

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
  if (!selected || !transcriptUri || !cvUri) {
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
      uploadFile(transcriptUri),
      uploadFile(cvUri),
    ]);

    await apiClient.post('/api/applications/apply', {
      projectId: selected.id,
      transcriptUrl,
      cvUrl,
      notes: coverNote,
      ...(selectedProjectType ? { selectedProjectType } : {}),
    });

    setApplyMessage('✅ ' + tx('applySuccess', lang));
    setTimeout(() => {
      setShowApply(false);
      setSelected(null);
      setApplyMessage(null);
      setCoverNote('');
      setTranscriptUri(null);
      setCvUri(null);
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
                      {/* Apply / qualification-request button */}
                      {appliedProjectIds.includes(p.id) ? (
                        <View style={[styles.applyBtn, { backgroundColor: '#E2E8F0' }]}>
                          <Text style={[styles.applyBtnText, { color: '#94A3B8' }]}>
                            {lang === 'he' ? '✓ כבר הגשת מועמדות' : '✓ Already Applied'}
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
                                setSelected(p);
                                const types = projectTypesOf(p);
                                setSelectedProjectType(types.length === 1 ? types[0] : '');
                                setShowApply(true);
                              }}
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
                                  ? `אינך זכאי/ת לביצוע פרויקט/תזה זה. עליך ללמוד את: ${missingCourses.join(', ')}`
                                  : `You are not qualified to do this project/thesis. You had to study ${missingCourses.join(', ')}`}
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
            <Pressable onPress={() => setShowApply(false)}>
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
            style={[styles.uploadBtn, transcriptUri && styles.uploadBtnDone]}
            onPress={() => pickFile('transcript')}
          >
            <Text style={styles.uploadBtnText}>
              {transcriptUri
                ? `✓ ${transcriptName}`
                : `📄 ${tx('tapToUpload', lang)}`}
            </Text>
          </Pressable>

          {/* CV upload */}
          <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
            {tx('uploadCV', lang)} *
          </Text>
          <Pressable
            style={[styles.uploadBtn, cvUri && styles.uploadBtnDone]}
            onPress={() => pickFile('cv')}
          >
            <Text style={styles.uploadBtnText}>
              {cvUri
                ? `✓ ${cvName}`
                : `📄 ${tx('tapToUpload', lang)}`}
            </Text>
          </Pressable>

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