// components/CompletedCoursesEditor.tsx
// Self-service editor for a student's completedCourses (subject + grade) —
// needed so a project prerequisite's minGrade (see components/Prerequisites.ts)
// can actually be checked against something real instead of just a course name.

import React, { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { apiClient } from '@/src/api/apiClient';
import type { Lang } from './i18n';
import type { CompletedCourse } from './Prerequisites';

interface Props {
  lang: Lang;
  isRtl: boolean;
  completedCourses: CompletedCourse[];
  onSaved: () => void;
}

export default function CompletedCoursesEditor({ lang, isRtl, completedCourses, onSaved }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<CompletedCourse[]>(completedCourses);
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Re-syncs the editable draft with the latest saved data every time the
  // panel is opened, so a prior unsaved edit never lingers into a later session.
  const open = () => {
    setRows(completedCourses);
    setSubject('');
    setGrade('');
    setError('');
    setExpanded(true);
  };

  const addRow = () => {
    const trimmed = subject.trim();
    if (!trimmed) return;
    const g = Number(grade);
    if (!Number.isFinite(g) || g < 0 || g > 100) {
      setError(lang === 'he' ? 'ציון חייב להיות בין 0 ל-100' : 'Grade must be between 0 and 100');
      return;
    }
    setRows((prev) => [...prev.filter((r) => r.subject !== trimmed), { subject: trimmed, grade: g }]);
    setSubject('');
    setGrade('');
    setError('');
  };

  const removeRow = (subj: string) => setRows((prev) => prev.filter((r) => r.subject !== subj));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await apiClient.post('/api/users/completed-courses', {
        completedCourses: rows.map((r) => ({ subject: r.subject, grade: r.grade ?? 0 })),
      });
      setExpanded(false);
      onSaved();
    } catch {
      // Server error text is English-only — show a bilingual generic
      // message instead of surfacing it raw (client-side validation above
      // already covers the only case that would realistically fail here).
      setError(lang === 'he' ? 'שמירה נכשלה' : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, backgroundColor: '#fff', padding: 14, marginBottom: 12 }}>
      <Pressable
        onPress={() => (expanded ? setExpanded(false) : open())}
        style={{ flexDirection: isRtl ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#111' }}>
          📚 {lang === 'he' ? 'הקורסים שהשלמתי' : 'My Completed Courses'} ({completedCourses.length})
        </Text>
        <Text style={{ fontSize: 12, color: '#8899BB' }}>{expanded ? '▲' : '▼'}</Text>
      </Pressable>

      {expanded && (
        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 12, gap: 8 }}>
          {rows.length === 0 && (
            <Text style={{ fontSize: 12, color: '#8899BB' }}>{lang === 'he' ? 'לא נוספו קורסים עדיין' : 'No courses added yet'}</Text>
          )}
          {rows.map((r) => (
            <View
              key={r.subject}
              style={{
                flexDirection: isRtl ? 'row-reverse' : 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#F8FAFC',
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ fontSize: 13, color: '#111' }}>{r.subject}</Text>
              <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 12, color: '#8899BB' }}>
                  {lang === 'he' ? 'ציון:' : 'Grade:'} {r.grade ?? '—'}
                </Text>
                <Pressable onPress={() => removeRow(r.subject)}>
                  <Text style={{ color: '#DC2626', fontSize: 13 }}>✕</Text>
                </Pressable>
              </View>
            </View>
          ))}

          <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', gap: 8, marginTop: 4 }}>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder={lang === 'he' ? 'שם הקורס' : 'Course name'}
              placeholderTextColor="#9BA8C0"
              style={{ flex: 1, borderWidth: 1, borderColor: '#D0DEFF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 }}
              textAlign={isRtl ? 'right' : 'left'}
            />
            <TextInput
              value={grade}
              onChangeText={setGrade}
              placeholder={lang === 'he' ? 'ציון' : 'Grade'}
              placeholderTextColor="#9BA8C0"
              keyboardType="numeric"
              style={{ width: 70, borderWidth: 1, borderColor: '#D0DEFF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 }}
              textAlign={isRtl ? 'right' : 'left'}
            />
            <Pressable onPress={addRow} style={{ borderWidth: 1, borderColor: '#2E86FF', borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center' }}>
              <Text style={{ color: '#2E86FF', fontSize: 12, fontWeight: '700' }}>+ {lang === 'he' ? 'הוסף' : 'Add'}</Text>
            </Pressable>
          </View>

          {!!error && <Text style={{ color: '#DC2626', fontSize: 12 }}>{error}</Text>}

          <Pressable
            onPress={save}
            disabled={saving}
            style={{ backgroundColor: '#2E86FF', borderRadius: 8, paddingVertical: 10, alignItems: 'center', opacity: saving ? 0.6 : 1, marginTop: 2 }}
          >
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{saving ? '…' : lang === 'he' ? 'שמור' : 'Save'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
