// components/ForceUpdateGate.tsx
//
// Blocks the whole app with an "update required" screen when this install's
// native build number is below the minimum the server publishes for its
// platform (GET /api/app-version — server/src/services/appVersion.ts; set by
// system_admin in the web admin panel's maintenance window).
//
// Mobile only by nature: the website always serves its latest build on load.
//
// Build number, not the "1.0.0" version string — EAS auto-increments the
// native build number on every store build, the version string doesn't
// change. Checked on launch and every time the app returns to the
// foreground. Fails open: if the check can't reach the server, or there is
// no minimum set, the app works normally — a server hiccup must never lock
// everyone out. Shown in Hebrew and English together, since it can appear
// before sign-in (no language chosen yet).

import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import * as Application from 'expo-application';
import { apiClient } from '../src/api/apiClient';

type Policy = { minBuild: number | null; storeUrl: string };

function installedBuild(): number | null {
  const n = Number(Application.nativeBuildVersion);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function ForceUpdateGate({ children }: { children: React.ReactNode }) {
  const [required, setRequired] = useState<Policy | null>(null);

  const check = useCallback(async () => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    const build = installedBuild();
    if (build === null) return; // dev client / Expo Go — nothing to compare
    try {
      const res = await apiClient.get<Record<'ios' | 'android', Policy>>('/api/app-version');
      const policy = res.data?.[Platform.OS];
      setRequired(policy?.minBuild && build < policy.minBuild ? policy : null);
    } catch {
      // Fail open — keep whatever we last knew (normally "not required").
    }
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  if (!required) return <>{children}</>;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.card} accessibilityRole="alert">
        <Text style={styles.icon} accessibilityElementsHidden>⬆️</Text>
        <Text style={styles.title}>נדרש עדכון לאפליקציה</Text>
        <Text style={styles.body}>
          הגרסה המותקנת אצלך כבר לא נתמכת. כדי להמשיך להשתמש באפליקציה, יש לעדכן אותה לגרסה האחרונה.
        </Text>
        <Text style={[styles.title, styles.en]}>App update required</Text>
        <Text style={[styles.body, styles.en]}>
          This version is no longer supported. Please update to the latest version to keep using the app.
        </Text>
        {required.storeUrl ? (
          <Pressable
            style={styles.button}
            onPress={() => Linking.openURL(required.storeUrl).catch(() => {})}
            accessibilityRole="button"
            accessibilityLabel="Update the app / עדכון האפליקציה"
          >
            <Text style={styles.buttonText}>עדכון האפליקציה · Update</Text>
          </Pressable>
        ) : (
          <Text style={styles.hint}>
            {Platform.OS === 'ios' ? 'עדכנו דרך ה-App Store · Update from the App Store' : 'עדכנו דרך Google Play · Update from Google Play'}
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F7FB', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#E3E6EF' },
  icon: { fontSize: 40, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#1B1F2A', textAlign: 'center', writingDirection: 'rtl' },
  body: { fontSize: 15, color: '#4A5163', textAlign: 'center', marginTop: 8, lineHeight: 22, writingDirection: 'rtl' },
  en: { writingDirection: 'ltr', marginTop: 16 },
  button: { marginTop: 24, backgroundColor: '#2E5BFF', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, alignSelf: 'stretch' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  hint: { marginTop: 24, fontSize: 14, color: '#4A5163', textAlign: 'center' },
});
