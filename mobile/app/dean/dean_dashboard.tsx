// app/dean/dean_dashboard.tsx — mirrors
// app/division_head/division_head_dashboard.tsx. dean is the terminal
// sign-off on the Electrical Engineering research-proposal chain.

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../src/firebase/firebase';
import { TopBar } from '../../components/shared';
import type { Lang } from '../../components/i18n';
import { PendingSignoffsWidget } from '@/components/PendingSignoffsWidget';

export default function DeanDashboard() {
  const [lang, setLang] = useState<Lang>('he');

  return (
    <SafeAreaView style={s.root}>
      <TopBar
        name={auth.currentUser?.displayName ?? ''}
        role="dean"
        lang={lang}
        isRtl={lang === 'he'}
        onToggleLang={() => setLang((l) => (l === 'he' ? 'en' : 'he'))}
        showBack={false}
      />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.subtitle}>
          {lang === 'he' ? 'הצעות מחקר הממתינות לאישורך' : 'Research proposals awaiting your sign-off'}
        </Text>
        <PendingSignoffsWidget lang={lang} showEmptyState />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16 },
  subtitle: { fontSize: 13, color: '#64748B', marginBottom: 12 },
});
