// app/(auth)/resetPass.tsx
// Restyled to match web's app/(auth)/reset-password/page.tsx design (same
// paper/surface/ink palette, role-rail card holding both the form and the
// success state) — the Firebase call and security posture (auth/user-not-
// found still shows success) are unchanged.
import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable,
  ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';

// Same tokens as web's app/globals.css (--paper/--surface/--ink/--muted/
// --line/--primary/--danger*) — kept local to this screen since mobile's
// dashboards draw from a separate palette (constants/theme.ts's `ap`/
// `palette`), and this screen exists purely to visually match web's.
const colors = {
  paper: '#f7f6f2',
  surface: '#ffffff',
  ink: '#1c2333',
  muted: '#6b7280',
  line: '#e4e1d8',
  primary: '#1e3a5f',
  primaryInk: '#ffffff',
  danger: '#a8433a',
  dangerBg: '#f7e9e7',
};

// Without this, the reset-password email link opens Firebase's own default
// hosted page (only enforces Firebase Auth's 6-character minimum, none of
// this app's complexity rules) instead of the web app's own validated
// confirm page (web/app/(auth)/reset-password/confirm/page.tsx). The link is
// always opened in a browser regardless of which platform requested it, so
// this must point at the deployed WEB app's own URL — not this repo's
// backend API URL. TODO: set this to the real deployed web app origin (e.g.
// "https://<your-web-app>.onrender.com") once known; left blank rather than
// guessed, since a wrong guess would silently send users to a broken link.
const WEB_APP_BASE_URL = '';

export default function ResetPassword() {
  const router = useRouter();
  const [lang,      setLang]      = useState<Lang>('he');
  const [email,     setEmail]     = useState('');
  const [focused,   setFocused]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [sent,      setSent]      = useState(false);
  const [countdown, setCountdown] = useState(5);

  const isRtl       = lang === 'he';
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const showError   = email.length > 0 && !isValidEmail;

  const t = {
    title:       isRtl ? 'איפוס סיסמה'                              : 'Reset Password',
    sub:         isRtl ? 'הזן את כתובת האימייל שלך ונשלח לך קישור לאיפוס הסיסמה.'
                       : 'Enter your email address and we\'ll send you a link to reset your password.',
    placeholder: isRtl ? 'כתובת אימייל'                             : 'Email Address',
    emailErr:    isRtl ? 'כתובת אימייל אינה תקינה'                  : 'Please enter a valid email address',
    btnSend:     isRtl ? 'שלח קישור לאיפוס'                         : 'Send Reset Link',
    back:        isRtl ? '← חזרה להתחברות'                          : '← Back to Login',
    successTitle:isRtl ? 'הקישור נשלח!'                             : 'Link Sent!',
    successSub:  isRtl ? `בדוק את תיבת הדואר שלך עבור ${email}.\nתועבר חזרה תוך ${countdown} שניות...`
                       : `Check your inbox for ${email}.\nRedirecting in ${countdown}s...`,
    sending:     isRtl ? 'שולח...'                                  : 'Sending...',
  };

  const startCountdown = () => {
    let secs = 5;
    const interval = setInterval(() => {
      secs -= 1;
      setCountdown(secs);
      if (secs <= 0) {
        clearInterval(interval);
        router.replace('/(auth)/login');
      }
    }, 1000);
  };

  const handleSend = async () => {
    if (!isValidEmail) return;
    setLoading(true);
    try {
      await sendPasswordResetEmail(
        auth,
        email.trim(),
        WEB_APP_BASE_URL ? { url: `${WEB_APP_BASE_URL}/reset-password/confirm`, handleCodeInApp: true } : undefined,
      );
      setSent(true);
      startCountdown();
    } catch (e: any) {
      // Firebase returns auth/user-not-found but for security
      // we still show the success state so we don't leak whether
      // the email exists in our system.
      if (e.code === 'auth/user-not-found') {
        setSent(true);
        startCountdown();
      } else {
        Alert.alert(
          isRtl ? 'שגיאה' : 'Error',
          isRtl ? 'משהו השתבש. אנא נסה שוב.' : 'Something went wrong. Please try again.',
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>

        <View style={[styles.langRow, isRtl && styles.rowReverse]}>
          <Pressable
            style={styles.langBtn}
            onPress={() => setLang(lang === 'he' ? 'en' : 'he')}
            accessibilityRole="button"
            accessibilityLabel={lang === 'he' ? 'החלף שפה לאנגלית' : 'Switch language to Hebrew'}
          >
            <Text style={styles.langText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>🔐</Text>
          <Text style={styles.title}>{t.title}</Text>
          <Text style={styles.subtitle}>{t.sub}</Text>
        </View>

        <View style={styles.card}>
          {sent ? (
            <View style={styles.successWrap}>
              <Text style={styles.successEmoji}>✅</Text>
              <Text style={styles.successTitle}>{t.successTitle}</Text>
              <Text style={styles.successSub}>{t.successSub}</Text>
            </View>
          ) : (
            <>
              <TextInput
                style={[
                  styles.input,
                  styles.ltrInput,
                  focused && styles.inputFocused,
                  showError && styles.inputError,
                ]}
                placeholder={t.placeholder}
                placeholderTextColor={colors.muted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                editable={!loading}
                accessibilityLabel={t.placeholder}
              />

              {showError && (
                <Text style={[styles.errorText, isRtl && styles.textRight]}>
                  {t.emailErr}
                </Text>
              )}

              <Pressable
                style={[styles.button, (!isValidEmail || loading) && styles.buttonDisabled]}
                onPress={handleSend}
                disabled={!isValidEmail || loading}
                accessibilityRole="button"
              >
                {loading
                  ? <ActivityIndicator color={colors.primaryInk} />
                  : <Text style={styles.buttonText}>{t.btnSend}</Text>
                }
              </Pressable>
            </>
          )}
        </View>

        <Pressable style={styles.backLink} onPress={() => router.replace('/(auth)/login')} accessibilityRole="link">
          <Text style={styles.backLinkText}>{t.back}</Text>
        </Pressable>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { flex: 1, padding: 20, justifyContent: 'center' },

  langRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  langBtn: {
    backgroundColor: colors.surface, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.line,
  },
  langText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  hero: { alignItems: 'center', marginBottom: 20 },
  heroEmoji: { fontSize: 32, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '600', color: colors.ink, textAlign: 'center' },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 4, textAlign: 'center' },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    padding: 20,
  },

  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
  },
  ltrInput: { textAlign: 'left', writingDirection: 'ltr' },
  inputFocused: { borderColor: colors.primary, backgroundColor: colors.surface },
  inputError: { borderColor: colors.danger },

  errorText: { color: colors.danger, fontSize: 12, marginTop: 6 },

  button: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
  buttonText: { color: colors.primaryInk, fontSize: 14, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },

  successWrap: { alignItems: 'center' },
  successEmoji: { fontSize: 24, marginBottom: 6 },
  successTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  successSub: { fontSize: 13, color: colors.muted, marginTop: 4, textAlign: 'center', lineHeight: 19 },

  backLink: { marginTop: 16, alignItems: 'center' },
  backLinkText: { color: colors.primary, fontSize: 13 },

  rowReverse: { flexDirection: 'row-reverse' },
  textRight: { textAlign: 'right' },
});
