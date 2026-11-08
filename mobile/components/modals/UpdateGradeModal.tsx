// components/modals/UpdateGradeModal.tsx
//
// Lets a supervisor overwrite a grade they already submitted for a
// milestone — a single overall score (0-100) plus a mandatory reason. Ports
// web/app/supervisor/dashboard/UpdateGradeModal.tsx onto the same endpoint
// (projectController.ts's submitMilestoneGrade), which requires `reason`
// whenever a supervisor score already exists, refuses an already-approved
// grade, and logs the change (grades doc + auditLog) and notifies the student.
// Callers mount it only while open, so its form state starts fresh each time.

import React, { useState } from 'react';
import { Modal, View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { apiClient } from '../../src/api/apiClient';
import { ap } from '../../constants/theme';
import type { Lang } from '../i18n';
import { InfoTooltip } from '../InfoTooltip';
import { FieldGuideOverlay } from '../guidance/FieldGuideOverlay';
import { FieldGuideTarget } from '../guidance/FieldGuideTarget';
import { UPDATE_GRADE_FIELD_GUIDE, UPDATE_GRADE_GUIDE_KEY } from '../../constants/supervisorFieldGuide';

function guideEntry(key: string) {
  return UPDATE_GRADE_FIELD_GUIDE.find((s) => s.key === key)!;
}

interface Props {
  visible: boolean;
  lang: Lang;
  milestoneId: string;
  projectId: string;
  milestoneName: string;
  currentScore: number | null;
  onClose: () => void;
  onUpdated: () => void;
}

export default function UpdateGradeModal({ visible, lang, milestoneId, projectId, milestoneName, currentScore, onClose, onUpdated }: Props) {
  const isRtl = lang === 'he';
  const [score, setScore] = useState(currentScore != null ? String(currentScore) : '');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const n = Number(score);
    if (score.trim() === '' || !Number.isFinite(n) || n < 0 || n > 100) {
      setError(lang === 'he' ? 'יש להזין ציון בין 0 ל-100' : 'Enter a grade between 0 and 100');
      return;
    }
    if (!reason.trim()) {
      setError(lang === 'he' ? 'יש לפרט את הסיבה לשינוי' : 'A reason for the change is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await apiClient.post(`/api/projects/milestones/${milestoneId}/grade`, {
        givenScore: n,
        projectId,
        reason: reason.trim(),
      });
      onUpdated();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || (lang === 'he' ? 'שגיאה בעדכון הציון' : 'Failed to update grade'));
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    borderWidth: 1.5, borderColor: ap.outlineVariant, borderRadius: 8, padding: 11,
    fontSize: 14, color: ap.onSurface, backgroundColor: '#fff',
  } as const;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: ap.surfaceContainerLow }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {visible && <FieldGuideOverlay guideKey={UPDATE_GRADE_GUIDE_KEY} steps={UPDATE_GRADE_FIELD_GUIDE} />}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: ap.onSurface }}>
            {lang === 'he' ? 'עדכון ציון' : 'Update Grade'}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={lang === 'he' ? 'סגור' : 'Close'} hitSlop={10}>
            <Text style={{ fontSize: 20, color: ap.outline }}>✕</Text>
          </Pressable>
        </View>
        <Text style={{ marginTop: 4, fontSize: 12, color: ap.onSurfaceVariant, textAlign: isRtl ? 'right' : 'left' }}>{milestoneName}</Text>

        <FieldGuideTarget fieldKey="score">
          <View style={{ marginTop: 16 }}>
            <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: ap.onSurfaceVariant }}>
                {lang === 'he' ? 'ציון חדש (0–100)' : 'New grade (0–100)'}
              </Text>
              <InfoTooltip textHe={guideEntry('score').description.he} textEn={guideEntry('score').description.en} />
            </View>
            <TextInput
              style={inputStyle}
              value={score}
              onChangeText={setScore}
              keyboardType="numeric"
              accessibilityLabel={lang === 'he' ? 'ציון חדש' : 'New grade'}
            />
          </View>
        </FieldGuideTarget>

        <FieldGuideTarget fieldKey="reason">
          <View style={{ marginTop: 14 }}>
            <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: ap.onSurfaceVariant }}>
                {lang === 'he' ? 'סיבת השינוי' : 'Reason for the change'}
              </Text>
              <InfoTooltip textHe={guideEntry('reason').description.he} textEn={guideEntry('reason').description.en} />
            </View>
            <TextInput
              style={[inputStyle, { minHeight: 80, textAlignVertical: 'top' }]}
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={3}
              textAlign={isRtl ? 'right' : 'left'}
              placeholder={lang === 'he' ? 'חובה לפרט מדוע הציון מתעדכן' : 'Required — explain why the grade is being updated'}
              accessibilityLabel={lang === 'he' ? 'סיבת השינוי' : 'Reason for the change'}
            />
          </View>
        </FieldGuideTarget>

        <Text style={{ marginTop: 10, fontSize: 12, color: ap.outline, textAlign: isRtl ? 'right' : 'left' }}>
          {lang === 'he'
            ? 'הסטודנט יקבל התראה על עדכון הציון וסיבת השינוי.'
            : 'The student will be notified that their grade changed and why.'}
        </Text>

        {error ? <Text style={{ marginTop: 12, color: '#EF4444', fontSize: 13 }} accessibilityRole="alert">{error}</Text> : null}

        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={{ marginTop: 16, borderRadius: 10, backgroundColor: '#00236f', paddingVertical: 12, alignItems: 'center', opacity: submitting ? 0.6 : 1 }}
          accessibilityRole="button"
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{lang === 'he' ? 'עדכן ציון' : 'Update Grade'}</Text>}
        </Pressable>
      </ScrollView>
    </Modal>
  );
}
