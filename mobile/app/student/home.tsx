// app/student/home.tsx  — React Native (Expo) version
// The Next.js version is app/[locale]/(student)/home/page.tsx (see bottom of file)

import React, { useState } from 'react';
import {
  View, Text,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context'
import { apiClient } from '@/src/api/apiClient';
import { useStudentData } from '../../hooks/useStudentData';
import { tx, type Lang } from '../../components/i18n';
import { studentHomeStyles } from '@/constants';
import { TopBar } from '../../components/shared';

// ─── Sub-screens ──────────────────────────────────────────────────────────────
import BrowseProjects  from '../(tabs)/Browseprojects';
import ActiveDashboard from '../(tabs)/Activedashboard';
import InfoScreen      from './info';
import ChatbotFab       from '@/components/ChatbotFab';

export default function StudentHome() {
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';

  const {
    studentState, studentName, studentYearOfStudy,
    proposals, activeProject, milestones, nextMilestone, progress,
    pendingApplications, studentDegree, studentCompletedCourses, cancelAllListeners, refresh
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

      {studentState === 'active' && activeProject && (
        <ActiveDashboard
          project={activeProject}
          milestones={milestones}
          nextMilestone={nextMilestone}
          progress={progress}
          lang={lang}
          isRtl={isRtl}
        />
      )}

      <ChatbotFab lang={lang} corner="bottom-left" />
    </SafeAreaView>
  );
}

const styles = studentHomeStyles;