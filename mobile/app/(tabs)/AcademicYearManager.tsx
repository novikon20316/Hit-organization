// app/(tabs)/AcademicYearManager.tsx
//
// Lets system_admin / administrative coordinator correct or advance a
// student's yearOfStudy, and/or explicitly "keep them in the same academic
// year" (hold-back). Previously there was NO way to change yearOfStudy after
// account creation at all — a student stuck showing as ineligible had no
// path out even after actually reaching their final year (see
// server/src/controllers/userController.ts's computeIsEligible fix).

import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../src/firebase/firebase';
import type { Lang } from '../../components/i18n';
import { TopBar } from '../../components/shared';
import { ResponsiveScreen } from '../../components/ResponsiveScreen';
import { apiClient } from '../../src/api/apiClient';

interface StudentResult {
  id: string;
  displayName: string;
  email: string;
  studentId: string;
  facultyId: string;
  degreeType: string | null;
  major: string | null;
  yearOfStudy: number | null;
  isEligibleForProcess: boolean;
  academicYearHeld: boolean;
  academicYearHeldReason: string | null;
  completedCourses: { subject: string; grade?: number }[];
}

export default function AcademicYearManager() {
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<StudentResult[]>([]);
  const [selected, setSelected] = useState<StudentResult | null>(null);

  const [yearOfStudy, setYearOfStudy] = useState('');
  const [heldBack, setHeldBack] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  // Manual completed-courses editing is system_admin only, for now — unlike
  // the academic-year editor above, NOT extended to administrative_secretary.
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  React.useEffect(() => {
    apiClient.get('/api/users/profile')
      .then((res) => {
        const role = res.data?.role;
        const roles: string[] = res.data?.roles ?? [];
        setIsSystemAdmin(role === 'system_admin' || roles.includes('system_admin'));
      })
      .catch(() => {});
  }, []);

  const handleSearch = async () => {
    if (query.trim().length < 2) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'הזן לפחות 2 תווים' : 'Enter at least 2 characters');
      return;
    }
    setSearching(true);
    try {
      const res = await apiClient.get('/api/admin/students/search', { params: { q: query.trim() } });
      setResults(res.data.students ?? []);
    } catch (e: any) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', e.response?.data?.message || (lang === 'he' ? 'החיפוש נכשל' : 'Search failed'));
    } finally {
      setSearching(false);
    }
  };

  const selectStudent = (s: StudentResult) => {
    setSelected(s);
    setYearOfStudy(s.yearOfStudy != null ? String(s.yearOfStudy) : '');
    setHeldBack(s.academicYearHeld);
    setReason(s.academicYearHeldReason ?? '');
    setCourseRows(s.completedCourses ?? []);
    setCourseSubject('');
    setCourseGrade('');
  };

  // ── Completed courses (system_admin only) ─────────────────────────────────
  const [courseRows, setCourseRows] = useState<{ subject: string; grade?: number }[]>([]);
  const [courseSubject, setCourseSubject] = useState('');
  const [courseGrade, setCourseGrade] = useState('');
  const [savingCourses, setSavingCourses] = useState(false);

  const addCourseRow = () => {
    const trimmed = courseSubject.trim();
    if (!trimmed) return;
    const g = Number(courseGrade);
    if (!Number.isFinite(g) || g < 0 || g > 100) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'ציון חייב להיות בין 0 ל-100' : 'Grade must be between 0 and 100');
      return;
    }
    setCourseRows((prev) => [...prev.filter((r) => r.subject !== trimmed), { subject: trimmed, grade: g }]);
    setCourseSubject('');
    setCourseGrade('');
  };

  const removeCourseRow = (subj: string) => setCourseRows((prev) => prev.filter((r) => r.subject !== subj));

  const handleSaveCourses = async () => {
    if (!selected) return;
    setSavingCourses(true);
    try {
      const payload = courseRows.map((r) => ({ subject: r.subject, grade: r.grade ?? 0 }));
      await apiClient.put(`/api/admin/users/${selected.id}/completed-courses`, { completedCourses: payload });
      const updated: StudentResult = { ...selected, completedCourses: payload };
      setSelected(updated);
      setResults((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      Alert.alert('✅', lang === 'he' ? 'עודכן בהצלחה' : 'Updated successfully');
    } catch {
      // Server error text is English-only — show a bilingual generic
      // message instead of surfacing it raw (client-side validation above
      // already covers the only case that would realistically fail here).
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'העדכון נכשל' : 'Update failed');
    } finally {
      setSavingCourses(false);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    const parsedYear = yearOfStudy.trim() ? parseInt(yearOfStudy, 10) : undefined;
    if (parsedYear !== undefined && (!Number.isFinite(parsedYear) || parsedYear < 1)) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'שנת לימודים לא תקינה' : 'Invalid year of study');
      return;
    }
    if (heldBack && !reason.trim()) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'יש לציין סיבה להשארה באותה שנה' : 'A reason is required to hold the student back');
      return;
    }
    setSaving(true);
    try {
      await apiClient.put(`/api/admin/users/${selected.id}/academic-year`, {
        yearOfStudy: parsedYear,
        heldBack,
        reason: reason.trim() || undefined,
      });
      const updated: StudentResult = {
        ...selected,
        yearOfStudy: parsedYear ?? selected.yearOfStudy,
        academicYearHeld: heldBack,
        academicYearHeldReason: heldBack ? reason.trim() : null,
      };
      setSelected(updated);
      setResults((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      Alert.alert('✅', lang === 'he' ? 'עודכן בהצלחה' : 'Updated successfully');
    } catch (e: any) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', e.response?.data?.message || (lang === 'he' ? 'העדכון נכשל' : 'Update failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF' }}>
      <TopBar
        name=""
        role="system_admin"
        lang={lang}
        isRtl={isRtl}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
      />

      <ResponsiveScreen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#111', marginBottom: 4, textAlign: isRtl ? 'right' : 'left' }}>
          {lang === 'he' ? 'ניהול שנת לימודים' : 'Academic Year Management'}
        </Text>
        <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 14, textAlign: isRtl ? 'right' : 'left' }}>
          {lang === 'he' ? 'עדכון שנת לימודים או השארת סטודנט באותה שנה' : "Correct a student's year, or keep them in the same academic year"}
        </Text>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            style={{ flex: 1, borderWidth: 1.5, borderColor: '#DDD6FE', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, backgroundColor: '#fff' }}
            value={query}
            onChangeText={setQuery}
            placeholder={lang === 'he' ? 'חפש לפי שם, אימייל או ת.ז.' : 'Search by name, email, or ID'}
            onSubmitEditing={handleSearch}
          />
          <Pressable
            style={{ backgroundColor: '#7C3AED', borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }}
            onPress={handleSearch}
            disabled={searching}
          >
            {searching ? <ActivityIndicator color="#fff" size="small" /> : (
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{lang === 'he' ? 'חיפוש' : 'Search'}</Text>
            )}
          </Pressable>
        </View>

        {results.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => selectStudent(s)}
            style={{
              marginTop: 10, borderRadius: 12, padding: 12,
              borderWidth: 1.5, borderColor: selected?.id === s.id ? '#7C3AED' : '#E0E8FF',
              backgroundColor: selected?.id === s.id ? '#F5F3FF' : '#fff',
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111', textAlign: isRtl ? 'right' : 'left' }}>{s.displayName}</Text>
            <Text style={{ fontSize: 12, color: '#8899BB', marginTop: 2, textAlign: isRtl ? 'right' : 'left' }}>
              {s.email} {s.studentId ? `· ${s.studentId}` : ''}
            </Text>
            <Text style={{ fontSize: 12, color: '#8899BB', marginTop: 2, textAlign: isRtl ? 'right' : 'left' }}>
              {s.degreeType ?? '—'} · {lang === 'he' ? 'שנה' : 'Year'} {s.yearOfStudy ?? '—'}
              {s.academicYearHeld ? ` · 🔒 ${lang === 'he' ? 'נשאר באותה שנה' : 'Held back'}` : ''}
            </Text>
          </Pressable>
        ))}

        {selected && (
          <View style={{ marginTop: 16, borderRadius: 14, padding: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E0E8FF' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#111', textAlign: isRtl ? 'right' : 'left' }}>{selected.displayName}</Text>
            <Text style={{ fontSize: 12, marginTop: 4, color: selected.isEligibleForProcess ? '#10B981' : '#EF4444', textAlign: isRtl ? 'right' : 'left' }}>
              {lang === 'he' ? 'זכאות נוכחית לתהליך:' : 'Currently eligible:'} {selected.isEligibleForProcess ? (lang === 'he' ? 'כן' : 'Yes') : (lang === 'he' ? 'לא' : 'No')}
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, textAlign: isRtl ? 'right' : 'left' }}>
              {lang === 'he' ? 'שנת לימודים' : 'Year of study'}
            </Text>
            <TextInput
              style={{ borderWidth: 1.5, borderColor: '#DDD6FE', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, backgroundColor: '#fff', marginTop: 6 }}
              value={yearOfStudy}
              onChangeText={setYearOfStudy}
              keyboardType="numeric"
            />

            <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', marginTop: 14, gap: 8 }}>
              <Switch value={heldBack} onValueChange={setHeldBack} trackColor={{ true: '#7C3AED' }} />
              <Text style={{ fontSize: 13, color: '#374151', flex: 1, textAlign: isRtl ? 'right' : 'left' }}>
                {lang === 'he' ? 'השאר את הסטודנט/ית באותה שנה (לא לקדם)' : 'Keep this student in the same academic year'}
              </Text>
            </View>

            {heldBack && (
              <>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, textAlign: isRtl ? 'right' : 'left' }}>
                  {lang === 'he' ? 'סיבה' : 'Reason'}
                </Text>
                <TextInput
                  style={{ borderWidth: 1.5, borderColor: '#DDD6FE', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, backgroundColor: '#fff', marginTop: 6, minHeight: 60, textAlignVertical: 'top' }}
                  value={reason}
                  onChangeText={setReason}
                  multiline
                />
              </>
            )}

            <Pressable
              style={{ backgroundColor: '#7C3AED', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 16, opacity: saving ? 0.6 : 1 }}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" /> : (
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{lang === 'he' ? 'שמור' : 'Save'}</Text>
              )}
            </Pressable>
          </View>
        )}

        {/* Completed courses — manual stopgap, system_admin only. The real
            path is automatic (see applicationController.ts's
            mergeExtractedGradesIntoCompletedCourses, which reads grades
            straight off a transcript the student already uploaded). */}
        {selected && isSystemAdmin && (
          <View style={{ marginTop: 16, borderRadius: 14, padding: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E0E8FF' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#111', textAlign: isRtl ? 'right' : 'left' }}>
              📚 {lang === 'he' ? 'עריכת קורסים שהושלמו' : 'Edit Completed Courses'}
            </Text>
            <Text style={{ fontSize: 12, color: '#8899BB', marginTop: 4, textAlign: isRtl ? 'right' : 'left' }}>
              {lang === 'he'
                ? 'עריכה ידנית זו זמינה למנהל מערכת בלבד, כפתרון זמני עד שכל הציונים ייקלטו אוטומטית מגיליון ציונים.'
                : 'Manual editing, system_admin only, as a stopgap until every grade is picked up automatically from a gradesheet.'}
            </Text>

            {courseRows.length === 0 && (
              <Text style={{ fontSize: 12, color: '#8899BB', marginTop: 10 }}>
                {lang === 'he' ? 'לא נוספו קורסים עדיין' : 'No courses added yet'}
              </Text>
            )}
            {courseRows.map((r) => (
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
                  marginTop: 8,
                }}
              >
                <Text style={{ fontSize: 13, color: '#111' }}>{r.subject}</Text>
                <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 12, color: '#8899BB' }}>
                    {lang === 'he' ? 'ציון:' : 'Grade:'} {r.grade ?? '—'}
                  </Text>
                  <Pressable onPress={() => removeCourseRow(r.subject)}>
                    <Text style={{ color: '#DC2626', fontSize: 13 }}>✕</Text>
                  </Pressable>
                </View>
              </View>
            ))}

            <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', gap: 8, marginTop: 10 }}>
              <TextInput
                value={courseSubject}
                onChangeText={setCourseSubject}
                placeholder={lang === 'he' ? 'שם הקורס' : 'Course name'}
                placeholderTextColor="#9BA8C0"
                style={{ flex: 1, borderWidth: 1.5, borderColor: '#DDD6FE', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, backgroundColor: '#fff' }}
                textAlign={isRtl ? 'right' : 'left'}
              />
              <TextInput
                value={courseGrade}
                onChangeText={setCourseGrade}
                placeholder={lang === 'he' ? 'ציון' : 'Grade'}
                placeholderTextColor="#9BA8C0"
                keyboardType="numeric"
                style={{ width: 70, borderWidth: 1.5, borderColor: '#DDD6FE', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, backgroundColor: '#fff' }}
                textAlign={isRtl ? 'right' : 'left'}
              />
              <Pressable
                onPress={addCourseRow}
                style={{ borderWidth: 1.5, borderColor: '#7C3AED', borderRadius: 10, paddingHorizontal: 12, justifyContent: 'center' }}
              >
                <Text style={{ color: '#7C3AED', fontSize: 12, fontWeight: '700' }}>+ {lang === 'he' ? 'הוסף' : 'Add'}</Text>
              </Pressable>
            </View>

            <Pressable
              style={{ backgroundColor: '#7C3AED', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 14, opacity: savingCourses ? 0.6 : 1 }}
              onPress={handleSaveCourses}
              disabled={savingCourses}
            >
              {savingCourses ? <ActivityIndicator color="#fff" /> : (
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{lang === 'he' ? 'שמור' : 'Save'}</Text>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>
      </ResponsiveScreen>
    </SafeAreaView>
  );
}
