// components/FinalReportCard.tsx
// Shown on the student home once their final grade is approved — opens the
// view-only final report (web app/final-report/page.tsx) in the browser,
// where it can be printed. Same link the student got by email; renders
// nothing until one exists. See server/src/services/finalReport.ts.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import { apiClient } from '@/src/api/apiClient';
import { ap, apRadius } from '@/constants/theme';
import type { Lang } from './i18n';

interface FinalReportLinkInfo {
  link: string;
  projectId: string;
  projectTitleHe: string;
  projectTitleEn: string;
}

export function FinalReportCard({ lang, isRtl }: { lang: Lang; isRtl: boolean }) {
  const [links, setLinks] = useState<FinalReportLinkInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiClient.get('/api/student/final-report-links')
      .then((res) => { if (!cancelled) setLinks(res.data?.links ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (links.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {links.map((l) => (
        <View key={l.link} style={[styles.card, isRtl && styles.rowReverse]}>
          <View style={styles.textCol}>
            <Text style={[styles.title, isRtl && styles.textRight]}>
              🎓 {lang === 'he' ? 'הדוח המסכם שלך מוכן' : 'Your final report is ready'}
            </Text>
            <Text style={[styles.subtitle, isRtl && styles.textRight]} numberOfLines={2}>
              {lang === 'he' ? l.projectTitleHe || l.projectTitleEn : l.projectTitleEn || l.projectTitleHe}
            </Text>
          </View>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={lang === 'he' ? 'פתיחת הדוח המסכם לצפייה והדפסה' : 'Open the final report to view and print'}
            onPress={() => { Linking.openURL(l.link).catch(() => {}); }}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Text style={styles.buttonText}>{lang === 'he' ? 'צפייה והדפסה' : 'View & print'}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: apRadius.lg, borderWidth: 1,
    borderColor: ap.primary, backgroundColor: ap.surfaceContainerLow,
  },
  rowReverse: { flexDirection: 'row-reverse' },
  textCol: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: ap.onSurface },
  subtitle: { marginTop: 2, fontSize: 13, color: ap.onSurfaceVariant },
  textRight: { textAlign: 'right' },
  button: { backgroundColor: ap.primary, borderRadius: apRadius.lg, paddingHorizontal: 14, paddingVertical: 10 },
  pressed: { opacity: 0.85 },
  buttonText: { color: ap.onPrimary, fontSize: 13, fontWeight: '700' },
});
