// components/modals/ResearchProposalFormModal.tsx
//
// The student's own copy of Project_proposal.docx ("הצעה לפרויקט גמר"),
// digitized as an online form for the research_proposal milestone — see
// server/src/scripts/addResearchProposalStudentForm.ts (studentFormFields)
// and milestoneController.ts's submitMilestone (the formData submission
// branch). Mirrors web/app/student/home/ResearchProposalFormModal.tsx (this
// repo doesn't share code between web/mobile).
//
// Per-student fields (name/ID/phone/email/photo/accumulated credits) are NOT
// part of studentFormFields — the paper form repeats that whole block once
// per team member, which doesn't fit a flat field list. This component
// resolves one such block per milestone.studentIds entry directly from each
// teammate's own profile; studentFormFields only covers what the team fills
// in TOGETHER, once (project name, abstract, Gantt, etc.).
import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, ScrollView, Pressable,
  TextInput, ActivityIndicator, Image, StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../src/firebase/firebase';
import { apiClient } from '../../src/api/apiClient';
import { tx, type Lang } from '../i18n';
import { ActivateDashboardStyles } from '../../constants/styles';
import type { Milestone, ActiveProject } from '@/types';

// ActivateDashboardStyles (the shared submit-modal chrome — header/textarea/
// submitBtn/etc.) has no `input`/`gradeStudents`/`expandedText` entries — this
// form needs plain single-line inputs and small read-only detail rows the
// shared sheet was never given, so they're supplemented locally rather than
// widening a style sheet several other unrelated screens also import.
const local = StyleSheet.create({
  input: {
    backgroundColor: '#fff', borderRadius: 10, padding: 10,
    fontSize: 14, color: '#111', borderWidth: 1, borderColor: '#E0E8FF', marginBottom: 6,
  },
  detailText: { fontSize: 12, color: '#445', marginBottom: 2 },
  lockedText: { fontSize: 14, color: '#8899BB', paddingVertical: 8 },
});

interface StudentFormField {
  key: string;
  labelHe: string;
  labelEn: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'table';
  required: boolean;
  tableColumns?: Array<{ key: string; labelHe: string; labelEn: string; type: 'text' | 'number' | 'date' }>;
  autoFill?: 'studentName' | 'studentIdNumber' | 'studentPhone' | 'studentEmail'
    | 'studentPhoto' | 'accumulatedCredits' | 'supervisorName' | 'submissionDate';
  locked?: boolean;
}

interface TeammateProfile {
  uid: string;
  displayName: string;
  studentId: string | null;
  phoneNumber: string | null;
  email: string | null;
  accumulatedCredits: number | null;
  photoUrl: string | null;
}

function emptyTableRow(columns: NonNullable<StudentFormField['tableColumns']>): Record<string, string> {
  return Object.fromEntries(columns.map((c) => [c.key, '']));
}

