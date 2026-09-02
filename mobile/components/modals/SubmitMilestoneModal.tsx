// components/modals/SubmitMilestoneModal.tsx
//
// Extracted from app/(tabs)/Activedashboard.tsx — the "submit a milestone"
// flow (file picking, note field, submit call) used to live inline in that
// screen. Now shared so both the student home Overview quick action AND the
// Milestones tab (app/student/milestones.tsx) can open the exact same modal
// against the exact same submission contract.
import React, { useState } from 'react';
import {
  Modal, View, Text, ScrollView, Pressable,
  TextInput, ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { auth } from '../../src/firebase/firebase';
import { tx, type Lang } from '../i18n';
import type { Milestone } from '@/types';
import { apiClient } from '../../src/api/apiClient';
import { ActivateDashboardStyles } from '../../constants/styles';

// ─── Milestone type labels ─────────────────────────────────────────────────
// Duplicated locally rather than imported from Activedashboard.tsx — this
// repo's convention (see that file's own comment, and coordinator/home.tsx)
// is for each screen/component to keep its own small copy of this map
// rather than share it across unrelated files, since a milestone type can
// also be a faculty-defined `custom_xxxxx` string none of these maps cover.
const MILESTONE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר',    en: 'Research Proposal' },
  progress_report:   { he: 'דו"ח התקדמות', en: 'Progress Report' },
  final_report:      { he: 'דו"ח מסכם',    en: 'Final Report' },
  defense:           { he: 'הגנה',          en: 'Defense' },
  poster:            { he: 'פוסטר',        en: 'Poster Session' },
};

interface Props {
  milestone:   Milestone;
  projectId:   string;
  lang:        Lang;
  isRtl:       boolean;
  onClose:     () => void;
  /** Called once the server confirms the submission (after the brief success
   *  message shows) — the caller is expected to close the modal at this
   *  point. Live Firestore milestone listeners already in place upstream
   *  (see useStudentData.ts) pick up the resulting status change on their
   *  own, so this callback doesn't need to trigger a manual refetch. */
  onSubmitted: () => void;
}

// A file name that reaches the server intact can still break somewhere in
// the multipart request itself once it's long enough — most commonly a
// Hebrew name, since Hebrew characters take 2 bytes each in UTF-8. Caught
// here, before it's ever sent, with a clear message.
// Mirrors MILESTONE_FILE_TYPES in server/src/services/workflowTemplates.ts —
// this repo's convention is for each screen to keep its own small copy
// rather than share it across unrelated files (see MILESTONE_LABEL above).
const MILESTONE_FILE_TYPE_META: Record<string, { he: string; en: string; mimeTypes: string[]; extensions: string[] }> = {
  pdf: { he: 'PDF', en: 'PDF', mimeTypes: ['application/pdf'], extensions: ['pdf'] },
  word: { he: 'Word (‎.doc/.docx)', en: 'Word (.doc/.docx)', mimeTypes: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], extensions: ['doc', 'docx'] },
  powerpoint: { he: 'PowerPoint (‎.ppt/.pptx)', en: 'PowerPoint (.ppt/.pptx)', mimeTypes: ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'], extensions: ['ppt', 'pptx'] },
  image: { he: 'תמונה (PNG/JPG)', en: 'Image (PNG/JPG)', mimeTypes: ['image/png', 'image/jpeg'], extensions: ['png', 'jpg', 'jpeg'] },
  zip: { he: 'ZIP', en: 'ZIP Archive', mimeTypes: ['application/zip'], extensions: ['zip'] },
};

function fileMatchesAllowedTypes(allowedFileTypes: string[] | undefined, name: string, mimeType: string | undefined): boolean {
  if (!allowedFileTypes || allowedFileTypes.length === 0) return true;
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return allowedFileTypes.some((key) => {
    const meta = MILESTONE_FILE_TYPE_META[key];
    return !!meta && ((mimeType && meta.mimeTypes.includes(mimeType)) || meta.extensions.includes(ext));
  });
}

