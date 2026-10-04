// app/(auth)/biometricUnlock.tsx
//
// The actual unlock gate — reached only via _layout.tsx's routing effect,
// when a device has biometric login enabled and the current app session
// hasn't been unlocked yet (see src/auth/biometricAuth.ts's
// isSessionUnlocked). Auto-prompts Face ID/fingerprint on mount.
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
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
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

export default function BiometricUnlock() {
  const router = useRouter();
  const checkMaintenance = useMaintenanceCheck();
  const [lang, setLang] = useState<Lang>('he');
  const [status, setStatus] = useState<'prompting' | 'retry' | 'locked_message'>('prompting');
  const [lockedMessage, setLockedMessage] = useState('');
  const isRtl = lang === 'he';

  const uid = auth.currentUser?.uid;

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
  };

  useEffect(() => {
    handleAttempt();
    // Only on mount — re-attempts are user-triggered from here on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.langBtn}
        onPress={() => setLang(lang === 'he' ? 'en' : 'he')}
        accessibilityRole="button"
      >
        <Text style={styles.langText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
      </TouchableOpacity>

      <Text style={styles.icon}>🔐</Text>

      {status === 'prompting' && (
        <>
          <Text style={styles.title}>
            {lang === 'he' ? 'מאמת זהות...' : 'Verifying your identity...'}
          </Text>
          <ActivityIndicator size="large" color="#2E86FF" style={{ marginTop: 16 }} />
        </>
      )}

      {status === 'retry' && (
        <>
          <Text style={styles.title}>
            {lang === 'he' ? 'האימות נכשל' : 'Verification failed'}
          </Text>
          <TouchableOpacity style={styles.button} onPress={handleAttempt} accessibilityRole="button">
            <Text style={styles.buttonText}>{lang === 'he' ? 'נסה שוב' : 'Try again'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={fallBackToPassword} accessibilityRole="button">
            <Text style={styles.link}>{lang === 'he' ? 'השתמש בדוא"ל וסיסמה' : 'Use email and password'}</Text>
          </TouchableOpacity>
        </>
      )}

      {status === 'locked_message' && (
        <>
          <Text style={[styles.title, isRtl && styles.textRight]}>
            {lang === 'he' ? '⚠️ זיהוי ביומטרי בוטל' : '⚠️ Biometric login disabled'}
          </Text>
          <Text style={[styles.message, isRtl && styles.textRight]}>{lockedMessage}</Text>
          <TouchableOpacity style={styles.button} onPress={fallBackToPassword} accessibilityRole="button">
            <Text style={styles.buttonText}>{lang === 'he' ? 'המשך לדוא"ל וסיסמה' : 'Continue with email and password'}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f7f6f2',
    padding: 24,
  },
  langBtn: {
    position: 'absolute', top: 56, right: 20,
    backgroundColor: '#ffffff', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#e4e1d8',
  },
  langText: { fontSize: 12, fontWeight: '700', color: '#1e3a5f' },
  icon: { fontSize: 56, marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '600', color: '#1c2333', textAlign: 'center', marginBottom: 8 },
  message: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  textRight: { textAlign: 'right' },
  button: {
    backgroundColor: '#1e3a5f', borderRadius: 8,
    paddingVertical: 12, paddingHorizontal: 28,
    marginTop: 16,
  },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  link: { color: '#1e3a5f', fontSize: 13, marginTop: 16 },
});