interface Props {
  milestone: Milestone;
  project: ActiveProject;
  lang: Lang;
  isRtl: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

export default function ResearchProposalFormModal({
  milestone, project, lang, isRtl, onClose, onSubmitted,
}: Props) {
  const { id: projectId, supervisorName } = project;
  const fields = (milestone.studentFormFields ?? []) as StudentFormField[];
  const studentIds = milestone.studentIds?.length ? milestone.studentIds : [auth.currentUser?.uid ?? ''].filter(Boolean);

  const [teammates, setTeammates] = useState<TeammateProfile[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [tableValues, setTableValues] = useState<Record<string, Array<Record<string, string>>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!milestone.studentFormData) return;
    const nextValues: Record<string, string> = {};
    const nextTables: Record<string, Array<Record<string, string>>> = {};
    for (const f of fields) {
      const v = milestone.studentFormData[f.key];
      if (f.type === 'table') nextTables[f.key] = Array.isArray(v) ? v : [];
      else if (v !== undefined && v !== null) nextValues[f.key] = String(v);
    }
    setValues(nextValues);
    setTableValues(nextTables);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resolved = await Promise.all(studentIds.map(async (uid): Promise<TeammateProfile> => {
        const [userSnap, photoRes] = await Promise.all([
          getDoc(doc(db, 'users', uid)),
          apiClient.get(`/api/users/${uid}/photo-url`).catch(() => ({ data: { photoUrl: null } })),
        ]);
        const u = userSnap.data();
        return {
          uid,
          displayName: u?.displayName ?? '',
          studentId: u?.studentId ?? null,
          phoneNumber: u?.phoneNumber ?? null,
          email: u?.email ?? null,
          accumulatedCredits: typeof u?.accumulatedCredits === 'number' ? u.accumulatedCredits : null,
          photoUrl: photoRes.data?.photoUrl ?? null,
        };
      }));
      if (!cancelled) setTeammates(resolved);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestone.id]);

  const handlePhotoUpload = async (uid: string) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (result.canceled || !result.assets?.length) return;

    setUploadingPhoto(true);
    try {
      const asset = result.assets[0];
      const formData = new FormData();
      formData.append('photo', {
        uri: asset.uri,
        name: 'photo.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as any);
      const res = await apiClient.post('/api/users/photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        transformRequest: (d: any) => d,
      });
      setTeammates((prev) => prev?.map((tm) => (tm.uid === uid ? { ...tm, photoUrl: res.data.photoUrl } : tm)) ?? prev);
    } catch {
      setError(lang === 'he' ? 'העלאת התמונה נכשלה' : 'Photo upload failed');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const addTableRow = (field: StudentFormField) => {
    const columns = field.tableColumns ?? [];
    setTableValues((prev) => ({ ...prev, [field.key]: [...(prev[field.key] ?? []), emptyTableRow(columns)] }));
  };
  const removeTableRow = (fieldKey: string, rowIdx: number) => {
    setTableValues((prev) => ({ ...prev, [fieldKey]: (prev[fieldKey] ?? []).filter((_, i) => i !== rowIdx) }));
  };
  const updateTableCell = (fieldKey: string, rowIdx: number, columnKey: string, cellValue: string) => {
    setTableValues((prev) => ({
      ...prev,
      [fieldKey]: (prev[fieldKey] ?? []).map((row, i) => (i === rowIdx ? { ...row, [columnKey]: cellValue } : row)),
    }));
  };

  const resolveLockedValue = (f: StudentFormField): string => {
    if (f.autoFill === 'submissionDate') return new Date().toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US');
    if (f.autoFill === 'supervisorName') return supervisorName;
    return '';
  };

  const handleSubmit = async () => {
    setError(null);
    const missing = fields.filter((f) =>
      f.required && !f.locked && (f.type === 'table' ? (tableValues[f.key] ?? []).length === 0 : !values[f.key]?.trim())
    );
    if (missing.length > 0) {
      setError(lang === 'he' ? 'יש למלא את כל שדות החובה' : 'Fill in every required field');
      return;
    }
    setSubmitting(true);
    try {
      const formDataValues: Record<string, unknown> = {};
      for (const f of fields) {
        if (f.locked) continue;
        formDataValues[f.key] = f.type === 'table' ? (tableValues[f.key] ?? []) : (values[f.key] ?? '');
      }
      const body = new FormData();
      body.append('formData', JSON.stringify(formDataValues));
      body.append('milestoneId', milestone.id);
      body.append('projectId', projectId);
      await apiClient.submitMilestone(milestone.id, body);
      onSubmitted();
    } catch (e: any) {
      const data = e?.response?.data;
      const localized = data?.[lang === 'he' ? 'messageHe' : 'messageEn'];
      setError(localized || tx('submitError', lang));
    } finally {
      setSubmitting(false);
    }
  };

  const currentUid = auth.currentUser?.uid;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
        <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
          <Text style={styles.modalTitle}>{lang === 'he' ? 'הצעה לפרויקט גמר' : 'Final Project Proposal'}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={lang === 'he' ? 'סגור' : 'Close'}>
            <Text style={styles.modalClose}>✕</Text>
          </Pressable>
        </View>

        <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>{lang === 'he' ? 'פרטי הסטודנט/ית/ים' : "Student(s)' details"}</Text>
        {!teammates ? (
          <ActivityIndicator />
        ) : (
          teammates.map((tm) => (
            <View key={tm.uid} style={{ flexDirection: isRtl ? 'row-reverse' : 'row', gap: 10, marginBottom: 10, padding: 8, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8 }}>
              <View style={{ alignItems: 'center', gap: 4 }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#F1F0EC', overflow: 'hidden' }}>
                  {tm.photoUrl && <Image source={{ uri: tm.photoUrl }} style={{ width: 56, height: 56 }} />}
                </View>
                {tm.uid === currentUid && (
                  <Pressable onPress={() => handlePhotoUpload(tm.uid)} disabled={uploadingPhoto} accessibilityRole="button">
                    <Text style={{ fontSize: 10, color: '#00236f' }}>{uploadingPhoto ? '…' : lang === 'he' ? 'העלה תמונה' : 'Upload photo'}</Text>
                  </Pressable>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[local.detailText, isRtl && styles.textRight]}>{lang === 'he' ? 'שם: ' : 'Name: '}{tm.displayName || '—'}</Text>
                <Text style={[local.detailText, isRtl && styles.textRight]}>{lang === 'he' ? 'ת.ז.: ' : 'ID: '}{tm.studentId || '—'}</Text>
                <Text style={[local.detailText, isRtl && styles.textRight]}>{lang === 'he' ? 'טלפון: ' : 'Phone: '}{tm.phoneNumber || '—'}</Text>
                <Text style={[local.detailText, isRtl && styles.textRight]}>{lang === 'he' ? 'דוא"ל: ' : 'Email: '}{tm.email || '—'}</Text>
                <Text style={[local.detailText, isRtl && styles.textRight]}>
                  {lang === 'he' ? 'נ"ז צבור: ' : 'Credits: '}{tm.accumulatedCredits ?? (lang === 'he' ? 'טרם התקבל' : 'Pending')}
                </Text>
              </View>
            </View>
          ))
        )}

        {fields.map((f) => (
          <View key={f.key} style={{ marginBottom: 12 }}>
            <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
              {lang === 'he' ? f.labelHe : f.labelEn}{f.required && !f.locked ? ' *' : ''}
            </Text>
            {f.locked ? (
              <Text style={[local.lockedText, isRtl && styles.textRight]}>{resolveLockedValue(f)}</Text>
            ) : f.type === 'table' ? (
              <View>
                {(tableValues[f.key] ?? []).map((row, rowIdx) => (
                  <View key={rowIdx} style={{ marginBottom: 6, padding: 6, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 6 }}>
                    {(f.tableColumns ?? []).map((col) => (
                      <TextInput
                        key={col.key}
                        style={local.input}
                        placeholder={lang === 'he' ? col.labelHe : col.labelEn}
                        placeholderTextColor="#9BA8C0"
                        keyboardType={col.type === 'number' ? 'numeric' : 'default'}
                        value={row[col.key] ?? ''}
                        onChangeText={(v) => updateTableCell(f.key, rowIdx, col.key, v)}
                        textAlign={isRtl ? 'right' : 'left'}
                      />
                    ))}
                    <Pressable onPress={() => removeTableRow(f.key, rowIdx)} accessibilityRole="button">
                      <Text style={{ color: '#D32F2F', fontSize: 12 }}>🗑️ {lang === 'he' ? 'הסר שורה' : 'Remove row'}</Text>
                    </Pressable>
                  </View>
                ))}
                <Pressable onPress={() => addTableRow(f)} accessibilityRole="button">
                  <Text style={{ color: '#00236f', fontWeight: '600' }}>＋ {tx('add', lang)}</Text>
                </Pressable>
              </View>
            ) : f.type === 'textarea' ? (
              <TextInput
                style={[local.input, styles.textarea, isRtl && styles.textRight]}
                multiline
                numberOfLines={4}
                value={values[f.key] ?? ''}
                onChangeText={(v) => setValues({ ...values, [f.key]: v })}
                textAlign={isRtl ? 'right' : 'left'}
              />
            ) : (
              <TextInput
                style={[local.input, isRtl && styles.textRight]}
                keyboardType={f.type === 'number' ? 'numeric' : 'default'}
                value={values[f.key] ?? ''}
                onChangeText={(v) => setValues({ ...values, [f.key]: v })}
                textAlign={isRtl ? 'right' : 'left'}
              />
            )}
          </View>
        ))}

        {error && (
          <Text style={[styles.submitMsg, styles.submitMsgErr]}>{error}</Text>
        )}

        <Pressable
          style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={submitting}
          accessibilityRole="button"
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>{tx('submit', lang)}</Text>}
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

const styles = ActivateDashboardStyles;