const MAX_FILENAME_BYTES = 150;
function tooLongFileName(name: string): boolean {
  let bytes = 0;
  for (let i = 0; i < name.length; i++) {
    const code = name.codePointAt(i)!;
    if (code > 0xffff) i++; // surrogate pair — codePointAt already consumed both units
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (bytes > MAX_FILENAME_BYTES) return true;
  }
  return false;
}

export default function SubmitMilestoneModal({
  milestone, projectId, lang, isRtl, onClose, onSubmitted,
}: Props) {
  const [note,          setNote]          = useState('');
  const [files,         setFiles]         = useState<Array<{ uri: string; name: string; mimeType?: string }>>([]);
  const [submitting,    setSubmitting]    = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  // Absent (a milestone from before this feature existed) keeps today's
  // actual behavior — both fields shown, both optional — rather than being
  // treated the same as an explicit 'none', which instead hides both
  // entirely (see the empty-state message below).
  const submissionRequirement = milestone.submissionRequirement;
  const showFileField = submissionRequirement !== 'comment' && submissionRequirement !== 'none';
  const showNoteField = submissionRequirement !== 'file' && submissionRequirement !== 'none';
  const canSubmitMilestone =
    submissionRequirement === 'file' ? files.length > 0 :
    submissionRequirement === 'comment' ? note.trim().length > 0 :
    submissionRequirement === 'both' ? files.length > 0 && note.trim().length > 0 :
    true;

  // Only meaningful when submissionRequirement is 'file'/'both' — see
  // fileMatchesAllowedTypes above. Absent means unrestricted (a milestone
  // created before this feature existed). '*/*' keeps today's behavior; the
  // picker's own `type` filter is just a UI hint (some file providers ignore
  // it entirely), which is why the client-side check below still runs too.
  const allowedFileTypes = milestone.allowedFileTypes;
  const pickerMimeTypes = allowedFileTypes?.length
    ? allowedFileTypes.flatMap((k) => MILESTONE_FILE_TYPE_META[k]?.mimeTypes ?? [])
    : ['*/*'];
  const allowedTypesLabel = allowedFileTypes?.length
    ? allowedFileTypes.map((k) => MILESTONE_FILE_TYPE_META[k]?.[lang]).filter(Boolean).join(', ')
    : null;

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, type: pickerMimeTypes });
    if (result.canceled || !result.assets?.length) return;
    const tooLong = result.assets.filter((a) => tooLongFileName(a.name));
    const wrongType = result.assets.filter((a) => !tooLongFileName(a.name) && !fileMatchesAllowedTypes(allowedFileTypes, a.name, a.mimeType));
    const ok = result.assets.filter((a) => !tooLongFileName(a.name) && fileMatchesAllowedTypes(allowedFileTypes, a.name, a.mimeType));
    if (tooLong.length > 0) {
      setSubmitMessage(
        lang === 'he'
          ? `שם הקובץ ארוך מדי (מקסימום כ-${MAX_FILENAME_BYTES} תווים באנגלית, פחות בעברית): ${tooLong.map((a) => a.name).join(', ')}. נא לקצר את שם הקובץ ולנסות שוב.`
          : `File name too long (max ~${MAX_FILENAME_BYTES} characters): ${tooLong.map((a) => a.name).join(', ')}. Please shorten the file name and try again.`
      );
    } else if (wrongType.length > 0) {
      setSubmitMessage(
        lang === 'he'
          ? `סוג קובץ לא נתמך עבור אבן דרך זו: ${wrongType.map((a) => a.name).join(', ')}. סוגים מותרים: ${allowedTypesLabel}.`
          : `Unsupported file type for this milestone: ${wrongType.map((a) => a.name).join(', ')}. Allowed: ${allowedTypesLabel}.`
      );
    }
    if (ok.length > 0) {
      setFiles((prev) => [
        ...prev,
        ...ok.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType })),
      ]);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmitMilestone) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
      setSubmitting(true);
      setSubmitMessage(null);

      const formData = new FormData();
      files.forEach((f) => {
        const fileExtension = f.name?.split('.').pop()?.toLowerCase();
        const fallbackType  = fileExtension === 'pdf' ? 'application/pdf' : 'application/octet-stream';
        formData.append('files', {
          uri:  f.uri,
          name: f.name,
          type: f.mimeType || fallbackType,
        } as any);
      });
      formData.append('note',        note);
      formData.append('milestoneId', milestone.id);
      formData.append('projectId',   projectId);
      await apiClient.submitMilestone(milestone.id, formData);

      setSubmitMessage('✅ ' + tx('submitSuccess', lang));
      setTimeout(() => {
        onSubmitted();
      }, 1500);

    } catch (e: any) {
      console.error('Submit milestone error:', e?.message);
      // Prefer the server's per-language variant (see milestoneController.ts's
      // submitMilestone) when it sent one — any error without one falls back
      // to the translated generic message, not the raw server text.
      const data = e?.response?.data;
      const localized = data?.[lang === 'he' ? 'messageHe' : 'messageEn'];
      setSubmitMessage(localized || tx('submitError', lang));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
        <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
          <Text style={styles.modalTitle}>
            {tx('submitTitle', lang)}{' '}
            {lang === 'he'
              ? (MILESTONE_LABEL[milestone.type]?.he ?? milestone.type)
              : (MILESTONE_LABEL[milestone.type]?.en ?? milestone.type)}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={lang === 'he' ? 'סגור' : 'Close'}
          >
            <Text style={styles.modalClose}>✕</Text>
          </Pressable>
        </View>

        {/* Files */}
        {showFileField && (
          <>
            <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
              {tx('uploadFiles', lang)}
              {(submissionRequirement === 'file' || submissionRequirement === 'both') ? ' *' : ''}
            </Text>
            {allowedTypesLabel && (
              <Text style={[styles.fieldLabel, { fontSize: 11, fontWeight: '400', marginTop: -4 }, isRtl && styles.textRight]}>
                {lang === 'he' ? `סוגי קובץ מותרים: ${allowedTypesLabel}` : `Allowed file types: ${allowedTypesLabel}`}
              </Text>
            )}
            {files.map((f, i) => (
              <View key={i} style={styles.fileRow}>
                <Text style={styles.fileName}>📎 {f.name}</Text>
                <Pressable
                  onPress={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  accessibilityRole="button"
                  accessibilityLabel={lang === 'he' ? `הסר קובץ ${f.name}` : `Remove file ${f.name}`}
                >
                  <Text style={styles.fileRemove}>✕</Text>
                </Pressable>
              </View>
            ))}
            <Pressable style={styles.uploadBtn} onPress={pickFile} accessibilityRole="button">
              <Text style={styles.uploadBtnText}>
                + {lang === 'he' ? 'הוסף קובץ' : 'Add File'}
              </Text>
            </Pressable>
          </>
        )}

        {/* Note */}
        {showNoteField && (
          <>
            <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
              {tx('addNote', lang)}
              {(submissionRequirement === 'comment' || submissionRequirement === 'both') ? ' *' : ''}
            </Text>
            <TextInput
              style={[styles.textarea, isRtl && styles.textRight]}
              multiline
              numberOfLines={4}
              placeholder={tx('notePlaceholder', lang)}
              placeholderTextColor="#9BA8C0"
              value={note}
              onChangeText={setNote}
              textAlign={isRtl ? 'right' : 'left'}
            />
          </>
        )}

        {!showFileField && !showNoteField && (
          <Text style={[styles.fieldLabel, isRtl && styles.textRight, { fontWeight: '400' }]}>
            {lang === 'he' ? 'אבן דרך זו אינה דורשת קובץ או הערה — ניתן להגיש ישירות.' : 'This milestone requires no file or comment — you can submit directly.'}
          </Text>
        )}

        {submitMessage && (
          <Text style={[
            styles.submitMsg,
            submitMessage.includes('✅') ? styles.submitMsgOk : styles.submitMsgErr,
          ]}>
            {submitMessage}
          </Text>
        )}

        <Pressable
          style={[styles.submitBtn, (submitting || !canSubmitMilestone) && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={submitting || !canSubmitMilestone}
          accessibilityRole="button"
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitBtnText}>{tx('submit', lang)}</Text>
          }
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

const styles = ActivateDashboardStyles;
