// app/student/home.tsx  — React Native (Expo) version
// The Next.js version is app/[locale]/(student)/home/page.tsx (see bottom of file)

import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  StyleSheet, ActivityIndicator, Platform, SafeAreaView,
} from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import { useStudentData } from '../../hooks/useStudentData';
import { t, tx, type Lang } from '../../components/i18n';

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
    pendingApplication, notifications, unreadCount,
  } = useStudentData();

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/');
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
          <Pressable style={styles.bellBtn} onPress={() => router.push('/student/notifications')}>
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
        <BrowseProjects proposals={proposals} lang={lang} isRtl={isRtl} />
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

const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#F0F4FF' },
  rtl:          { direction: 'rtl' },
  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F4FF' },
  loadingText:  { marginTop: 12, color: '#666', fontSize: 15 },
  row:          { flexDirection: 'row', alignItems: 'center' },
  rowReverse:   { flexDirection: 'row-reverse', alignItems: 'center' },
  textRight:    { textAlign: 'right' },

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8EDF5',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },

  // Avatar
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#2E86FF',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  welcomeText: { fontSize: 14, fontWeight: '600', color: '#111' },
  roleTag:     { fontSize: 11, color: '#2E86FF', fontWeight: '500', marginTop: 1 },

  // Lang toggle
  langToggle: {
    backgroundColor: '#F0F4FF', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    marginRight: 8, borderWidth: 1, borderColor: '#D0DEFF',
  },
  langText: { fontSize: 12, fontWeight: '700', color: '#2E86FF' },

  // Bell
  bellBtn:    { marginRight: 8, position: 'relative' },
  bellIcon:   { fontSize: 22 },
  badge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: '#FF3B30', borderRadius: 8,
    minWidth: 16, height: 16,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  // Sign out
  signOutBtn: {
    backgroundColor: '#FFF0F0', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#FFCDD2',
  },
  signOutText: { fontSize: 12, fontWeight: '600', color: '#D32F2F' },
});