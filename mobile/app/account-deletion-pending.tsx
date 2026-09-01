// app/account-deletion-pending.tsx
// Shown instead of the normal role home for the duration of the account-
// deletion grace period (see server/src/services/accountDeletion.ts).
// Reachable regardless of role — mobile/app/(tabs)/_layout.tsx redirects here
// for ANY role whenever the profile fetch returns pendingDeletion: true.

import React, { useEffect, useState } from 'react';
import {
  View, Text, Pressable, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { auth } from '@/src/firebase/firebase';
import { apiClient } from '@/src/api/apiClient';
import type { Lang } from '@/components/i18n';
import { AccountDeletionPendingStyles } from '../constants/styles';

const ROLE_ROUTES: Record<string, string> = {
  student:       '/student/home',
  supervisor:    '/supervisor/home',
  coordinator:   '/coordinator/home',
  examiner:      '/examinor/home',
  faculty_admin: '/faculty_admin/dashboard',
  system_admin:  '/admin/overview',
};

export default function AccountDeletionPending() {
  const router = useRouter();
  const [lang] = useState<Lang>('he');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deletionReason, setDeletionReason] = useState<'self_requested' | 'graduated' | null>(null);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const isRtl = lang === 'he';

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get('/api/users/profile');
        setDeletionReason(res.data?.deletionReason ?? null);
        const scheduled = res.data?.deletionScheduledFor;
        // Firestore Timestamp arrives as { _seconds, _nanoseconds } via the JSON API.
        if (scheduled?._seconds) {
          setScheduledFor(new Date(scheduled._seconds * 1000).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US'));
        }
      } catch (err) {
        console.error('Failed to load account deletion status:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCancel = async () => {
    setBusy(true);
    try {
      await apiClient.post('/api/users/delete-account/cancel');
      const res = await apiClient.get('/api/users/profile');
      const role = res.data?.role ?? 'student';
      router.replace((ROLE_ROUTES[role] ?? '/student/home') as any);
    } catch (err) {
      console.error('Failed to cancel account deletion:', err);
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'ביטול המחיקה נכשל. נסה שוב.' : 'Failed to cancel deletion. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/(auth)/login' as any);
  };

  if (loading) {
    return (
      <SafeAreaView style={s.centered}>
        <ActivityIndicator size="large" color="#EF4444" />
      </SafeAreaView>
    );
  }

  const graduated = deletionReason === 'graduated';

  return (
    <SafeAreaView style={s.root}>
      <View style={s.card}>
        <Text style={s.emoji}>🗑️</Text>
        <Text style={[s.title, isRtl && s.textRight]}>
          {lang === 'he' ? 'החשבון שלך מיועד למחיקה' : 'Your account is scheduled for deletion'}
        </Text>

        <Text style={[s.body, isRtl && s.textRight]}>
          {graduated
            ? (lang === 'he'
                ? 'לפי הרישומים שלנו סיימת את משך הלימודים הצפוי של התוכנית שלך.'
                : "Our records show you've completed your program's expected duration.")
            : (lang === 'he'
                ? 'ביקשת למחוק את החשבון שלך.'
                : 'You requested to delete your account.')}
        </Text>

        {scheduledFor && (
          <Text style={[s.date, isRtl && s.textRight]}>
            {lang === 'he'
              ? `החשבון יימחק לצמיתות בתאריך ${scheduledFor}, אלא אם תבטל.`
              : `Your account will be permanently deleted on ${scheduledFor} unless you cancel.`}
          </Text>
        )}

        <Pressable
          style={[s.cancelBtn, busy && s.btnDisabled]}
          onPress={handleCancel}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
        >
          {busy
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.cancelBtnText}>{lang === 'he' ? 'בטל את המחיקה' : 'Cancel Deletion'}</Text>
          }
        </Pressable>

        <Pressable
          style={s.signOutBtn}
          onPress={handleSignOut}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
        >
          <Text style={s.signOutText}>{lang === 'he' ? 'יציאה' : 'Sign Out'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = AccountDeletionPendingStyles;
