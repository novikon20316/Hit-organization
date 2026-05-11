// student/screens/BrowseProjects.tsx
import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  StyleSheet, Modal, ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth } from '../../src/firebase/firebase';
import { tx, type Lang } from '../../components/i18n';
import type { ProjectProposal } from '../../hooks/useStudentData';

interface Props {
  proposals: ProjectProposal[];
  lang:      Lang;
  isRtl:    boolean;
}

type DegreeFilter = 'all' | 'bachelors' | 'masters';
type TypeFilter   = 'all' | 'project' | 'thesis';

export default function BrowseProjects({ proposals, lang, isRtl }: Props) {
  const [search,       setSearch]       = useState('');
  const [degreeFilter, setDegreeFilter] = useState<DegreeFilter>('all');
  const [typeFilter,   setTypeFilter]   = useState<TypeFilter>('all');
  const [selected,     setSelected]     = useState<ProjectProposal | null>(null);
  const [showApply,    setShowApply]    = useState(false);

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

    const degreeOk =
      degreeFilter === 'all' ||
      p.degreeType === degreeFilter ||
      p.degreeType === 'both';

    const typeOk =
      typeFilter === 'all' || p.projectType === typeFilter;

    return textOk && degreeOk && typeOk;
  });
}, [proposals, search, degreeFilter, typeFilter, lang]);

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
  const uploadFile = async (uri: string): Promise<string> => { /** ERROR UPLOADING THE REQUEST -- NEED TO FIX IT **/
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
      }
    );

    const data = await response.json();

    console.log('UPLOAD RESULT:', data);

    return data.secure_url;

  } catch (error) {
    console.error('UPLOAD ERROR:', error);
    throw error;
  }
    /*const blob: Blob = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => resolve(xhr.response);
        xhr.onerror = () => reject(new Error("File upload failed"));
        xhr.responseType = 'blob';
        xhr.open('GET', uri, true);
        xhr.send(null);
    });

    const storageRef = ref(storage, path);
    console.log("CURRENT USER:", auth.currentUser);
    await uploadBytes(storageRef, blob);

    return await getDownloadURL(storageRef);*/
};

  // ── Submit application ─────────────────────────────────────────────────────
  const handleApply = async () => {
    if (!selected || !transcriptUri || !cvUri) {
      setApplyMessage(lang === 'he'
        ? 'אנא העלה גיליון ציונים וקורות חיים'
        : 'Please upload transcript and CV');
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setSubmitting(true);
    setApplyMessage(null);
    try {
      const base = `applications/${uid}/${selected.id}`;
      const [transcriptUrl, cvUrl] = await Promise.all([
        uploadFile(transcriptUri),
        uploadFile(cvUri),
      ]);

      await addDoc(collection(db, 'applications'), {
        projectId:      selected.id,
        studentId:      uid,
        supervisorId:   selected.supervisorId,
        facultyId:      selected.facultyId,
        status:         'pending',
        transcriptUrl,
        cvUrl,
        coverNote,
        supervisorNote: null,
        submittedAt:    serverTimestamp(),
        reviewedAt:     null,
        meetingDate:    null,
      });

      setApplyMessage(tx('applySuccess', lang));
      setTimeout(() => {
        setShowApply(false);
        setSelected(null);
        setApplyMessage(null);
        setCoverNote('');
        setTranscriptUri(null);
        setCvUri(null);
      }, 1500);
    } catch (e) {
      console.error('Apply error:', e);
      setApplyMessage(tx('applyError', lang));
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
        {/* Degree */}
        {(['all', 'bachelors', 'masters'] as DegreeFilter[]).map((d) => (
          <Pressable
            key={d}
            style={[styles.chip, degreeFilter === d && styles.chipActive]}
            onPress={() => setDegreeFilter(d)}
          >
            <Text style={[styles.chipText, degreeFilter === d && styles.chipTextActive]}>
              {d === 'all'       ? tx('all', lang) :
               d === 'bachelors' ? tx('bachelors', lang) :
                                   tx('masters', lang)}
            </Text>
          </Pressable>
        ))}
        <View style={styles.chipDivider} />
        {/* Type */}
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
      </ScrollView>

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
          filtered.map((p) => (
            <Pressable
              key={p.id}
              style={styles.card}
              onPress={() => setSelected(selected?.id === p.id ? null : p)}
            >
              {/* Header row */}
              <View style={[styles.cardHeader]}>
                <View style={styles.badges}>
                  {/* Row 1: Degree Badge */}
                  <View
                    style={[
                      styles.badge,
                      p.degreeType === 'masters' ? styles.badgeMasters : styles.badgeBachelors,
                    ]}
                  >
                    <Text style={styles.badgeText}>
                      {p.degreeType === 'both'
                        ? `${tx('bachelors', lang)} / ${tx('masters', lang)}`
                        : tx(p.degreeType === 'bachelors' ? 'bachelors' : 'masters', lang)}
                    </Text>
                  </View>

                  {/* Row 2: Project Type Badge */}
                  <View style={[styles.badge, styles.badgeType]}>
                    <Text style={styles.badgeText}>
                      {tx(p.projectType === 'project' ? 'projectType' : 'thesisType', lang)}
                    </Text>
                  </View>
                </View>
              </View>
              {/* Title */}
              <Text style={[styles.cardTitle, isRtl && styles.textRight]}>
                {lang === 'he' ? p.titleHe : p.titleEn}
              </Text>

              {/* Supervisor */}
              <Text style={[styles.cardSupervisor, isRtl && styles.textRight]}>
                👨‍🏫 {tx('supervisor', lang)}: {p.supervisorName}
              </Text>

              {/* Skills */}
              {p.requiredSkills.length > 0 && (
                <View style={[styles.skillsRow, isRtl && styles.rowReverse]}>
                  {p.requiredSkills.slice(0, 4).map((sk) => (
                    <View key={sk} style={styles.skillChip}>
                      <Text style={styles.skillText}>{sk}</Text>
                    </View>
                  ))}
                  {p.requiredSkills.length > 4 && (
                    <Text style={styles.moreSkills}>+{p.requiredSkills.length - 4}</Text>
                  )}
                </View>
              )}

              {/* Expanded description + apply */}
              {selected?.id === p.id && (
                <View style={styles.expanded}>
                  <Text style={[styles.descText, isRtl && styles.textRight]}>
                    {lang === 'he' ? p.descriptionHe : p.descriptionEn}
                  </Text>
                  <Pressable
                    style={styles.applyBtn}
                    onPress={() => setShowApply(true)}
                  >
                    <Text style={styles.applyBtnText}>{tx('applyBtn', lang)}</Text>
                  </Pressable>
                </View>
              )}
            </Pressable>
          ))
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

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F0F4FF' },
  textRight:   { textAlign: 'right' },
  rowReverse:  { flexDirection: 'row-reverse' },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', margin: 14,
    borderRadius: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: '#E0E8FF',
    shadowColor: '#2E86FF', shadowOpacity: 0.07,
    shadowRadius: 8, elevation: 2,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: '#111' },
  searchIcon:  { fontSize: 18 },

  // Filters
  filters:     { paddingHorizontal: 14, marginBottom: 6 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#D0DEFF',
    marginRight: 8,
  },
  chipActive:    { backgroundColor: '#2E86FF', borderColor: '#2E86FF' },
  chipActiveAlt: { backgroundColor: '#6C5CE7', borderColor: '#6C5CE7' },
  chipText:      { fontSize: 12, fontWeight: '600', color: '#555' },
  chipTextActive:{ color: '#fff' },
  chipDivider:   { width: 1, height: 28, backgroundColor: '#E0E8FF', marginRight: 8, alignSelf: 'center' },

  // Results
  resultsCount: { paddingHorizontal: 16, paddingBottom: 6, fontSize: 12, color: '#8899BB', fontWeight: '500' },

  // List
  list: { paddingHorizontal: 14 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText:  { fontSize: 15, color: '#8899BB' },

  // Cards
  card: {
    backgroundColor: '#fff', borderRadius: 16,
    padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#E0E8FF',
    shadowColor: '#2E86FF', shadowOpacity: 0.06,
    shadowRadius: 8, elevation: 2,
  },
  cardHeader:{
    marginBottom: 10,  // ← remove the row direction entirely
  },
  badges: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
  },
  badge:          { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeBachelors: { backgroundColor: '#E3F2FD' },
  badgeMasters:   { backgroundColor: '#F3E5F5' },
  badgeType:      { backgroundColor: '#E8F5E9' },
  badgeText:      { fontSize: 11, fontWeight: '600', color: '#555' },
  chevron:        { fontSize: 12, color: '#9BA8C0' },
  cardTitle:      { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 6 },
  cardSupervisor: { fontSize: 13, color: '#5577AA', marginBottom: 8 },
  skillsRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  skillChip:      { backgroundColor: '#F0F4FF', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  skillText:      { fontSize: 11, color: '#2E86FF', fontWeight: '500' },
  moreSkills:     { fontSize: 11, color: '#9BA8C0', alignSelf: 'center' },

  // Expanded
  expanded:   { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F0F4FF' },
  descText:   { fontSize: 13, color: '#445', lineHeight: 20, marginBottom: 16 },
  applyBtn: {
    backgroundColor: '#2E86FF', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
    shadowColor: '#2E86FF', shadowOpacity: 0.3, shadowRadius: 8, elevation: 3,
  },
  applyBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Modal
  modal:        { flex: 1, backgroundColor: '#F0F4FF' },
  modalContent: { padding: 20, paddingBottom: 60 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#111' },
  modalClose: { fontSize: 22, color: '#888', padding: 4 },

  applyProjectInfo: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#2E86FF',
  },
  applyForLabel:    { fontSize: 12, color: '#888', marginBottom: 4 },
  applyProjectTitle:{ fontSize: 14, fontWeight: '700', color: '#111' },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#445', marginBottom: 6, marginTop: 16 },
  textarea: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    fontSize: 14, color: '#111', textAlignVertical: 'top',
    borderWidth: 1, borderColor: '#E0E8FF', minHeight: 100,
  },
  uploadBtn: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    borderWidth: 2, borderColor: '#D0DEFF', borderStyle: 'dashed',
    alignItems: 'center',
  },
  uploadBtnDone:  { borderColor: '#4CAF50', borderStyle: 'solid', backgroundColor: '#F1FFF3' },
  uploadBtnText:  { fontSize: 14, color: '#5577AA', fontWeight: '500' },

  applyMessage:        { marginTop: 14, padding: 12, borderRadius: 10, textAlign: 'center', fontSize: 14 },
  applyMessageSuccess: { backgroundColor: '#E8F5E9', color: '#2E7D32' },
  applyMessageError:   { backgroundColor: '#FFEBEE', color: '#C62828' },

  submitBtn: {
    backgroundColor: '#2E86FF', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 24,
    shadowColor: '#2E86FF', shadowOpacity: 0.35, shadowRadius: 10, elevation: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  rowReverse2:       { flexDirection: 'row-reverse' },
});