// app/(auth)/biometricUnlock.tsx
//
// The actual unlock gate — reached only via _layout.tsx's routing effect,
// when a device has biometric login enabled and the current app session
// hasn't been unlocked yet (see src/auth/biometricAuth.ts's
// isSessionUnlocked). Auto-prompts Face ID/fingerprint on mount. Styled to
// match login.tsx (same palette/logo/card) rather than a disconnected
// generic screen, since this IS the login experience for a returning user —
// just substituting biometrics for retyping a password.
//
// Failure counting: a genuine failed match (not a user-cancelled prompt)
// counts toward a LOCAL, per-device 3-attempt counter (src/auth/
// biometricStorage.ts) — biometric match/no-match never leaves the device,
// so there's nothing for the server to verify about an individual attempt.
// Once that local counter hits 3, biometric is disabled on this device and
// the failure is reported ONCE to the server as a single strike in the same
// shared 3-strike pool login.tsx's wrong-password reporting uses — so
// exhausting biometric costs exactly as much as one wrong password guess,
// never more, and the user falls back to proving themselves with their
// actual password (with however many of the 3 total strikes remain).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { auth } from '@/src/firebase/firebase';
import { apiClient } from '@/src/api/apiClient';
import { useMaintenanceCheck } from '@/hooks/useMaintenanceCheck';
import { getHomeRoute } from '@/firebase/roles';
import {
  promptBiometricAuth, markSessionUnlocked,
} from '@/src/auth/biometricAuth';
import {
  recordBiometricFailure, resetBiometricFailures, setBiometricEnabled,
} from '@/src/auth/biometricStorage';

type Lang = 'he' | 'en';

// Same palette as login.tsx — this screen is meant to read as a continuation
// of it, not a visually distinct screen.
const colors = {
  paper: '#f7f6f2',
  surface: '#ffffff',
  ink: '#1c2333',
  muted: '#6b7280',
  line: '#e4e1d8',
  primary: '#1e3a5f',
  primaryInk: '#ffffff',
  dangerText: '#a8433a',
  dangerBg: '#f7e9e7',
};

