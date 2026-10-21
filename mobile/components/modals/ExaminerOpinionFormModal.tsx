// components/modals/ExaminerOpinionFormModal.tsx
//
// The examiner's written opinion form (server: services/examinerOpinion.ts;
// template: examinerOpinionForm) — mobile port of
// web/components/ExaminerOpinionForm.tsx, for internal examiners, the
// supervisor (each opinion filtered per its examiner's confidentiality
// request) and the administrative coordinator (everything, plus the
// approve-grade / send-back actions). External examiners use the web
// access link instead.

import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Linking } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { apiClient } from '../../src/api/apiClient';
import { ap } from '../../constants/theme';
import type { Lang } from '../i18n';

interface Choice { value: string; labelHe: string; labelEn: string }
interface Signature { signerName: string; positionHe: string; positionEn: string; facultyNameHe: string; facultyNameEn: string; signedAt: string; code: string; valid: boolean }
interface Opinion {
  conclusion: string; confidentiality: string; opinion: string; confidentialOpinion: string | null; institution: string | null;
  examinerName?: string; fileUrls: string[]; uploadedFormUrl: string | null; submittedAt: string; round: number;
  signature: Signature | null; signedAnonymously: boolean;
}
interface View_ {
  milestoneId: string; titleHe: string; titleEn: string;
  header: Array<{ key: string; labelHe: string; labelEn: string; value: string | null; valueEn: string | null }>;
  conclusions: Array<Choice & { outcome: string }>;
  confidentialityOptions: Array<Choice & { effect: 'none' | 'hide_name' | 'hide_marked' }>;
  viewer: { kind: 'examiner' | 'supervisor' | 'staff'; canEdit: boolean; lockedReasonHe: string | null; lockedReasonEn: string | null; defaultName: string | null; defaultInstitution: string };
  examiners: Array<{ index: number; submitted: boolean; isSelf: boolean; name: string | null; opinion: Opinion | null }>;
  outcome: { result: 'continue' | 'revise' | 'reject' } | null;
  sendBack: { note: string; round: number } | null;
  finalGrade: number | null;
  gradeApproved: boolean;
  students: Array<{ id: string; name: string }>;
}
type PickedFile = { uri: string; name: string; mimeType?: string };

const OUTCOME_TEXT = {
  continue: { he: 'כל הבוחנים אישרו את העבודה — ממתין להזנת הציון הסופי ואישורו על ידי הרכז/ת המנהלי/ת.', en: 'All examiners approved the thesis — awaiting the final grade from the administrative coordinator.' },
  revise: { he: 'בוחן/ת ביקש/ה תיקונים מהותיים — העבודה חזרה לרכז/ת המנהלי/ת ולמנחה.', en: 'An examiner requested major corrections — the thesis is back with the administrative coordinator and the supervisor.' },
  reject: { he: 'בוחן/ת קבע/ה שהעבודה אינה ראויה להתקבל — העבודה חזרה לרכז/ת המנהלי/ת ולמנחה.', en: 'An examiner found the thesis not acceptable — it is back with the administrative coordinator and the supervisor.' },
} as const;

function fileType(f: PickedFile): string {
  if (f.mimeType) return f.mimeType;
  const ext = f.name.split('.').pop()?.toLowerCase();
  if (ext === 'doc') return 'application/msword';
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}

