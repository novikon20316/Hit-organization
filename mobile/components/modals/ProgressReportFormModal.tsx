// components/modals/ProgressReportFormModal.tsx
//
// RN port of web/app/student/home/ProgressReportFormModal.tsx — the
// student's own copy of Project_midterm.docx ("דו"ח ביניים" / progress
// report), digitized as an online form for the progress_report milestone
// (see server/src/scripts/addProgressReportStudentForm.ts and
// milestoneController.ts's submitMilestone formData branch). Rendered
// instead of SubmitMilestoneModal whenever this milestone is a
// progress_report with studentFormFields configured (currently data_science
// only) — see app/student/milestones.tsx's dispatch.
//
// A sibling of ResearchProposalFormModal.tsx, not a branch inside it — see
// that file's own header comment for why. Differences: per-student block
// here is name/ID/phone/email only (no photo/credits), projectNameHe/
// projectNameEn are locked (read from project.titleHe/titleEn), and an
// optional multi-file attachment section is included.
import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, StyleSheet,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../src/firebase/firebase';
import { apiClient } from '../../src/api/apiClient';
import { examinerSignatureStyle } from '../../utils/examinerSignature';
import type { Lang } from '../i18n';
import type { Milestone, ActiveProject } from '@/types';

interface StudentFormField {
  key: string;
  labelHe: string;
  labelEn: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'table';
  required: boolean;
  autoFill?: string;
  locked?: boolean;
}

interface TeammateProfile {
  uid: string;
  displayName: string;
  studentId: string | null;
  phoneNumber: string | null;
  email: string | null;
}

// See SubmitMilestoneModal.tsx's identical helper.
const MAX_FILENAME_BYTES = 150;
function tooLongFileName(name: string): boolean {
  let bytes = 0;
  for (let i = 0; i < name.length; i++) {
    const code = name.codePointAt(i)!;
    if (code > 0xffff) i++;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (bytes > MAX_FILENAME_BYTES) return true;
  }
  return false;
}