export default function BiometricUnlock() {
  const router = useRouter();
  const checkMaintenance = useMaintenanceCheck();
  const [lang, setLang] = useState<Lang>('he');
  // 'prompting' covers both "native dialog is up" and "confirming the
  // result with the server" — one continuous spinner state, same as
  // login.tsx's own post-submit loading state, until there's something
  // definite to show the user.
  const [status, setStatus] = useState<'prompting' | 'retry' | 'locked_message'>('prompting');
  const [lockedMessage, setLockedMessage] = useState('');
  const isRtl = lang === 'he';

  const uid = auth.currentUser?.uid;
  // Guards against a double-fire of the mount effect (observed live: Firebase's
  // auth-state listener can emit more than once shortly after a cold start,
  // which — without this — triggered two concurrent native biometric prompts;
  // the second one is immediately rejected by the OS as "already in progress",
  // which read as an instant failure behind the real, still-open first prompt.
  const attemptInFlight = useRef(false);

  const proceedToHome = async () => {
    markSessionUnlocked();
    try {
      const res = await apiClient.get('/api/users/me');
      const role = res.data.role;
      const maintenance = await checkMaintenance(role);
      if (maintenance.blocked) {
        router.replace({
          pathname: '/maintenance',
          params: { title: maintenance.title, endsAt: maintenance.endsAt ?? '' },
        } as any);
        return;
      }
      router.replace(getHomeRoute(role) as any);
    } catch {
      // Couldn't resolve a role — fall back to the home-route logic in
      // _layout.tsx's own routing effect, which will re-run regardless.
      router.replace('/' as any);
    }
  };

  const fallBackToPassword = async () => {
    await signOut(auth).catch(() => {});
    router.replace('/(auth)/login' as any);
  };

  const handleAttempt = async () => {
    if (attemptInFlight.current) return;
    attemptInFlight.current = true;
    try {
      if (!uid) { await fallBackToPassword(); return; }
      setStatus('prompting');

      const result = await promptBiometricAuth(lang);

      if (result.success) {
        await resetBiometricFailures(uid);
        await proceedToHome();
        return;
      }

      if (!result.countsAsFailure) {
        // User backed out on purpose, or biometrics aren't available right
        // now — not a failed attempt, just offer the normal retry/fallback UI.
        setStatus('retry');
        return;
      }

      const { exhausted } = await recordBiometricFailure(uid);
      if (!exhausted) {
        setStatus('retry');
        return;
      }

      // 3 local failures — disable biometric on this device and report ONE
      // strike against the account's shared 3-strike pool.
      await setBiometricEnabled(uid, false);
      try {
        const res = await apiClient.post('/api/auth/biometric/report-exhausted');
        const { locked, remaining } = res.data as { locked: boolean; remaining: number };
        setLockedMessage(
          locked
            ? (lang === 'he'
                ? 'זיהוי ביומטרי בוטל. החשבון ננעל זמנית לבדיקת אבטחה — בדוק את הדוא"ל להמשך.'
                : 'Biometric login disabled. Your account is temporarily locked pending a security check — check your email for next steps.')
            : (lang === 'he'
                ? `זיהוי ביומטרי בוטל במכשיר זה. נותרו לך ${remaining} ניסיונות עם דוא"ל וסיסמה לפני נעילת החשבון.`
                : `Biometric login disabled on this device. You have ${remaining} attempts left with email and password before your account is locked.`)
        );
      } catch {
        setLockedMessage(
          lang === 'he'
            ? 'זיהוי ביומטרי בוטל במכשיר זה. השתמש בדוא"ל וסיסמה.'
            : 'Biometric login disabled on this device. Please use email and password.'
        );
      }
      setStatus('locked_message');
    } finally {
      attemptInFlight.current = false;
    }
  };

  useEffect(() => {
    handleAttempt();
    // Only on mount — re-attempts are user-triggered from here on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <View style={[styles.langRow, isRtl && styles.rowReverse]}>
        <TouchableOpacity
          style={styles.langBtn}
          onPress={() => setLang(lang === 'he' ? 'en' : 'he')}
          accessibilityRole="button"
          accessibilityLabel={lang === 'he' ? 'החלף שפה לאנגלית' : 'Switch language to Hebrew'}
        >
          <Text style={styles.langText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.headerBlock}>
        <Image
          source={require('../../assets/hit-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>{lang === 'he' ? 'ברוך שובך' : 'Welcome Back'}</Text>
      </View>

      <View style={styles.card}>
        {status === 'prompting' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.subtitle}>
              {lang === 'he' ? 'מאמת זהות...' : 'Verifying your identity...'}
            </Text>
          </View>
        )}

        {status === 'retry' && (
          <View style={styles.centered}>
            <Text style={styles.icon}>🔐</Text>
            <Text style={[styles.failTitle, isRtl && styles.textRight]}>
              {lang === 'he' ? 'האימות נכשל' : 'Verification failed'}
            </Text>
            <TouchableOpacity style={styles.button} onPress={handleAttempt} accessibilityRole="button">
              <Text style={styles.buttonText}>{lang === 'he' ? 'נסה שוב' : 'Try again'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={fallBackToPassword} accessibilityRole="button">
              <Text style={styles.link}>{lang === 'he' ? 'השתמש בדוא"ל וסיסמה' : 'Use email and password'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === 'locked_message' && (
          <View style={styles.centered}>
            <Text style={styles.icon}>⚠️</Text>
            <Text style={[styles.failTitle, isRtl && styles.textRight]}>
              {lang === 'he' ? 'זיהוי ביומטרי בוטל' : 'Biometric login disabled'}
            </Text>
            <Text style={[styles.message, isRtl && styles.textRight]}>{lockedMessage}</Text>
            <TouchableOpacity style={styles.button} onPress={fallBackToPassword} accessibilityRole="button">
              <Text style={styles.buttonText}>{lang === 'he' ? 'המשך לדוא"ל וסיסמה' : 'Continue with email and password'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.paper,
    padding: 20,
  },
  langRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  rowReverse: { flexDirection: 'row-reverse' },
  langBtn: {
    backgroundColor: colors.surface, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.line,
  },
  langText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  headerBlock: { alignItems: 'center', marginBottom: 24 },
  logo: { width: 64, height: 40, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '600', color: colors.ink, textAlign: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    padding: 24,
    minHeight: 180,
  },
  centered: { alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 44, marginBottom: 12 },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 16, textAlign: 'center' },
  failTitle: { fontSize: 17, fontWeight: '600', color: colors.ink, textAlign: 'center', marginBottom: 8 },
  message: { fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  textRight: { textAlign: 'right' },
  button: {
    backgroundColor: colors.primary, borderRadius: 8,
    paddingVertical: 12, paddingHorizontal: 28,
    marginTop: 16, alignSelf: 'stretch', alignItems: 'center',
  },
  buttonText: { color: colors.primaryInk, fontSize: 14, fontWeight: '600' },
  link: { color: colors.primary, fontSize: 13, marginTop: 16 },
});
