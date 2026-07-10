// app/student/home.tsx  — React Native (Expo) version
// The Next.js version is app/[locale]/(student)/home/page.tsx (see bottom of file)

import React, { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/src/firebase/firebase';
import {
  View, Text, Pressable,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context'
import { apiClient } from '@/src/api/apiClient';
import { useRouter } from 'expo-router';
import { useStudentData } from '../../hooks/useStudentData';
import { tx, type Lang } from '../../components/i18n';
import { studentHomeStyles } from '@/constants';
import { NotificationBell } from '../../components/NotificationBell';
import DeleteAccountModal from '../../components/modals/DeleteAccountModal';

// ─── Sub-screens ──────────────────────────────────────────────────────────────
import BrowseProjects  from '../(tabs)/Browseprojects';
import ActiveDashboard from '../(tabs)/Activedashboard';
import PendingScreen   from '../(tabs)/Pendingscreen';
import InfoScreen      from './info';
import ChatbotFab       from '@/components/ChatbotFab';

export default function StudentHome() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('he');
  const [deleteAccountModal, setDeleteAccountModal] = useState(false);
  const isRtl = lang === 'he';

  const {
    studentState, studentName, studentYearOfStudy,
    proposals, activeProject, milestones, nextMilestone, progress,
    pendingApplication, studentDegree, studentCompletedCourses, cancelAllListeners
  } = useStudentData();

 const handleSignOut = async () => {
    try {
      await apiClient.post('/api/users/logout');  // ← add the /
    } catch (e) {
      console.warn('Logout API call failed, continuing anyway');
    } finally {
      cancelAllListeners();
      await signOut(auth);
      router.replace('/(auth)/login');
    }
  };

  const handleAccountDeletionRequested = async () => {
    setDeleteAccountModal(false);
    cancelAllListeners();
    await signOut(auth);
    router.replace('/(auth)/login');
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
        {/* Top Bar — same as normal */}
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
            <Pressable style={styles.langToggle} onPress={() => setLang(lang === 'he' ? 'en' : 'he')}>
              <Text style={styles.langText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
            </Pressable>
            <NotificationBell />
            <Pressable onPress={() => setDeleteAccountModal(true)} accessibilityLabel="Delete account">
              <Text style={{ fontSize: 18, marginHorizontal: 6 }}>🗑️</Text>
            </Pressable>
            <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
              <Text style={styles.signOutText}>{tx('logout', lang)}</Text>
            </Pressable>
          </View>
        </View>

        <InfoScreen lang={lang} isRtl={isRtl} studentName={studentName} studentDegree={studentDegree} />
        <ChatbotFab lang={lang} corner="bottom-left" />
        <DeleteAccountModal
          visible={deleteAccountModal}
          onClose={() => setDeleteAccountModal(false)}
          lang={lang}
          onRequested={handleAccountDeletionRequested}
        />
      </SafeAreaView>
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
          <NotificationBell />

          {/* Delete account */}
          <Pressable onPress={() => setDeleteAccountModal(true)} accessibilityLabel="Delete account">
            <Text style={{ fontSize: 18, marginHorizontal: 6 }}>🗑️</Text>
          </Pressable>

          {/* Sign out */}
          <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
            <Text style={styles.signOutText}>{tx('logout', lang)}</Text>
          </Pressable>
        </View>
      </View>

      <DeleteAccountModal
        visible={deleteAccountModal}
        onClose={() => setDeleteAccountModal(false)}
        lang={lang}
        onRequested={handleAccountDeletionRequested}
      />

      {/* ── Main Content — smart routing ── */}
      {studentState === 'no_project' && (
        <BrowseProjects
        proposals={proposals}
        lang={lang}
        isRtl={isRtl}
        studentDegree={studentDegree}
        appliedProjectIds={pendingApplication ? [pendingApplication.projectId] : []}
        completedCourses={studentCompletedCourses}
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

      <ChatbotFab lang={lang} corner="bottom-left" />
    </SafeAreaView>
  );
}

const styles = studentHomeStyles;