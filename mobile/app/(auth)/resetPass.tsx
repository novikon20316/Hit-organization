import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';
import { ResetPassStyles } from '../../constants/styles';

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = ResetPassStyles;

// ─── Screen ───────────────────────────────────────────────────────────────────
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
      await sendPasswordResetEmail(auth, email.trim());
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
    <SafeAreaView style={s.root}>
      <View style={s.content}>

        {/* Lang toggle */}
        <View style={[s.langRow, isRtl && s.langRowRtl]}>
          <Pressable style={s.langBtn} onPress={() => setLang(lang === 'he' ? 'en' : 'he')}>
            <Text style={s.langText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
          </Pressable>
        </View>

        {/* Hero */}
        <View style={s.hero}>
          <Text style={s.heroEmoji}>🔐</Text>
          <Text style={s.heroTitle}>{t.title}</Text>
          <Text style={s.heroSub}>{t.sub}</Text>
        </View>

        {/* Success banner */}
        {sent && (
          <View style={s.successBox}>
            <Text style={s.successEmoji}>✅</Text>
            <Text style={s.successTitle}>{t.successTitle}</Text>
            <Text style={s.successSub}>{t.successSub}</Text>
          </View>
        )}

        {/* Email input — hide after sent */}
        {!sent && (
          <>
            <TextInput
              style={[
                s.input,
                focused   && s.inputFocused,
                showError && s.inputError,
                isValidEmail && email.length > 0 && s.inputSuccess,
                isRtl && { textAlign: 'right' },
              ]}
              placeholder={t.placeholder}
              placeholderTextColor="#9BA8C0"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              editable={!loading}
            />

            {showError && (
              <Text style={[s.errorText, isRtl && s.errorTextRtl]}>
                {t.emailErr}
              </Text>
            )}

            <Pressable
              style={[s.btn, (!isValidEmail || loading) && s.btnDisabled]}
              onPress={handleSend}
              disabled={!isValidEmail || loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>{t.btnSend}</Text>
              }
            </Pressable>
          </>
        )}

        {/* Back to login */}
        <Pressable style={s.backBtn} onPress={() => router.replace('/(auth)/login')}>
          <Text style={s.backText}>{t.back}</Text>
        </Pressable>

      </View>
    </SafeAreaView>
  );
}