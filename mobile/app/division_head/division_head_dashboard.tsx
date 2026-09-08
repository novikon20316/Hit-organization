// app/division_head/division_head_dashboard.tsx
// Dashboard for ראש תחום (Head of Division) — deliberately minimal, since
// this role's only job today is signing off on the "Head of Division" stage
// of the Electrical Engineering research-proposal chain (see
// server/src/scripts's workflow-template seed script). Mirrors
// app/program_head/program_head_dashboard.tsx's shell (SafeAreaView + TopBar)
// but skips its bespoke tabs/data-fetching entirely — the generic
// PendingSignoffsWidget (server/src/services/pendingSignoffs.ts's
// 'chain_stage' item type) is the whole screen.

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../src/firebase/firebase';
import { TopBar } from '../../components/shared';
import type { Lang } from '../../components/i18n';
import { PendingSignoffsWidget } from '@/components/PendingSignoffsWidget';

export default function DivisionHeadDashboard() {
  const [lang, setLang] = useState<Lang>('he');

  return (
    <SafeAreaView style={s.root}>
      <TopBar
        name={auth.currentUser?.displayName ?? ''}
        role="division_head"
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
