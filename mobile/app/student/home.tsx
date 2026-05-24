// app/student/home.tsx  — React Native (Expo) version
// The Next.js version is app/[locale]/(student)/home/page.tsx (see bottom of file)

import React, { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/src/firebase/firebase';
import {
  View, Text, Pressable,
  ActivityIndicator, SafeAreaView,
} from 'react-native';
import { apiClient } from '@/src/api/apiClient';
import { useRouter } from 'expo-router';
import { useStudentData } from '../../hooks/useStudentData';
import { tx, type Lang } from '../../components/i18n';
import { studentHomeStyles } from '@/constants';

// ─── Sub-screens ──────────────────────────────────────────────────────────────
import BrowseProjects  from '../(tabs)/Browseprojects';
import ActiveDashboard from '../(tabs)/Activedashboard';
import PendingScreen   from '../(tabs)/Pendingscreen';

export default function StudentHome() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';

  const {
    studentState, studentName,
    proposals, activeProject, milestones, nextMilestone, progress,
    pendingApplication, unreadCount, studentDegree,
  } = useStudentData();

 const handleSignOut = async () => {
  try {
    await apiClient.post('/api/users/logout');  // ← add the /
  } catch (e) {
    console.warn('Logout API call failed, continuing anyway');
  } finally {
    await signOut(auth);
    router.replace('/(auth)/login');
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

  return (
    <SafeAreaView style={[styles.root, isRtl && styles.rtl]}>

      {/* ── Top Bar ── */}
      <View style={[styles.topBar, isRtl && styles.rowReverse]}>
        <View style={isRtl ? styles.rowReverse : styles.row}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {studentName?.charAt(0)?.toUpperCase() ?? 'S'}
            </Text>
          </View>
          <View style={{ marginLeft: isRtl ? 0 : 10, marginRight: isRtl ? 10 : 0 }}>
            <Text style={[styles.welcomeText, isRtl && styles.textRight]}>
              {tx('dashWelcome', lang)}, {studentName}
            </Text>
            <Text style={[styles.roleTag, isRtl && styles.textRight]}>
              {tx('appName', lang)}
            </Text>
          </View>
        </View>

        <View style={[styles.row, isRtl && styles.rowReverse]}>
          {/* Lang toggle */}
          <Pressable
            style={styles.langToggle}
            onPress={() => setLang(lang === 'he' ? 'en' : 'he')}
          >
            <Text style={styles.langText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
          </Pressable>

          {/* Notifications bell */}
          <Pressable style={styles.bellBtn} onPress={() => router.push('/(tabs)/notifications')}>
            <Text style={styles.bellIcon}>🔔</Text>
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </Pressable>

          {/* Sign out */}
          <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
            <Text style={styles.signOutText}>{tx('logout', lang)}</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Main Content — smart routing ── */}
      {studentState === 'no_project' && (
        <BrowseProjects 
        proposals={proposals} 
        lang={lang} 
        isRtl={isRtl} 
        studentDegree={studentDegree} 
        appliedProjectIds={pendingApplication ? [pendingApplication.projectId] : []}
        />
      )}

      {studentState === 'pending' && pendingApplication && (
        <PendingScreen application={pendingApplication} lang={lang} isRtl={isRtl} />
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

    </SafeAreaView>
  );
}

const styles = studentHomeStyles;