export default function ExaminerOpinionFormModal({ visible, lang, milestoneId, onClose, onChanged }: { visible: boolean; lang: Lang; milestoneId: string; onClose: () => void; onChanged?: () => void }) {
  const he = lang === 'he';
  const align = he ? 'right' : 'left';
  const row = he ? 'row-reverse' : 'row';
  const [view, setView] = useState<View_ | null>(null);
  const [loadError, setLoadError] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [confidentiality, setConfidentiality] = useState('');
  const [opinion, setOpinion] = useState('');
  const [confidentialOpinion, setConfidentialOpinion] = useState('');
  const [institution, setInstitution] = useState('');
  const [attachments, setAttachments] = useState<PickedFile[]>([]);
  const [parseNote, setParseNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [grades, setGrades] = useState<Record<string, string>>({});
  const [sendBackNote, setSendBackNote] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get(`/api/projects/milestones/${milestoneId}/examiner-opinion`);
      const data: View_ = res.data;
      setView(data);
      setLoadError('');
      const own = data.examiners.find((e) => e.isSelf)?.opinion;
      setConclusion(own?.conclusion ?? '');
      setConfidentiality(own?.confidentiality ?? '');
      setOpinion(own?.opinion ?? '');
      setConfidentialOpinion(own?.confidentialOpinion ?? '');
      setInstitution(own?.institution ?? data.viewer.defaultInstitution ?? '');
    } catch (err: any) {
      setLoadError(err.response?.data?.message || (he ? 'טעינת הטופס נכשלה' : 'Failed to load the form'));
    }
  }, [milestoneId, he]);

  useEffect(() => {
    if (visible) {
      setView(null);
      setError('');
      setMessage('');
      setParseNote('');
      setAttachments([]);
      load();
    }
  }, [visible, load]);

  const labelOf = (list: Choice[], value: string) => {
    const item = list.find((x) => x.value === value);
    return item ? (he ? item.labelHe : item.labelEn) : value;
  };
  const hideMarked = view?.confidentialityOptions.find((o) => o.value === confidentiality)?.effect === 'hide_marked';
  const canSubmit = !!conclusion && !!confidentiality && !!institution.trim() && (!!opinion.trim() || attachments.length > 0) && (!hideMarked || !!confidentialOpinion.trim());

  const uploadForm = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0]!;
    const file: PickedFile = { uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? undefined };
    setBusy(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('files', { uri: file.uri, name: file.name, type: fileType(file) } as any);
      const res = await apiClient.post(`/api/projects/milestones/${milestoneId}/examiner-opinion/parse`, formData, { headers: { 'Content-Type': 'multipart/form-data' }, transformRequest: (d: any) => d });
      const prefill = res.data.prefill;
      if (prefill.conclusion) setConclusion(prefill.conclusion);
      if (prefill.confidentiality) setConfidentiality(prefill.confidentiality);
      if (prefill.institution) setInstitution(prefill.institution);
      if (prefill.extraText && !opinion.trim()) setOpinion(prefill.extraText);
      const missing = [!prefill.conclusion && (he ? 'מסקנה' : 'conclusion'), !prefill.confidentiality && (he ? 'בקשת חיסיון' : 'confidentiality request')].filter(Boolean);
      setParseNote(missing.length
        ? (he ? `הטופס נקרא. לא זוהו: ${missing.join(', ')} — יש לבחור ידנית. בדוק/י את כל הפרטים לפני החתימה.` : `The form was read. Not detected: ${missing.join(', ')} — choose manually. Check every detail before signing.`)
        : (he ? 'הטופס נקרא והפרטים מולאו. בדוק/י אותם לפני החתימה.' : 'The form was read and the details filled in. Check them before signing.'));
    } catch (err: any) {
      setError(err.response?.data?.message || (he ? 'קריאת הטופס נכשלה' : 'Could not read the form'));
    } finally {
      setBusy(false);
    }
  };

  const pickAttachments = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true });
    if (result.canceled || !result.assets?.length) return;
    setAttachments(result.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? undefined })));
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('conclusion', conclusion);
      formData.append('confidentiality', confidentiality);
      formData.append('opinion', opinion);
      formData.append('institution', institution);
      if (hideMarked) formData.append('confidentialOpinion', confidentialOpinion);
      attachments.forEach((f) => formData.append('files', { uri: f.uri, name: f.name, type: fileType(f) } as any));
      await apiClient.post(`/api/projects/milestones/${milestoneId}/examiner-opinion`, formData, { headers: { 'Content-Type': 'multipart/form-data' }, transformRequest: (d: any) => d });
      setMessage(he ? 'חוות הדעת נחתמה והוגשה.' : 'The opinion was signed and submitted.');
      setAttachments([]);
      onChanged?.();
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || (he ? 'שליחת הטופס נכשלה' : 'Failed to submit the form'));
    } finally {
      setBusy(false);
    }
  };

  const approveGrade = async () => {
    if (!view) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.post(`/api/projects/milestones/${milestoneId}/examiner-opinion/final-grade`, { grades: Object.fromEntries(view.students.map((s) => [s.id, Number(grades[s.id])])) });
      setMessage(he ? 'הציון הסופי אושר ונשמר.' : 'The final grade was approved and saved.');
      onChanged?.();
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || (he ? 'אישור הציון נכשל' : 'Failed to approve the grade'));
    } finally {
      setBusy(false);
    }
  };

  const sendBack = async () => {
    setBusy(true);
    setError('');
    try {
      await apiClient.post(`/api/projects/milestones/${milestoneId}/examiner-opinion/send-back`, { note: sendBackNote });
      setMessage(he ? 'העבודה הוחזרה לסטודנט/ית לתיקונים.' : 'The thesis was returned to the student for corrections.');
      onChanged?.();
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || (he ? 'החזרת העבודה נכשלה' : 'Failed to send the thesis back'));
    } finally {
      setBusy(false);
    }
  };

  const card = { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: ap.outlineVariant, padding: 12 };
  const title = { fontSize: 14, fontWeight: '800' as const, color: ap.onSurface, marginTop: 18, marginBottom: 8, textAlign: align as 'right' | 'left' };
  const input = { borderWidth: 1.5, borderColor: ap.outlineVariant, borderRadius: 8, padding: 10, fontSize: 14, color: ap.onSurface, backgroundColor: '#fff', textAlign: align as 'right' | 'left' };
  const button = { borderRadius: 8, paddingVertical: 12, alignItems: 'center' as const };

  const ChoiceList = ({ items, value, onChange }: { items: Choice[]; value: string; onChange: (v: string) => void }) => (
    <View style={{ gap: 8 }}>
      {items.map((c) => {
        const selected = value === c.value;
        return (
          <Pressable key={c.value} onPress={() => onChange(c.value)} accessibilityRole="radio" accessibilityState={{ selected }}
            style={[card, { flexDirection: row, gap: 10, alignItems: 'flex-start', borderColor: selected ? ap.primary : ap.outlineVariant, backgroundColor: selected ? ap.surfaceContainerLow : '#fff' }]}>
            <Text style={{ fontSize: 16, color: selected ? ap.primary : ap.outline }}>{selected ? '◉' : '○'}</Text>
            <Text style={{ flex: 1, fontSize: 13, color: ap.onSurface, textAlign: align }}>{he ? c.labelHe : c.labelEn}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const editing = view?.viewer.kind === 'examiner' && view.viewer.canEdit;
  const self = view?.examiners.find((e) => e.isSelf);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: ap.surfaceContainerLow }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <View style={{ flexDirection: row, justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: ap.onSurface, textAlign: align }}>{view ? (he ? view.titleHe : view.titleEn) : he ? 'טופס בוחן' : 'Examiner form'}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={he ? 'סגור' : 'Close'} hitSlop={10}><Text style={{ fontSize: 20, color: ap.outline }}>✕</Text></Pressable>
        </View>

        {!view ? (
          loadError ? <Text style={{ marginTop: 16, color: ap.error, textAlign: align }} accessibilityRole="alert">{loadError}</Text> : <ActivityIndicator style={{ marginTop: 32 }} color={ap.primary} />
        ) : (
          <>
            <View style={[card, { marginTop: 14, gap: 6 }]}>
              {view.viewer.kind === 'examiner' && (
                <Text style={{ fontSize: 13, color: ap.onSurface, textAlign: align }}><Text style={{ fontWeight: '700' }}>{he ? 'שם הבוחן/ת: ' : 'Examiner: '}</Text>{self?.opinion?.examinerName ?? view.viewer.defaultName ?? ''}</Text>
              )}
              {view.header.map((h) => (
                <Text key={h.key} style={{ fontSize: 13, color: ap.onSurface, textAlign: align }}>
                  <Text style={{ fontWeight: '700' }}>{he ? h.labelHe : h.labelEn}: </Text>{(he ? h.value : h.valueEn ?? h.value) ?? '—'}
                </Text>
              ))}
            </View>

            {view.outcome && <Text style={[card, { marginTop: 12, fontSize: 13, color: ap.onSurface, textAlign: align }]}>{he ? OUTCOME_TEXT[view.outcome.result].he : OUTCOME_TEXT[view.outcome.result].en}</Text>}
            {view.gradeApproved && view.finalGrade != null && view.viewer.kind !== 'examiner' && (
              <Text style={{ marginTop: 12, fontSize: 13, fontWeight: '700', color: '#1B7F3B', textAlign: align }}>{he ? `הציון הסופי אושר: ${view.finalGrade}` : `Final grade approved: ${view.finalGrade}`}</Text>
            )}

            {editing && (
              <>
                <View style={[card, { marginTop: 14, borderStyle: 'dashed' }]}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: ap.onSurface, textAlign: align }}>{he ? 'מילאת את הטופס בקובץ Word? אפשר להעלות אותו' : 'Filled in the Word form? You can upload it'}</Text>
                  <Text style={{ marginTop: 4, fontSize: 12, color: ap.onSurfaceVariant, textAlign: align }}>{he ? 'המערכת תקרא את הטופס ותמלא את הפרטים למטה.' : 'The system reads the form and fills in the details below.'}</Text>
                  <Pressable onPress={uploadForm} disabled={busy} accessibilityRole="button" style={[button, { marginTop: 8, borderWidth: 1, borderColor: ap.outlineVariant }]}>
                    <Text style={{ color: ap.primary, fontWeight: '700' }}>📄 {he ? 'העלאת הטופס' : 'Upload the form'}</Text>
                  </Pressable>
                  {!!parseNote && <Text style={{ marginTop: 8, fontSize: 12, color: ap.onSurface, textAlign: align }}>{parseNote}</Text>}
                </View>

                <Text style={title}>{he ? 'המוסד' : 'Institution'}</Text>
                <TextInput value={institution} onChangeText={setInstitution} style={input} />

                <Text style={title}>{he ? 'מסקנות' : 'Conclusion'}</Text>
                <ChoiceList items={view.conclusions} value={conclusion} onChange={setConclusion} />

                <Text style={title}>{he ? 'בקשת חיסיון' : 'Confidentiality request'}</Text>
                <ChoiceList items={view.confidentialityOptions} value={confidentiality} onChange={setConfidentiality} />

                <Text style={title}>{he ? 'חוות דעת מפורטת' : 'Detailed opinion'}</Text>
                <TextInput multiline value={opinion} onChangeText={setOpinion} style={[input, { minHeight: 140, textAlignVertical: 'top' }]} />
                {hideMarked && (
                  <>
                    <Text style={title}>{he ? 'החלקים שלא יועברו לסטודנט ולמנחה' : 'Parts not to be passed on'}</Text>
                    <TextInput multiline value={confidentialOpinion} onChangeText={setConfidentialOpinion} style={[input, { minHeight: 90, textAlignVertical: 'top' }]} />
                  </>
                )}
                <Pressable onPress={pickAttachments} accessibilityRole="button" style={[button, { marginTop: 10, borderWidth: 1, borderColor: ap.outlineVariant }]}>
                  <Text style={{ color: ap.primary, fontWeight: '700' }}>📎 {attachments.length ? (he ? `${attachments.length} קבצים צורפו` : `${attachments.length} file(s) attached`) : he ? 'צירוף חוות הדעת כקובץ (אופציונלי)' : 'Attach the opinion as a file (optional)'}</Text>
                </Pressable>

                <Text style={{ marginTop: 12, fontSize: 12, color: ap.onSurfaceVariant, textAlign: align }}>{he ? 'בהגשה הטופס ייחתם דיגיטלית בשמך, עם התאריך וקוד חתימה ייחודי.' : 'Submitting signs the form digitally in your name, with the date and a unique signature code.'}</Text>
                <Pressable onPress={submit} disabled={busy || !canSubmit} accessibilityRole="button" style={[button, { marginTop: 8, backgroundColor: ap.primary, opacity: busy || !canSubmit ? 0.5 : 1 }]}>
                  <Text style={{ color: ap.onPrimary, fontWeight: '700' }}>{busy ? '…' : he ? '✍️ חתום/י והגש/י' : '✍️ Sign & submit'}</Text>
                </Pressable>
              </>
            )}

            {view.viewer.kind === 'examiner' && !view.viewer.canEdit && !!view.viewer.lockedReasonHe && (
              <Text style={{ marginTop: 14, fontSize: 13, color: ap.onSurfaceVariant, textAlign: align }}>{he ? view.viewer.lockedReasonHe : view.viewer.lockedReasonEn}</Text>
            )}

            {view.examiners.filter((e) => e.opinion && !(editing && e.isSelf)).map((e) => {
              const o = e.opinion!;
              const name = e.name ?? (he ? `בוחן/ת ${e.index + 1} (שם חסוי)` : `Examiner ${e.index + 1} (name withheld)`);
              return (
                <View key={e.index} style={[card, { marginTop: 14, gap: 6 }]}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: ap.onSurface, textAlign: align }}>{name}{o.institution ? ` · ${o.institution}` : ''}</Text>
                  <Text style={{ fontSize: 13, color: ap.onSurface, textAlign: align }}><Text style={{ fontWeight: '700' }}>{he ? 'מסקנה: ' : 'Conclusion: '}</Text>{labelOf(view.conclusions, o.conclusion)}</Text>
                  <Text style={{ fontSize: 13, color: ap.onSurface, textAlign: align }}><Text style={{ fontWeight: '700' }}>{he ? 'בקשת חיסיון: ' : 'Confidentiality: '}</Text>{labelOf(view.confidentialityOptions, o.confidentiality)}</Text>
                  {!!o.opinion && <Text style={{ fontSize: 13, color: ap.onSurface, backgroundColor: ap.surfaceContainerLow, padding: 8, borderRadius: 6, textAlign: align }}>{o.opinion}</Text>}
                  {!!o.confidentialOpinion && (
                    <View style={{ borderWidth: 1, borderColor: ap.error, borderRadius: 6, padding: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: ap.error, textAlign: align }}>{he ? 'חלקים חסויים' : 'Confidential parts'}</Text>
                      <Text style={{ fontSize: 13, color: ap.onSurface, textAlign: align }}>{o.confidentialOpinion}</Text>
                    </View>
                  )}
                  {[...(o.uploadedFormUrl ? [o.uploadedFormUrl] : []), ...o.fileUrls].map((url, i) => (
                    <Pressable key={url} onPress={() => Linking.openURL(url)} accessibilityRole="link">
                      <Text style={{ fontSize: 13, color: ap.primary, textAlign: align }}>📎 {i === 0 && o.uploadedFormUrl ? (he ? 'הטופס שהועלה' : 'Uploaded form') : (he ? `קובץ ${i + 1}` : `File ${i + 1}`)}</Text>
                    </Pressable>
                  ))}
                  {o.signedAnonymously ? (
                    <Text style={{ fontSize: 12, color: '#1B7F3B', textAlign: align }}>✓ {he ? 'נחתם דיגיטלית (שם הבוחן/ת חסוי לבקשתו/ה)' : "Digitally signed (the examiner's name is withheld)"}</Text>
                  ) : o.signature ? (
                    <View style={{ borderTopWidth: 1, borderTopColor: ap.outlineVariant, paddingTop: 6 }}>
                      <Text style={{ fontSize: 20, fontStyle: 'italic', color: ap.primary, textAlign: align }}>{o.signature.signerName}</Text>
                      <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, textAlign: align }}>{he ? o.signature.facultyNameHe : o.signature.facultyNameEn} · {new Date(o.signature.signedAt).toLocaleString(he ? 'he-IL' : 'en-GB')}</Text>
                      <Text style={{ fontSize: 12, color: ap.onSurface, textAlign: align }}>{he ? 'קוד חתימה: ' : 'Signature code: '}<Text style={{ fontWeight: '700', fontFamily: 'monospace' }}>{o.signature.code}</Text></Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: o.signature.valid ? '#1B7F3B' : ap.error, textAlign: align }}>{o.signature.valid ? `✓ ${he ? 'החתימה תקפה' : 'Signature valid'}` : `⚠ ${he ? 'החתימה אינה תקפה' : 'Signature invalid'}`}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
            {view.viewer.kind !== 'examiner' && view.examiners.filter((e) => !e.opinion).map((e) => (
              <Text key={`p${e.index}`} style={[card, { marginTop: 10, borderStyle: 'dashed', fontSize: 13, color: ap.outline, textAlign: align }]}>
                {e.name ? (he ? `ממתין לחוות הדעת של ${e.name}` : `Awaiting ${e.name}'s opinion`) : he ? `ממתין לחוות דעת של בוחן/ת ${e.index + 1}` : `Awaiting examiner ${e.index + 1}`}
              </Text>
            ))}

            {view.viewer.kind === 'staff' && view.outcome?.result === 'continue' && !view.gradeApproved && (
              <View style={[card, { marginTop: 16, gap: 8 }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: ap.onSurface, textAlign: align }}>{he ? 'הזנת הציון הסופי ואישורו' : 'Enter and approve the final grade'}</Text>
                {view.students.map((s) => (
                  <View key={s.id} style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 13, color: ap.onSurface, textAlign: align }}>{s.name}</Text>
                    <TextInput keyboardType="number-pad" value={grades[s.id] ?? ''} onChangeText={(v) => setGrades({ ...grades, [s.id]: v })} accessibilityLabel={`${he ? 'ציון סופי' : 'Final grade'} — ${s.name}`} style={[input, { width: 70, textAlign: 'center' }]} />
                  </View>
                ))}
                <Pressable
                  onPress={approveGrade}
                  disabled={busy || view.students.some((s) => !grades[s.id] || Number(grades[s.id]) < 0 || Number(grades[s.id]) > 100)}
                  accessibilityRole="button"
                  style={[button, { backgroundColor: ap.primary, opacity: busy ? 0.5 : 1 }]}
                >
                  <Text style={{ color: ap.onPrimary, fontWeight: '700' }}>{he ? '✍️ אשר/י וחתום/י' : '✍️ Approve & sign'}</Text>
                </Pressable>
              </View>
            )}
            {view.viewer.kind === 'staff' && (view.outcome?.result === 'revise' || view.outcome?.result === 'reject') && (
              <View style={[card, { marginTop: 16, gap: 8 }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: ap.onSurface, textAlign: align }}>{he ? 'החזרת העבודה לסטודנט/ית לתיקונים' : 'Return the thesis for corrections'}</Text>
                <TextInput multiline value={sendBackNote} onChangeText={setSendBackNote} placeholder={he ? 'הודעה לסטודנט/ית (חובה)' : 'Message to the student (required)'} style={[input, { minHeight: 70, textAlignVertical: 'top' }]} />
                <Pressable onPress={sendBack} disabled={busy || !sendBackNote.trim()} accessibilityRole="button" style={[button, { borderWidth: 1, borderColor: ap.outlineVariant, opacity: busy || !sendBackNote.trim() ? 0.5 : 1 }]}>
                  <Text style={{ color: ap.onSurface, fontWeight: '700' }}>{he ? 'החזר/י לתיקונים' : 'Return for corrections'}</Text>
                </Pressable>
              </View>
            )}

            {!!error && <Text style={{ marginTop: 12, color: ap.error, textAlign: align }} accessibilityRole="alert">{error}</Text>}
            {!!message && <Text style={{ marginTop: 12, color: '#1B7F3B', textAlign: align }}>{message}</Text>}
          </>
        )}
      </ScrollView>
    </Modal>
  );
}
