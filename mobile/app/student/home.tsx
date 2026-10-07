// app/student/home.tsx  — React Native (Expo) version
// The Next.js version is app/[locale]/(student)/home/page.tsx (see bottom of file)

import React, { useState } from 'react';
import {
  View, Text, Pressable,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context'
import { apiClient } from '@/src/api/apiClient';
import { useStudentData } from '../../hooks/useStudentData';
import { tx, type Lang } from '../../components/i18n';
import { studentHomeStyles } from '@/constants';
import { ap } from '@/constants/theme';
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

  const {
    studentState, studentName, studentYearOfStudy,
    proposals, activeProjects,
    pendingApplications, supervisorSelectionRequiresApproval, studentDegree, studentFaculty, studentEffectiveTrack, studentCompletedCourses, cancelAllListeners, refresh,
    error,
  } = useStudentData();

  // Passed as TopBar's onBeforeSignOut — runs (and is awaited) before it
  // signs out and redirects, for both the sign-out button and the
  // delete-account flow.
  const handleBeforeSignOut = async () => {
    try {
      await apiClient.post('/api/users/logout');
    } catch {} finally {
      cancelAllListeners();
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (studentState === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ap.primary} />
        <Text style={styles.loadingText}>{tx('loading', lang)}</Text>
      </View>
    );
  }

  // A real fetch failure (network error, server error) forces studentState
  // to 'no_project' as a fallback — without this check that read as a
  // genuinely empty project catalog, with no way to tell the difference or
  // retry short of restarting the app.
  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>
          {lang === 'he' ? 'טעינת הנתונים נכשלה' : 'Failed to load your dashboard'}
        </Text>
        <Pressable onPress={() => refresh()} accessibilityRole="button" style={{ marginTop: 12 }}>
          <Text style={{ color: ap.primary, fontWeight: '600', fontSize: 14 }}>
            {lang === 'he' ? 'נסה שוב' : 'Try again'}
          </Text>
        </Pressable>
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
        studentEffectiveTrack={studentEffectiveTrack}
        pendingApplications={pendingApplications}
        completedCourses={studentCompletedCourses}
        onApplicationsChanged={refresh}
        />
      )}

      {studentState === 'choose_supervisor' && (
        <BrowseSupervisors
          lang={lang}
          isRtl={isRtl}
          studentFaculty={studentFaculty}
          studentDegree={studentDegree}
          studentEffectiveTrack={studentEffectiveTrack}
          pendingApplications={pendingApplications}
          supervisorSelectionRequiresApproval={supervisorSelectionRequiresApproval}
          onApplicationsChanged={refresh}
        />
      )}

      {studentState === 'active' && activeProjects.length > 0 && (
        <ActiveDashboard
          key={activeProjects[0].project.id}
          project={activeProjects[0].project}
          milestones={activeProjects[0].milestones}
          nextMilestone={activeProjects[0].nextMilestone}
          progress={activeProjects[0].progress}
          lang={lang}
          isRtl={isRtl}
        />
      )}

      <ChatbotFab lang={lang} corner="bottom-left" />
    </SafeAreaView>
  );
}

const styles = studentHomeStyles;