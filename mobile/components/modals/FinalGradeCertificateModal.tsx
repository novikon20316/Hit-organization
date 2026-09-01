// components/modals/FinalGradeCertificateModal.tsx
//
// Read-only digital version of Project_final_grade.docx — the data_science
// department's paper "final grade certificate" for a masters final project
// (that faculty has no thesis track). Every field here is system-derived
// from data entered elsewhere in the app; nothing is entered on this screen.
// See web/app/supervisor/dashboard/FinalGradeCertificateModal.tsx for the
// full rationale — this ports it to React Native.

import React from 'react';
import { Modal, View, Text, ScrollView, Pressable } from 'react-native';
import type { Lang } from '../i18n';
import { academicYearToHebrew } from '../../utils/hebrewYear';

interface StudentMilestoneRow {
  type: string;
  finalGrade: number | null;
  defenseDate: string | null;
}

interface StudentRow {
  studentId: string;
  studentName: string;
  overallFinalGrade: number | null;
  milestones: StudentMilestoneRow[];
}

interface CertificateProject {
  titleHe: string;
  titleEn: string;
  academicYear: string;
  projectStartDate?: string | null;
  enrolledStudents?: Array<{ id: string; studentIdNumber?: string | null }>;
}

interface Props {
  visible: boolean;
  lang: Lang;
  project: CertificateProject;
  students: StudentRow[];
  onClose: () => void;
}

function formatDate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function FinalGradeCertificateModal({ visible, lang, project, students, onClose }: Props) {
  const hebrewYear = academicYearToHebrew(project.academicYear);
  const defenseDate = students[0]?.milestones.find((m) => m.type === 'defense')?.defenseDate ?? null;
  const overallGrades = students.map((s) => s.overallFinalGrade);
  const allSameOverallGrade = overallGrades.every((g) => g === overallGrades[0]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: '#F8FAFC' }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#1E293B', flex: 1 }}>
            {lang === 'he' ? '📜 תעודת ציון סופי — פרויקט גמר' : '📜 Final Grade Certificate — Final Project'}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={lang === 'he' ? 'סגור' : 'Close'}>
            <Text style={{ fontSize: 20, color: '#8899BB' }}>✕</Text>
          </Pressable>
        </View>
        <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
          {lang === 'he' ? 'תואר שני במדעי הנתונים, M.Sc.' : "Master's in Data Science, M.Sc."}
        </Text>

        <View style={{ marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ minWidth: '45%' }}>
            <Text style={{ fontSize: 11, color: '#64748B' }}>{lang === 'he' ? 'שנה״ל' : 'Academic year'}</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1E293B' }}>{hebrewYear ?? '—'}</Text>
          </View>
          <View style={{ minWidth: '45%' }}>
            <Text style={{ fontSize: 11, color: '#64748B' }}>{lang === 'he' ? 'תאריך תחילת פרויקט' : 'Project start date'}</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1E293B' }}>{formatDate(project.projectStartDate, lang)}</Text>
          </View>
          <View style={{ minWidth: '45%' }}>
            <Text style={{ fontSize: 11, color: '#64748B' }}>{lang === 'he' ? 'תאריך ההגנה' : 'Defense date'}</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1E293B' }}>{formatDate(defenseDate, lang)}</Text>
          </View>
          <View style={{ minWidth: '100%' }}>
            <Text style={{ fontSize: 11, color: '#64748B' }}>{lang === 'he' ? 'שם הפרויקט' : 'Project name'}</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1E293B' }}>{(lang === 'he' ? project.titleHe : project.titleEn) || '—'}</Text>
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 6 }}>
            {lang === 'he' ? 'פרטי הסטודנט/ית/ים' : 'Student details'}
          </Text>
          <View style={{ borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', backgroundColor: '#F1F5F9', paddingVertical: 8, paddingHorizontal: 10 }}>
              <Text style={{ flex: 2, fontSize: 11, fontWeight: '700', color: '#64748B' }}>{lang === 'he' ? 'שם ומשפחה' : 'Full name'}</Text>
              <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: '#64748B' }}>{lang === 'he' ? 'ת.ז.' : 'ID'}</Text>
              <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: '#64748B' }}>{lang === 'he' ? 'ציון' : 'Grade'}</Text>
            </View>
            {students.map((s) => {
              const defenseGrade = s.milestones.find((m) => m.type === 'defense')?.finalGrade ?? null;
              const idNumber = project.enrolledStudents?.find((e) => e.id === s.studentId)?.studentIdNumber;
              return (
                <View key={s.studentId} style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                  <Text style={{ flex: 2, fontSize: 13, color: '#1E293B' }}>{s.studentName}</Text>
                  <Text style={{ flex: 1, fontSize: 13, color: '#1E293B' }}>{idNumber ?? '—'}</Text>
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#1E293B' }}>{defenseGrade ?? '—'}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={{ marginTop: 18, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', padding: 16, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: '#64748B' }}>
            {lang === 'he' ? 'ציון סופי לפרויקט גמר' : 'Final grade for the final project'}
          </Text>
          {allSameOverallGrade ? (
            <Text style={{ fontSize: 30, fontWeight: '800', color: '#1E293B', marginTop: 4 }}>{overallGrades[0] ?? '—'}</Text>
          ) : (
            <View style={{ marginTop: 4, gap: 2 }}>
              {students.map((s) => (
                <Text key={s.studentId} style={{ fontSize: 14, fontWeight: '700', color: '#1E293B' }}>
                  {s.studentName}: {s.overallFinalGrade ?? '—'}
                </Text>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </Modal>
  );
}
