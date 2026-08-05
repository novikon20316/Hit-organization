// components/modals/FinalGradeDecisionModal.tsx
//
// Once every rubric (supervisor + all examiners' project/defense evaluations)
// is in, the defense milestone's autoCalculatedFinalGrade is computed
// server-side. The supervisor either approves it as-is (finalizes
// immediately, no further sign-off needed) or proposes a different grade
// with a mandatory reason, which then goes to the coordinator's grade-
// override queue. Ports web/app/supervisor/dashboard/FinalGradeDecisionModal.tsx.

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { apiClient } from '../../src/api/apiClient';
import type { Lang } from '../i18n';

interface Props {
  visible: boolean;
  lang: Lang;
  milestoneId: string;
  autoCalculatedFinalGrade: number;
  onClose: () => void;
  onDecided: () => void;
}

export default function FinalGradeDecisionModal({ visible, lang, milestoneId, autoCalculatedFinalGrade, onClose, onDecided }: Props) {
  const isRtl = lang === 'he';
  const [mode, setMode] = useState<'choose' | 'override'>('choose');
  const [overrideGrade, setOverrideGrade] = useState(String(autoCalculatedFinalGrade));
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setMode('choose');
      setOverrideGrade(String(autoCalculatedFinalGrade));
      setReason('');
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, milestoneId, autoCalculatedFinalGrade]);

  const handleApprove = async () => {
    setSubmitting(true);
    setError('');
    try {
      await apiClient.post(`/api/supervisor/milestones/${milestoneId}/final-grade-decision`, { decision: 'approve' });
      onDecided();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || (lang === 'he' ? 'הפעולה נכשלה' : 'The action failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOverride = async () => {
    const grade = Number(overrideGrade);
    if (!Number.isFinite(grade) || grade < 0 || grade > 100) {
      setError(lang === 'he' ? 'יש להזין ציון בין 0 ל-100' : 'Enter a grade between 0 and 100');
      return;
    }
    if (!reason.trim()) {
      setError(lang === 'he' ? 'יש לנמק את השינוי' : 'A reason for the change is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await apiClient.post(`/api/supervisor/milestones/${milestoneId}/final-grade-decision`, {
        decision: 'override',
        grade,
        reason: reason.trim(),
      });
      onDecided();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || (lang === 'he' ? 'הפעולה נכשלה' : 'The action failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: '#F8FAFC' }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#1E293B' }}>
            {lang === 'he' ? 'ציון סופי מחושב' : 'Computed Final Grade'}
          </Text>
          <Pressable onPress={onClose}><Text style={{ fontSize: 20, color: '#8899BB' }}>✕</Text></Pressable>
        </View>

        <View style={{ marginTop: 16, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', padding: 16, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: '#64748B' }}>
            {lang === 'he' ? 'הציון המחושב אוטומטית' : 'Automatically calculated grade'}
          </Text>
          <Text style={{ fontSize: 32, fontWeight: '800', color: '#1E293B', marginTop: 4 }}>{autoCalculatedFinalGrade}</Text>
        </View>

        {mode === 'choose' ? (
          <View style={{ marginTop: 16, gap: 8 }}>
            <Pressable
              onPress={handleApprove}
              disabled={submitting}
              style={{ borderRadius: 10, backgroundColor: '#7C3AED', paddingVertical: 12, alignItems: 'center', opacity: submitting ? 0.6 : 1 }}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : (
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                    {lang === 'he' ? '✓ אשר את הציון המחושב' : '✓ Approve the computed grade'}
                  </Text>
                )
              }
            </Pressable>
            <Pressable
              onPress={() => setMode('override')}
              style={{ borderRadius: 10, borderWidth: 1.5, borderColor: '#CBD5E1', paddingVertical: 12, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#1E293B' }}>
                {lang === 'he' ? 'שנה את הציון' : 'Change the grade'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ marginTop: 16, gap: 14 }}>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>
                {lang === 'he' ? 'ציון חדש' : 'New grade'}
              </Text>
              <TextInput
                style={{ borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 8, padding: 11, fontSize: 14, color: '#1E293B', backgroundColor: '#fff' }}
                value={overrideGrade}
                onChangeText={setOverrideGrade}
                keyboardType="numeric"
              />
            </View>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>
                {lang === 'he' ? 'נימוק לשינוי (חובה)' : 'Reason for the change (required)'}
              </Text>
              <TextInput
                style={{
                  borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 8, padding: 11,
                  fontSize: 14, color: '#1E293B', backgroundColor: '#fff', minHeight: 80, textAlignVertical: 'top',
                }}
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={3}
                textAlign={isRtl ? 'right' : 'left'}
              />
            </View>
            <Text style={{ fontSize: 12, color: '#64748B' }}>
              {lang === 'he'
                ? 'השינוי יישלח לאישור הרכז/ת — עד להחלטתו/ה הציון לא ייכנס לתוקף.'
                : "This change will be sent to the coordinator for approval — it won't take effect until they decide."}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => setMode('choose')}
                style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: '#CBD5E1', paddingVertical: 10, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#1E293B' }}>{lang === 'he' ? 'חזרה' : 'Back'}</Text>
              </Pressable>
              <Pressable
                onPress={handleOverride}
                disabled={submitting}
                style={{ flex: 1, borderRadius: 10, backgroundColor: '#7C3AED', paddingVertical: 10, alignItems: 'center', opacity: submitting ? 0.6 : 1 }}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{lang === 'he' ? 'שלח לאישור' : 'Submit for approval'}</Text>
                }
              </Pressable>
            </View>
          </View>
        )}

        {error ? <Text style={{ marginTop: 12, color: '#EF4444', fontSize: 13 }}>{error}</Text> : null}
      </ScrollView>
    </Modal>
  );
}