interface Props {
  milestone: Milestone;
  project: ActiveProject;
  lang: Lang;
  isRtl: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

export default function ProgressReportFormModal({ milestone, project, lang, isRtl, onClose, onSubmitted }: Props) {
  const fields = (milestone.studentFormFields ?? []) as StudentFormField[];
  const studentIds = milestone.studentIds?.length ? milestone.studentIds : [auth.currentUser?.uid ?? ''].filter(Boolean);

  const [teammates, setTeammates] = useState<TeammateProfile[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Array<{ uri: string; name: string; mimeType?: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!milestone.studentFormData) return;
    const nextValues: Record<string, string> = {};
    for (const f of fields) {
      const v = (milestone.studentFormData as any)[f.key];
      if (v !== undefined && v !== null) nextValues[f.key] = String(v);
    }
    setValues(nextValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resolved = await Promise.all(studentIds.map(async (uid): Promise<TeammateProfile> => {
        const userSnap = await getDoc(doc(db, 'users', uid));
        const u = userSnap.data();
        return {
          uid,
          displayName: u?.displayName ?? '',
          studentId: u?.studentId ?? null,
          phoneNumber: u?.phoneNumber ?? null,
          email: u?.email ?? null,
        };
      }));
      if (!cancelled) setTeammates(resolved);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestone.id]);

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true });
    if (result.canceled || !result.assets?.length) return;
    const tooLong = result.assets.filter((a) => tooLongFileName(a.name));
    const ok = result.assets.filter((a) => !tooLongFileName(a.name));
    if (tooLong.length > 0) {
      setError(lang === 'he'
        ? `שם הקובץ ארוך מדי: ${tooLong.map((a) => a.name).join(', ')}. נא לקצר את שם הקובץ ולנסות שוב.`
        : `File name too long: ${tooLong.map((a) => a.name).join(', ')}. Please shorten it and try again.`);
    }
    if (ok.length > 0) setFiles((prev) => [...prev, ...ok.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType }))]);
  };

  const resolveLockedValue = (f: StudentFormField): string => {
    if (f.autoFill === 'submissionDate') return new Date().toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US');
    if (f.autoFill === 'projectNameHe') return project.titleHe;
    if (f.autoFill === 'projectNameEn') return project.titleEn;
    return '';
  };

  const handleSubmit = async () => {
    setError('');
    const missing = fields.filter((f) => f.required && !f.locked && !values[f.key]?.trim());
    if (missing.length > 0) {
      setError(lang === 'he' ? 'יש למלא את כל שדות החובה' : 'Fill in every required field');
      return;
    }
    setSubmitting(true);
    try {
      const formData: Record<string, unknown> = {};
      for (const f of fields) {
        if (f.locked) continue;
        formData[f.key] = values[f.key] ?? '';
      }
      const body = new FormData();
      body.append('formData', JSON.stringify(formData));
      body.append('milestoneId', milestone.id);
      body.append('projectId', project.id);
      files.forEach((f) => {
        const ext = f.name?.split('.').pop()?.toLowerCase();
        const fallbackType = ext === 'pdf' ? 'application/pdf' : 'application/octet-stream';
        body.append('files', { uri: f.uri, name: f.name, type: f.mimeType || fallbackType } as any);
      });
      await apiClient.submitMilestone(milestone.id, body);
      onSubmitted();
    } catch (err: any) {
      const data = err?.response?.data;
      const localized = data?.[lang === 'he' ? 'messageHe' : 'messageEn'];
      setError(localized ?? (lang === 'he' ? 'השליחה נכשלה' : 'Submission failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
        <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
          <Text style={styles.modalTitle}>{lang === 'he' ? 'דו"ח ביניים (דו"ח התקדמות)' : 'Progress Report'}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={lang === 'he' ? 'סגור' : 'Close'}>
            <Text style={styles.modalClose}>✕</Text>
          </Pressable>
        </View>

        <Text style={[styles.sectionLabel, isRtl && styles.textRight]}>{lang === 'he' ? 'פרטי הסטודנט/ית/ים' : "Student(s)' details"}</Text>
        {!teammates ? (
          <ActivityIndicator />
        ) : (
          teammates.map((tm) => {
            const sig = examinerSignatureStyle(tm.displayName, project.facultyId ?? '', 'student', project.major ?? null);
            return (
              <View key={tm.uid} style={styles.teammateCard}>
                <Text style={[styles.teammateLine, isRtl && styles.textRight]}>{lang === 'he' ? 'שם מלא: ' : 'Full name: '}{tm.displayName || '—'}</Text>
                <Text style={[styles.teammateLine, isRtl && styles.textRight]}>{lang === 'he' ? 'ת.ז.: ' : 'ID: '}{tm.studentId || '—'}</Text>
                <Text style={[styles.teammateLine, isRtl && styles.textRight]}>{lang === 'he' ? 'טלפון: ' : 'Phone: '}{tm.phoneNumber || '—'}</Text>
                <Text style={[styles.teammateLine, isRtl && styles.textRight]}>{lang === 'he' ? 'דוא"ל: ' : 'Email: '}{tm.email || '—'}</Text>
                <Text style={[styles.signatureText, { color: sig.color }]}>{tm.displayName}</Text>
              </View>
            );
          })
        )}

        {fields.map((f) => (
          <View key={f.key}>
            <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
              {(lang === 'he' ? f.labelHe : f.labelEn)}{f.required && !f.locked ? ' *' : ''}
            </Text>
            {f.locked ? (
              <Text style={[styles.lockedValue, isRtl && styles.textRight]}>{resolveLockedValue(f)}</Text>
            ) : f.type === 'textarea' ? (
              <TextInput
                style={[styles.textarea, isRtl && styles.textRight]}
                multiline
                numberOfLines={3}
                value={values[f.key] ?? ''}
                onChangeText={(v) => setValues({ ...values, [f.key]: v })}
                textAlign={isRtl ? 'right' : 'left'}
              />
            ) : (
              <TextInput
                style={[styles.input, isRtl && styles.textRight]}
                keyboardType={f.type === 'number' ? 'numeric' : 'default'}
                value={values[f.key] ?? ''}
                onChangeText={(v) => setValues({ ...values, [f.key]: v })}
                textAlign={isRtl ? 'right' : 'left'}
              />
            )}
          </View>
        ))}

        <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>{lang === 'he' ? 'קבצים מצורפים (אופציונלי)' : 'Attached files (optional)'}</Text>
        {files.map((f, i) => (
          <View key={i} style={styles.fileRow}>
            <Text style={styles.fileName}>📎 {f.name}</Text>
            <Pressable onPress={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} accessibilityRole="button" accessibilityLabel={lang === 'he' ? `הסר קובץ ${f.name}` : `Remove file ${f.name}`}>
              <Text style={styles.fileRemove}>✕</Text>
            </Pressable>
          </View>
        ))}
        <Pressable style={styles.uploadBtn} onPress={pickFile} accessibilityRole="button">
          <Text style={styles.uploadBtnText}>+ {lang === 'he' ? 'הוסף קובץ' : 'Add File'}</Text>
        </Pressable>

        {error !== '' && <Text style={styles.errorText}>{error}</Text>}

        <Pressable style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={submitting} accessibilityRole="button">
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>{lang === 'he' ? 'שלח' : 'Submit'}</Text>}
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: '#F8FAFC' },
  modalContent: { padding: 20, paddingBottom: 60 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', flexShrink: 1 },
  modalClose: { fontSize: 22, color: '#888', padding: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  teammateCard: { borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F1F5F9', borderRadius: 10, padding: 12, marginBottom: 10 },
  teammateLine: { fontSize: 12, color: '#374151', marginBottom: 2 },
  signatureText: { fontSize: 18, marginTop: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 14 },
  lockedValue: { fontSize: 14, color: '#64748B', borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F1F5F9', borderRadius: 10, padding: 10 },
  input: { borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 10, padding: 10, fontSize: 14, color: '#111' },
  textarea: { borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 10, padding: 10, fontSize: 14, color: '#111', minHeight: 90, textAlignVertical: 'top' },
  fileRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 8, marginBottom: 6 },
  fileName: { fontSize: 13, color: '#445', flex: 1 },
  fileRemove: { fontSize: 16, color: '#D32F2F', paddingLeft: 10 },
  uploadBtn: { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1', borderStyle: 'dashed', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  uploadBtnText: { color: '#2E86FF', fontSize: 14, fontWeight: '600' },
  errorText: { marginTop: 14, padding: 10, borderRadius: 8, backgroundColor: '#FEE2E2', color: '#B91C1C', fontSize: 13 },
  submitBtn: { backgroundColor: '#2563EB', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 20 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  rowReverse: { flexDirection: 'row-reverse' },
  textRight: { textAlign: 'right' },
});
