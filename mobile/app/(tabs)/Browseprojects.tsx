// student/screens/BrowseProjects.tsx
import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Modal, ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../src/firebase/firebase';
import { tx, type Lang } from '../../components/i18n';
import { browseProjectsStyles } from '../../constants/styles';
import type { ProjectProposal } from '../../hooks/useStudentData';

interface Props {
  proposals: ProjectProposal[];
  lang:      Lang;
  isRtl:    boolean;
  studentDegree: 'bachelors' | 'masters';
}

type DegreeFilter = 'all' | 'bachelors' | 'masters';
type TypeFilter   = 'all' | 'project' | 'thesis';

export default function BrowseProjects({ proposals, lang, isRtl, studentDegree }: Props) {
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
      p.degreeType === degreeFilter 
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
                      {tx(p.degreeType === 'bachelors' ? 'bachelors' : 'masters',lang)}
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

const styles = browseProjectsStyles;