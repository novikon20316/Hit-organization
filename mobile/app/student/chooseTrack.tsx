// app/student/chooseTrack.tsx
//
// Mandatory thesis-vs-project decision for a coordinator_gated masters
// computer_science student whose grade average qualified them for the
// thesis track (see server's config/studentTrack.ts,
// THESIS_ELIGIBILITY_THRESHOLD). Reached only via app/_layout.tsx's
// pendingTrackChoice redirect — same "cannot escape" shape as
// (auth)/changePassword.tsx, deliberately with no close/back affordance.
// The redirect re-fires on every navigation and app reopen until
// trackLocked flips true, so there's no way to dismiss this without
// deciding.

import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { apiClient } from '../../src/api/apiClient';
import { getHomeRoute } from '@/firebase/roles';
import type { Lang } from '../../components/i18n';
import { ChangePasswordStyles } from '../../constants/styles';
import { ap } from '@/constants/theme';

export default function ChooseTrackScreen() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';
  const [choosing, setChoosing] = useState<'thesis' | 'project' | null>(null);
  const [error, setError] = useState('');

  const handleChoose = async (track: 'thesis' | 'project') => {
    setChoosing(track);
    setError('');
    try {
      await apiClient.post('/api/student/track/choose', { track });
      router.replace(getHomeRoute('student') as any);
    } catch (e: any) {
      const body = e?.response?.data;
      setError((lang === 'he' ? body?.messageHe : body?.message) || (isRtl ? 'משהו השתבש. אנא נסה/י שוב.' : 'Something went wrong. Please try again.'));
      setChoosing(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.langRow}>
        <Pressable
          style={styles.langBtn}
          onPress={() => setLang(lang === 'he' ? 'en' : 'he')}
          accessibilityRole="button"
          accessibilityLabel={lang === 'he' ? 'החלף שפה לאנגלית' : 'Switch language to Hebrew'}
        >
          <Text style={styles.langBtnText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>{lang === 'he' ? 'הממוצע שלך גבוה מאוד! 🎉' : 'Your average is exceptionally high! 🎉'}</Text>
      <Text style={[styles.subtitle, isRtl && styles.textRight]}>
        {lang === 'he'
          ? 'עליך לבחור באיזה מסלול להמשיך – תזה או פרויקט גמר. לא ניתן לדחות את הבחירה.'
          : "You must choose which track to continue on — thesis or final project. This choice can't be postponed."}
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, choosing !== null && styles.buttonDisabled]}
        onPress={() => handleChoose('thesis')}
        disabled={choosing !== null}
        accessibilityRole="button"
      >
        {choosing === 'thesis' ? <ActivityIndicator color={ap.onPrimary} /> : <Text style={styles.buttonText}>{lang === 'he' ? 'תזה' : 'Thesis'}</Text>}
      </Pressable>

      <Pressable
        style={[styles.button, choosing !== null && styles.buttonDisabled]}
        onPress={() => handleChoose('project')}
        disabled={choosing !== null}
        accessibilityRole="button"
      >
        {choosing === 'project' ? <ActivityIndicator color={ap.onPrimary} /> : <Text style={styles.buttonText}>{lang === 'he' ? 'פרויקט גמר' : 'Final Project'}</Text>}
      </Pressable>
    </View>
  );
}

// NOTE: ChangePasswordStyles' own colors (button/input/langToggle chrome)
// are left unmigrated here — it's a shared cross-role style block also used
// by app/(auth)/changePassword.tsx, outside this student-only AP pass.
const styles = ChangePasswordStyles;
