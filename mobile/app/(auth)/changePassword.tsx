// app/(auth)/changePassword.tsx
//
// Forced first-login password change for accounts created via Excel import
// (users or staff) — see mustChangePassword flag set by
// createImportedUserAccount in server/src/services/userImportExport.ts.
// Also reachable for a voluntary password change later if needed.

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { apiClient } from '../../src/api/apiClient';
import { auth, db } from '@/src/firebase/firebase';
import { useMaintenanceCheck } from '@/hooks/useMaintenanceCheck';
import { getHomeRoute } from '@/firebase/roles'; // ← single source of truth (covers all roles)
import type { Lang } from '../../components/i18n';
import { ChangePasswordStyles } from '../../constants/styles';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('he');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const checkMaintenance = useMaintenanceCheck();
  const isRtl = lang === 'he';

  const t = {
    title:       isRtl ? 'קביעת סיסמה חדשה'                                                         : 'Set a New Password',
    subtitle:    isRtl ? 'החשבון שלך נוצר עם סיסמה זמנית. יש לבחור סיסמה חדשה כדי להמשיך.'            : 'Your account was created with a temporary password. Choose a new password to continue.',
    newPass:     isRtl ? 'סיסמה חדשה'                                                                : 'New password',
    rules:       isRtl ? '8+ תווים, כולל אות גדולה, אות קטנה, ספרה וסימן (12+ למנהלי מערכת). לא ניתן להשתמש בסיסמה הזמנית שקיבלת.'
                       : "8+ characters with an uppercase letter, lowercase letter, digit, and symbol (12+ for system admins). Can't be the same as your temporary password.",
    confirmPass: isRtl ? 'אימות סיסמה חדשה'                                                          : 'Confirm new password',
    save:        isRtl ? 'שמור והמשך'                                                                : 'Save & Continue',
    signOut:     isRtl ? 'התנתק במקום'                                                               : 'Sign out instead',
    errMinLen:   isRtl ? 'הסיסמה חייבת להכיל לפחות 8 תווים.'                                         : 'Password must be at least 8 characters.',
    errComplex:  isRtl ? 'הסיסמה חייבת לכלול אות גדולה, אות קטנה, ספרה וסימן.'                       : 'Password must include an uppercase letter, a lowercase letter, a digit, and a symbol.',
    errMatch:    isRtl ? 'הסיסמאות אינן תואמות.'                                                      : 'Passwords do not match.',
    errSession:  isRtl ? 'החיבור שלך פג. אנא התחבר מחדש כדי לשנות את הסיסמה.'                         : 'Your session has expired. Please log in again to change your password.',
    errGeneric:  isRtl ? 'שינוי הסיסמה נכשל. אנא נסה שוב.'                                            : 'Failed to change password. Please try again.',
  };

  const handleSubmit = async () => {
    setError('');

    // Guards against the exact bug a tester hit: sitting on this screen
    // with no live Firebase session (e.g. after "Sign out instead", or a
    // session that expired while this screen was open) and typing into the
    // form anyway. Without this check apiClient silently sends the request
    // with no Authorization header at all, and the server's generic 401
    // ("Missing or malformed authorization token") surfaces here looking
    // like a password-validation failure instead of what it actually is.
    if (!auth.currentUser) {
      setError(t.errSession);
      return;
    }

    // Baseline client-side check (8+ chars, upper/lower/digit/symbol) — the
    // server is authoritative and enforces the stricter 12-character
    // system_admin policy plus "not the same as your temporary password",
    // surfaced via the catch block below.
    if (newPassword.length < 8) {
      setError(t.errMinLen);
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      setError(t.errComplex);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t.errMatch);
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/api/users/change-password', { newPassword });

      const uid     = auth.currentUser?.uid;
      const userDoc = uid ? await getDoc(doc(db, 'users', uid)) : null;
      const role    = userDoc?.data()?.role ?? '';

      const maintenance = await checkMaintenance(role);
      if (maintenance.blocked) {
        router.replace({
          pathname: '/maintenance',
          params: { title: maintenance.title, endsAt: maintenance.endsAt ?? '' },
        } as any);
        return;
      }

      router.replace(getHomeRoute(role as any) as any);
    } catch (e: any) {
      if (e.response?.status === 401) {
        setError(t.errSession);
      } else {
        setError(e.response?.data?.error || t.errGeneric);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    // Previously this awaited signOut() with no try/catch and no loading
    // guard, then unconditionally called router.replace — if signOut ever
    // rejected (flaky network, RN AsyncStorage persistence hiccup), the
    // replace() never ran and the user was left stuck on this exact screen
    // looking like the button did nothing. The navigation now always runs.
    setSigningOut(true);
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Sign out failed, navigating to login anyway:', e);
    } finally {
      setSigningOut(false);
      router.replace('/(auth)/login' as any);
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

      <Text style={styles.title}>{t.title}</Text>
      <Text style={[styles.subtitle, isRtl && styles.textRight]}>{t.subtitle}</Text>

      <TextInput
        style={[styles.input, isRtl && styles.textRight]}
        placeholder={t.newPass}
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
        autoFocus
        accessibilityLabel={t.newPass}
      />
      <Text style={[styles.subtitle, isRtl && styles.textRight]}>{t.rules}</Text>

      <TextInput
        style={[styles.input, isRtl && styles.textRight]}
        placeholder={t.confirmPass}
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        accessibilityLabel={t.confirmPass}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
        accessibilityRole="button"
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>{t.save}</Text>
        }
      </TouchableOpacity>

      <Pressable onPress={handleSignOut} disabled={signingOut} accessibilityRole="button">
        {signingOut
          ? <ActivityIndicator color="#2E86FF" />
          : <Text style={styles.backLink}>{t.signOut}</Text>
        }
      </Pressable>
    </View>
  );
}

const styles = ChangePasswordStyles;
