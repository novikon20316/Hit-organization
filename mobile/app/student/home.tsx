// app/student/home.tsx  — React Native (Expo) version
// The Next.js version is app/[locale]/(student)/home/page.tsx (see bottom of file)

import React, { useState } from 'react';
import {
  View, Text, Pressable,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context'
import { apiClient } from '@/src/api/apiClient';
import { useStudentData } from '../../hooks/useStudentData';
import { tx, type Lang } from '../../components/i18n';
import { studentHomeStyles } from '@/constants';
import { TopBar } from '../../components/shared';

// ─── Sub-screens ──────────────────────────────────────────────────────────────
import BrowseProjects  from '../(tabs)/Browseprojects';
import BrowseSupervisors from '../(tabs)/BrowseSupervisors';
import ActiveDashboard from '../(tabs)/Activedashboard';
import InfoScreen      from './info';
import AwaitingGradeScreen from './awaitingGrade';
import ChatbotFab       from '@/components/ChatbotFab';

export default function StudentHome() {
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';
  // TEMP-2-ACTIVE-PROJECTS: which of activeProjects[] is shown below — a
  // plain switcher rather than stacking two full ActiveDashboards (each has
  // its own internal tab bar + flex-filling ScrollView, not designed to sit
  // side by side). Say "revert the temp 2-active-projects bypass" to undo.
  const [selectedProjectIndex, setSelectedProjectIndex] = useState(0);

  const {
    studentState, studentName, studentYearOfStudy,
    proposals, activeProjects,
    pendingApplications, supervisorSelectionRequiresApproval, studentDegree, studentCompletedCourses, cancelAllListeners, refresh,
  } = useStudentData();

  // Passed as TopBar's onBeforeSignOut — runs (and is awaited) before it
  // signs out and redirects, for both the sign-out button and the
  // delete-account flow.
  const handleBeforeSignOut = async () => {
    try {
      await apiClient.post('/api/users/logout');
    } catch (e) {
      console.warn('Logout API call failed, continuing anyway');
    } finally {
      cancelAllListeners();
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (studentState === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2E86FF" />
        <Text style={styles.loadingText}>{tx('loading', lang)}</Text>
      </View>
    );
  }

  if (studentState === 'ineligible') {
    return (
      <SafeAreaView style={[styles.root, isRtl && styles.rtl]}>
        <TopBar
          name={studentName}
          role="student"
          lang={lang}
          isRtl={isRtl}
          onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
          onBeforeSignOut={handleBeforeSignOut}
        />

        <InfoScreen lang={lang} isRtl={isRtl} studentName={studentName} studentDegree={studentDegree} />
        <ChatbotFab lang={lang} corner="bottom-left" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, isRtl && styles.rtl]}>

      <TopBar
        name={studentName}
        role="student"
        lang={lang}
        isRtl={isRtl}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
        onBeforeSignOut={handleBeforeSignOut}
      />

      {/* ── Main Content — smart routing ── */}
      {studentState === 'awaiting_grade' && <AwaitingGradeScreen lang={lang} isRtl={isRtl} />}

      {studentState === 'no_project' && (
        <BrowseProjects
        proposals={proposals}
        lang={lang}
        isRtl={isRtl}
        studentDegree={studentDegree}
        pendingApplications={pendingApplications}
        completedCourses={studentCompletedCourses}
        onApplicationsChanged={refresh}
        />
      )}

      {studentState === 'choose_supervisor' && (
        <BrowseSupervisors
          lang={lang}
          isRtl={isRtl}
          pendingApplications={pendingApplications}
          supervisorSelectionRequiresApproval={supervisorSelectionRequiresApproval}
          onApplicationsChanged={refresh}
        />
      )}

      {/* TEMP-2-ACTIVE-PROJECTS: activeProjects can hold more than one entry
          while the server-side bypass is on (projectEnrollment.ts) —
          normally just the one, in which case this switcher row never
          renders at all. Say "revert the temp 2-active-projects bypass" to
          undo. */}
      {studentState === 'active' && activeProjects.length > 0 && (
        <>
          {activeProjects.length > 1 && (
            <View style={[tempStyles.switcherRow, isRtl && tempStyles.switcherRowRtl]}>
              {activeProjects.map((ap, i) => (
                <Pressable
                  key={ap.project.id}
                  style={[tempStyles.switcherPill, i === selectedProjectIndex && tempStyles.switcherPillActive]}
                  onPress={() => setSelectedProjectIndex(i)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: i === selectedProjectIndex }}
                >
                  <Text
                    style={[tempStyles.switcherText, i === selectedProjectIndex && tempStyles.switcherTextActive]}
                    numberOfLines={1}
                  >
                    {lang === 'he' ? ap.project.titleHe : ap.project.titleEn}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {(() => {
            const selected = activeProjects[Math.min(selectedProjectIndex, activeProjects.length - 1)];
            return (
              <ActiveDashboard
                key={selected.project.id}
                project={selected.project}
                milestones={selected.milestones}
                nextMilestone={selected.nextMilestone}
                progress={selected.progress}
                lang={lang}
                isRtl={isRtl}
              />
            );
          })()}
        </>
      )}

      <ChatbotFab lang={lang} corner="bottom-left" />
    </SafeAreaView>
  );
}

const styles = studentHomeStyles;

// TEMP-2-ACTIVE-PROJECTS: styles for the project switcher row above — delete
// alongside the rest of this bypass once reverted.
const tempStyles = StyleSheet.create({
  switcherRow:      { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E0E8FF' },
  switcherRowRtl:   { flexDirection: 'row-reverse' },
  switcherPill:     { flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 20, backgroundColor: '#F0F4FF', borderWidth: 1, borderColor: '#D0DEFF', alignItems: 'center' },
  switcherPillActive: { backgroundColor: '#2E86FF', borderColor: '#2E86FF' },
  switcherText:     { fontSize: 12, fontWeight: '600', color: '#445' },
  switcherTextActive: { color: '#fff' },
});