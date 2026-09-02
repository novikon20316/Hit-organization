// app/student/awaitingGrade.tsx
//
// Shown by app/student/home.tsx when studentState === 'awaiting_grade' — a
// coordinator_gated masters computer_science student whose grade average
// hasn't been entered yet by a program_head/administrative coordinator (see
// server's config/studentTrack.ts). Not a standalone route: rendered as a
// sub-screen inside home.tsx's SafeAreaView + top bar, same as info.tsx.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Lang } from '../../components/i18n';
import { ap } from '@/constants/theme';

interface Props {
  lang: Lang;
  isRtl: boolean;
}

export default function AwaitingGradeScreen({ lang, isRtl }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.icon}>⏳</Text>
      <Text style={[styles.title, isRtl && styles.textRight]}>
        {lang === 'he' ? 'עוד לא הוזן לך ממוצע' : "Your average grade hasn't been entered yet."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Amber "awaiting" notice — left as-is, not migrated to `ap`: matches the
  // same semantic amber used for the "awaiting approval" state on the web
  // dashboard (web/app/student/home/ActiveDashboard.tsx's bg-[#FBF3E3]
  // badge), not plain chrome.
  card: { margin: 16, padding: 20, borderRadius: 12, backgroundColor: '#FBF3E3', borderWidth: 1, borderColor: '#E8D5A8' },
  icon: { fontSize: 24, marginBottom: 8 },
  title: { fontSize: 15, fontWeight: '700', color: ap.onSurface },
  textRight: { textAlign: 'right' },
});
