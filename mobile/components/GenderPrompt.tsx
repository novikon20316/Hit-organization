// components/GenderPrompt.tsx
//
// One-time prompt for students whose profile has no gender yet (everyone
// who signed up before signup asked for it) — used for gendered wording on
// official forms ("מר"/"גברת" on the thesis examiner's form). Mobile port of
// web/app/student/home/GenderPrompt.tsx; disappears once answered.

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { apiClient } from '@/src/api/apiClient';
import { ap } from '@/constants/theme';
import type { Lang } from './i18n';

export function GenderPrompt({ lang, isRtl }: { lang: Lang; isRtl: boolean }) {
  const he = lang === 'he';
  const [needed, setNeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiClient.get('/api/users/me')
      .then((res) => {
        const user = res.data?.user ?? res.data;
        if (!cancelled) setNeeded(user?.role === 'student' && user?.gender !== 'male' && user?.gender !== 'female');
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  if (!needed) return null;

  const save = async (gender: 'male' | 'female') => {
    setBusy(true);
    setError('');
    try {
      await apiClient.post('/api/users/me/gender', { gender });
      setNeeded(false);
    } catch (err: any) {
      setError(err?.response?.data?.message || (he ? 'השמירה נכשלה' : 'Failed to save'));
    } finally {
      setBusy(false);
    }
  };

  const align = isRtl ? 'right' : 'left';
  return (
    <View style={{ margin: 16, marginBottom: 0, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: ap.outlineVariant, backgroundColor: '#fff' }} accessibilityLabel={he ? 'השלמת פרטים' : 'Complete your details'}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: ap.onSurface, textAlign: align }}>{he ? 'השלמת פרטים: מגדר' : 'Complete your details: gender'}</Text>
      <Text style={{ marginTop: 4, fontSize: 12, color: ap.onSurfaceVariant, textAlign: align }}>{he ? 'משמש לפנייה נכונה בטפסים רשמיים (למשל "מר" / "גברת").' : 'Used for correct wording on official forms (e.g. "Mr." / "Ms.").'}</Text>
      <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', gap: 8, marginTop: 10 }}>
        {(['male', 'female'] as const).map((g) => (
          <Pressable key={g} disabled={busy} onPress={() => save(g)} accessibilityRole="button" style={{ flex: 1, borderWidth: 1, borderColor: ap.outlineVariant, borderRadius: 8, paddingVertical: 10, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
            <Text style={{ fontSize: 14, color: ap.onSurface }}>{g === 'male' ? (he ? 'זכר' : 'Male') : (he ? 'נקבה' : 'Female')}</Text>
          </Pressable>
        ))}
      </View>
      {!!error && <Text style={{ marginTop: 6, fontSize: 12, color: ap.error, textAlign: align }} accessibilityRole="alert">{error}</Text>}
    </View>
  );
}
