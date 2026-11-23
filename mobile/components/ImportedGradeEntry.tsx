// components/ImportedGradeEntry.tsx
// Mobile port of web's app/supervisor/dashboard/ImportedGradeEntry.tsx — a
// milestone the student finished BEFORE being imported into the system
// (importedAsDone, see server/src/services/importedStudentPlacement.ts) is
// already closed; only its grade is left. Shows "grade missing" with an
// inline field, or the grade with a "correct" link. Saves via
// POST /api/milestones/:id/imported-grade.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { apiClient } from '../src/api/apiClient';
import type { Lang } from './i18n';

interface Props {
  milestoneId: string;
  finalGrade: number | null;
  lang: Lang;
  onSaved: () => void;
}

export default function ImportedGradeEntry({ milestoneId, finalGrade, lang, onSaved }: Props) {
  const he = lang === 'he';
  const [editing, setEditing] = useState(finalGrade == null);
  const [value, setValue] = useState(finalGrade != null ? String(finalGrade) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const n = Number(value);
    if (value.trim() === '' || !Number.isFinite(n) || n < 0 || n > 100) {
      setError(he ? 'יש להזין ציון בין 0 ל-100' : 'Enter a grade from 0 to 100');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.post(`/api/milestones/${milestoneId}/imported-grade`, { grade: n });
      setEditing(false);
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.message || (he ? 'שמירת הציון נכשלה' : 'Failed to save the grade'));
    } finally {
      setSaving(false);
    }
  };

  const align = he ? 'right' : 'left';
  return (
    <View style={{ marginTop: 4 }}>
      <Text style={{ fontSize: 12, color: '#64748B', textAlign: align }}>
        📥 {he ? 'הושלם לפני המעבר למערכת' : 'Completed before joining the system'}
      </Text>
      {!editing && finalGrade != null ? (
        <View style={{ flexDirection: he ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#10B981' }}>🎓 {he ? `ציון: ${finalGrade}` : `Grade: ${finalGrade}`}</Text>
          <Pressable onPress={() => setEditing(true)} accessibilityRole="button">
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#00236f' }}>✏️ {he ? 'תיקון ציון' : 'Correct grade'}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: he ? 'row-reverse' : 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {finalGrade == null && (
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#DC2626' }}>{he ? 'חסר ציון' : 'Grade missing'}</Text>
          )}
          <TextInput
            value={value}
            onChangeText={setValue}
            keyboardType="numeric"
            placeholder={he ? 'ציון 0–100' : 'Grade 0–100'}
            accessibilityLabel={he ? 'ציון' : 'Grade'}
            style={{ width: 90, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, fontSize: 13, textAlign: align }}
          />
          <Pressable
            onPress={save}
            disabled={saving}
            accessibilityRole="button"
            style={{ backgroundColor: '#00236f', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5, opacity: saving ? 0.6 : 1 }}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{saving ? '…' : he ? 'שמירת ציון' : 'Save grade'}</Text>
          </Pressable>
          {finalGrade != null && (
            <Pressable onPress={() => { setEditing(false); setValue(String(finalGrade)); setError(''); }} accessibilityRole="button">
              <Text style={{ fontSize: 12, color: '#64748B' }}>{he ? 'ביטול' : 'Cancel'}</Text>
            </Pressable>
          )}
        </View>
      )}
      {!!error && <Text style={{ fontSize: 12, color: '#DC2626', marginTop: 2, textAlign: align }} accessibilityRole="alert">{error}</Text>}
    </View>
  );
}
