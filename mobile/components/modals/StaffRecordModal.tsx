// components/modals/StaffRecordModal.tsx
//
// An official supervisor-side record on a research_proposal/progress_report
// milestone, alongside (never replacing) the student's own submission — see
// workflowTemplates.ts's staffRecordMode. Either upload a completed file or
// fill the configured staffFormFields online; never both in one submission.
// Ports web/app/supervisor/dashboard/StaffRecordModal.tsx.

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { apiClient } from '../../src/api/apiClient';
import type { Lang } from '../i18n';

interface StaffFormField {
  key: string;
  labelHe: string;
  labelEn: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'table';
  required: boolean;
}

interface Props {
  visible: boolean;
  lang: Lang;
  milestoneId: string;
  fields: StaffFormField[];
  onClose: () => void;
  onSubmitted: () => void;
}

export default function StaffRecordModal({ visible, lang, milestoneId, fields, onClose, onSubmitted }: Props) {
  const isRtl = lang === 'he';
  const [mode, setMode] = useState<'upload' | 'form'>(fields.length > 0 ? 'form' : 'upload');
  const [file, setFile] = useState<{ uri: string; name: string; mimeType?: string } | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Reset the form each time this reopens for a (possibly different) milestone.
  useEffect(() => {
    if (visible) {
      setMode(fields.length > 0 ? 'form' : 'upload');
      setFile(null);
      setValues({});
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, milestoneId]);

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync();
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? undefined });
  };

  const handleSubmit = async () => {
    setError('');

    if (mode === 'upload') {
      if (!file) {
        setError(lang === 'he' ? 'יש לבחור קובץ' : 'Choose a file');
        return;
      }
      setSubmitting(true);
      try {
        const fileExtension = file.name?.split('.').pop()?.toLowerCase();
        const fallbackType = fileExtension === 'pdf' ? 'application/pdf' : 'application/octet-stream';
        const formData = new FormData();
        formData.append('files', {
          uri: file.uri,
          name: file.name,
          type: file.mimeType || fallbackType,
        } as any);
        await apiClient.post(`/api/supervisor/milestones/${milestoneId}/staff-record`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          transformRequest: (data: any) => data,
        });
        onSubmitted();
        onClose();
      } catch (err: any) {
        setError(err.response?.data?.message || (lang === 'he' ? 'ההעלאה נכשלה' : 'Upload failed'));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const missing = fields.filter((f) => f.required && !values[f.key]?.trim());
    if (missing.length > 0) {
      setError(lang === 'he' ? 'יש למלא את כל שדות החובה' : 'Fill in every required field');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(`/api/supervisor/milestones/${milestoneId}/staff-record`, { formData: values });
      onSubmitted();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || (lang === 'he' ? 'השליחה נכשלה' : 'Submission failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: '#F8FAFC' }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#1E293B' }}>
            {lang === 'he' ? 'רשומת מנחה' : 'Staff Record'}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={lang === 'he' ? 'סגור' : 'Close'}
          >
            <Text style={{ fontSize: 20, color: '#8899BB' }}>✕</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: 6, marginTop: 16 }}>
          <Pressable
            onPress={() => setMode('upload')}
            style={{
              flex: 1, borderRadius: 10, borderWidth: 1.5, paddingVertical: 8, paddingHorizontal: 10, alignItems: 'center',
              borderColor: mode === 'upload' ? '#7C3AED' : '#E2E8F0',
              backgroundColor: mode === 'upload' ? '#7C3AED' : '#fff',
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: mode === 'upload' }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: mode === 'upload' ? '#fff' : '#1E293B' }}>
              {lang === 'he' ? 'העלאת קובץ' : 'Upload a file'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => fields.length > 0 && setMode('form')}
            disabled={fields.length === 0}
            style={{
              flex: 1, borderRadius: 10, borderWidth: 1.5, paddingVertical: 8, paddingHorizontal: 10, alignItems: 'center',
              borderColor: mode === 'form' ? '#7C3AED' : '#E2E8F0',
              backgroundColor: mode === 'form' ? '#7C3AED' : '#fff',
              opacity: fields.length === 0 ? 0.4 : 1,
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: mode === 'form', disabled: fields.length === 0 }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: mode === 'form' ? '#fff' : '#1E293B' }}>
              {lang === 'he' ? 'מילוי טופס' : 'Fill the form'}
            </Text>
          </Pressable>
        </View>

        {mode === 'upload' ? (
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>
              {lang === 'he' ? 'קובץ' : 'File'}
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
          </View>
        ) : (
          <View style={{ marginTop: 16, gap: 14 }}>
            {fields.map((f) => (
              <View key={f.key}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>
                  {lang === 'he' ? f.labelHe : f.labelEn}{f.required ? ' *' : ''}
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 8, padding: 11,
                    fontSize: 14, color: '#1E293B', backgroundColor: '#fff',
                    ...(f.type === 'textarea' ? { minHeight: 90, textAlignVertical: 'top' as const } : {}),
                  }}
                  value={values[f.key] ?? ''}
                  onChangeText={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
                  multiline={f.type === 'textarea'}
                  numberOfLines={f.type === 'textarea' ? 4 : 1}
                  keyboardType={f.type === 'number' ? 'numeric' : 'default'}
                  placeholder={f.type === 'date' ? 'YYYY-MM-DD' : undefined}
                  placeholderTextColor="#9CA3AF"
                  textAlign={isRtl ? 'right' : 'left'}
                />
              </View>
            ))}
            {fields.length === 0 && (
              <Text style={{ fontSize: 12, color: '#94A3B8' }}>
                {lang === 'he' ? 'לא הוגדרו שדות לטופס זה.' : 'No fields configured for this form.'}
              </Text>
            )}
          </View>
        )}

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
