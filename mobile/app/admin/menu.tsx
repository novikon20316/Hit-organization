// app/admin/menu.tsx
// system_admin's admin panel navigation menu — the mobile equivalent of
// web's sidebar (web/app/admin/navConfig.ts + components/dashboard/
// SidebarShell.tsx). Reached from app/admin/overview.tsx's "Open Admin
// Panel" button. Every row here pushes app/admin/panel.tsx with a `tab`
// param — panel.tsx itself no longer renders its own in-page tab strip (see
// that file's comment), so this screen is now the only way to switch
// sections; panel.tsx's own TopBar back arrow returns here.
//
// Sections mirror navConfig.ts's grouping (Navigation / Directories &
// Config), limited to the destinations that actually exist on mobile —
// web-only items like Statistics, System Health, Reports and Committees
// have no mobile screen yet, so they're left out rather than linking to a
// 404.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { apiClient } from '@/src/api/apiClient';
import { TopBar } from '@/components/shared';
import type { Lang } from '@/components/i18n';

// Same hex values as web's --admin-* tokens (app/globals.css), matching
// app/admin/overview.tsx.
const C = {
  primary: '#00236f',
  secondary: '#505f76',
  surface: '#faf8ff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainer: '#eeedf4',
  onSurface: '#1a1b21',
  onSurfaceVariant: '#444651',
  outlineVariant: '#c5c5d3',
};

interface MenuItem {
  key: string;
  icon: string;
  label: { he: string; en: string };
  href: string;
}

const NAVIGATION_ITEMS: MenuItem[] = [
  { key: 'overview', icon: '📊', href: '/admin/panel', label: { he: 'סקירה', en: 'Overview' } },
  { key: 'users', icon: '👥', href: '/admin/panel?tab=users', label: { he: 'ניהול משתמשים', en: 'User Management' } },
  { key: 'projects', icon: '📁', href: '/admin/panel?tab=projects', label: { he: 'פרויקטים', en: 'Projects' } },
  { key: 'milestones', icon: '🏁', href: '/admin/panel?tab=milestones', label: { he: 'אבני דרך', en: 'Milestones' } },
  { key: 'defenseAccess', icon: '🔑', href: '/admin/panel?tab=defenseAccess', label: { he: 'גישת הגנה', en: 'Defense Access' } },
  { key: 'studentRoster', icon: '📋', href: '/admin/panel?tab=studentRoster', label: { he: 'רשימת סטודנטים', en: 'Student Roster' } },
  { key: 'signoffs', icon: '✅', href: '/admin/panel?tab=signoffs', label: { he: 'ממתין לאישור ציונים ובוחנים', en: 'Awaiting Grade/Examiner Approval' } },
  { key: 'archived', icon: '🗄️', href: '/admin/panel?tab=archived', label: { he: 'ארכיון', en: 'Archived' } },
  { key: 'feedback', icon: '💬', href: '/admin/panel?tab=feedback', label: { he: 'משוב', en: 'Feedback' } },
];

const DIRECTORY_ITEMS: MenuItem[] = [
  { key: 'infoFiles', icon: '📎', href: '/Info-files', label: { he: 'מסמכי מידע לסטודנטים', en: 'Student Info Files' } },
  { key: 'academicYear', icon: '🎓', href: '/AcademicYearManager', label: { he: 'ניהול שנת לימודים', en: 'Academic Year Management' } },
  { key: 'bulkPermissions', icon: '🛡️', href: '/BulkPermissionsManager', label: { he: 'הרשאות מרוכזות לפי תפקיד', en: 'Bulk Permissions by Role' } },
  { key: 'records', icon: '📜', href: '/admin/records', label: { he: 'רישומי פרויקטים', en: 'Project Records' } },
  { key: 'workflowTemplates', icon: '🧬', href: '/WorkflowTemplateManager', label: { he: 'תבניות תהליך', en: 'Process Templates' } },
];

export default function AdminMenuScreen() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';
  const [adminName, setAdminName] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    try {
      const profile = await apiClient.get('/api/users/profile');
      setAdminName(profile.data?.displayName || 'Admin');
      if (profile.data?.language) setLang(profile.data.language);
    } catch (e) {
      console.error('Admin menu: failed to load profile:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const renderSection = (title: { he: string; en: string }, items: MenuItem[]) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, isRtl && styles.textRight]}>{title[lang]}</Text>
      <View style={styles.card}>
        {items.map((item, i) => (
          <Pressable
            key={item.key}
            style={[styles.row, i > 0 && styles.rowDivider, isRtl && styles.rowReverse]}
            onPress={() => router.push(item.href as any)}
            accessibilityRole="button"
          >
            <View style={styles.rowIcon}>
              <Text style={{ fontSize: 18 }}>{item.icon}</Text>
            </View>
            <Text style={[styles.rowLabel, isRtl && styles.textRight]} numberOfLines={1}>
              {item.label[lang]}
            </Text>
            <Text style={styles.chevron}>{isRtl ? '‹' : '›'}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingRoot}>
        <ActivityIndicator size="large" color={C.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <TopBar
        name={adminName}
        role="system_admin"
        lang={lang}
        isRtl={isRtl}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {renderSection({ he: 'ניווט', en: 'Navigation' }, NAVIGATION_ITEMS)}
        {renderSection({ he: 'תוכן וניהול', en: 'Directories & Config' }, DIRECTORY_ITEMS)}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  loadingRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  scrollContent: { padding: 16, gap: 20 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: C.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.5 },
  textRight: { textAlign: 'right' },
  card: {
    backgroundColor: C.surfaceContainerLowest,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.outlineVariant,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  rowReverse: { flexDirection: 'row-reverse' },
  rowDivider: { borderTopWidth: 1, borderTopColor: C.surfaceContainer },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#d0e1fb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: C.onSurface },
  chevron: { fontSize: 18, color: C.secondary },
});
