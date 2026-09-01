// components/modals/SupervisorEvaluationModal.tsx
//
// The supervisor's rubric within the three-rubric final-grade workflow (see
// workflowTemplates.ts's finalGradeComponents) — a dynamic form built from
// the defense milestone's configured supervisorEvaluation.components,
// posting to the dedicated supervisor-evaluation endpoint (this milestone's
// overall grade is an aggregate of three graders' rubrics, not just this
// one). Ports web/app/supervisor/dashboard/SupervisorEvaluationModal.tsx.

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { apiClient } from '../../src/api/apiClient';
import type { Lang } from '../i18n';

type PickedFile = { uri: string; name: string; mimeType?: string };

// Clamps to [0, max] on every keystroke — mirrors web's identical
// SupervisorEvaluationModal.tsx helper — so a supervisor can never type/leave
// a criterion above its configured maxScore.
function clampScoreInput(raw: string, max: number): string {
  if (raw === '') return raw;
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return String(Math.min(Math.max(n, 0), max));
}

interface RubricComponent { key: string; labelHe: string; labelEn: string; maxScore: number; weight: number }

interface Props {
  visible: boolean;
  lang: Lang;
  milestoneId: string;
  components: RubricComponent[];
  onClose: () => void;
  onSubmitted: () => void;
}

export default function SupervisorEvaluationModal({ visible, lang, milestoneId, components, onClose, onSubmitted }: Props) {
  const isRtl = lang === 'he';
  const [scores, setScores] = useState<Record<string, string>>({});
  const [comment, setComment] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setScores(Object.fromEntries(components.map((c) => [c.key, ''])));
      setComment('');
      setFile(null);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, milestoneId]);

  const total = Math.round(
    components.reduce((sum, c) => sum + ((Number(scores[c.key]) || 0) / c.maxScore) * c.weight, 0)
  );

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync();
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? undefined });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const scoresObj = Object.fromEntries(components.map((c) => [c.key, Number(scores[c.key]) || 0]));
      if (file) {
        const fileExtension = file.name?.split('.').pop()?.toLowerCase();
        const fallbackType = fileExtension === 'pdf' ? 'application/pdf' : 'application/octet-stream';
        const formData = new FormData();
        formData.append('scores', JSON.stringify(scoresObj));
        if (comment) formData.append('comment', comment);
        formData.append('files', { uri: file.uri, name: file.name, type: file.mimeType || fallbackType } as any);
        await apiClient.post(`/api/projects/milestones/${milestoneId}/supervisor-evaluation`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          transformRequest: (data: any) => data,
        });
      } else {
        await apiClient.post(`/api/projects/milestones/${milestoneId}/supervisor-evaluation`, { scores: scoresObj, comment });
      }
      onSubmitted();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || (lang === 'he' ? 'שליחת ההערכה נכשלה' : 'Failed to submit the evaluation'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: '#F8FAFC' }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#1E293B' }}>
            {lang === 'he' ? 'הערכת מנחה' : 'Supervisor Evaluation'}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={lang === 'he' ? 'סגור' : 'Close'}
          >
            <Text style={{ fontSize: 20, color: '#8899BB' }}>✕</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 16, gap: 14 }}>
          {components.map((c) => (
            <View key={c.key}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>
                {lang === 'he' ? c.labelHe : c.labelEn} (0–{c.maxScore})
              </Text>
              <TextInput
                style={{ borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 8, padding: 11, fontSize: 14, color: '#1E293B', backgroundColor: '#fff' }}
                value={scores[c.key] ?? ''}
                onChangeText={(v) => setScores((prev) => ({ ...prev, [c.key]: clampScoreInput(v, c.maxScore) }))}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          ))}
        </View>

        <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 16, marginBottom: 6 }}>
          {lang === 'he' ? 'הערכה מילולית והערות' : 'Written evaluation and comments'}
        </Text>
        <TextInput
          style={{
            borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 8, padding: 11,
            fontSize: 14, color: '#1E293B', backgroundColor: '#fff', minHeight: 90, textAlignVertical: 'top',
          }}
          value={comment}
          onChangeText={setComment}
          multiline
          numberOfLines={4}
          textAlign={isRtl ? 'right' : 'left'}
        />

        <Text style={{ marginTop: 14, fontSize: 14, fontWeight: '700', color: '#1E293B' }}>
          {lang === 'he' ? 'סה"כ' : 'Total'}: {total}/100
        </Text>

        <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 16, marginBottom: 8 }}>
          {lang === 'he' ? 'קובץ מצורף (אופציונלי)' : 'Attached file (optional)'}
        </Text>
        <Pressable
          onPress={pickFile}
          style={{ borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 10, padding: 12, backgroundColor: '#fff' }}
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 13, color: file ? '#1E293B' : '#94A3B8' }}>
            {file ? `📄 ${file.name}` : (lang === 'he' ? 'בחר/י קובץ...' : 'Choose a file...')}
          </Text>
        </Pressable>

        {error ? <Text style={{ marginTop: 12, color: '#EF4444', fontSize: 13 }}>{error}</Text> : null}

        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={{ marginTop: 16, borderRadius: 10, backgroundColor: '#7C3AED', paddingVertical: 12, alignItems: 'center', opacity: submitting ? 0.6 : 1 }}
          accessibilityRole="button"
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{lang === 'he' ? 'שלח' : 'Submit'}</Text>
          }
        </Pressable>
      </ScrollView>
    </Modal>
  );
}
