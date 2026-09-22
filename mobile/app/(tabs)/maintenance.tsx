// app/maintenance.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { auth } from '@/src/firebase/firebase';
import { apiClient } from '@/src/api/apiClient';
import { MaintenanceStatus } from '@/hooks/useMaintenanceCheck';
import { MaintenanceScreenStyles } from '../../constants/styles';

type Lang = 'he' | 'en';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function msToCountdown(ms: number): { h: string; m: string; s: string } {
  if (ms <= 0) return { h: '00', m: '00', s: '00' };
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { h: pad(h), m: pad(m), s: pad(s) };
}

function formatEndsAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      weekday: 'short',
      month:   'short',
      day:     'numeric',
      hour:    '2-digit',
      minute:  '2-digit',
    });
  } catch {
    return iso;
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MaintenanceScreen() {
  const router = useRouter();

  // The layout passes these as search params when redirecting here
  const params = useLocalSearchParams<{ title?: string; endsAt?: string }>();

  // Defaults to Hebrew, matching the rest of this app's convention (e.g.
  // administrative_coordinator_dashboard.tsx's own local lang state) — a
  // toggle lets a student who doesn't read Hebrew switch to English. This
  // is a per-screen toggle, not the app's persisted language setting, same
  // as other screens here.
  const [lang, setLang] = useState<Lang>('he');
  const isHe = lang === 'he';

  const [title,  setTitle]  = useState(params.title  ?? (isHe ? 'תחזוקה מתוכננת' : 'Scheduled maintenance'));
  const [endsAt, setEndsAt] = useState<string | null>(params.endsAt ?? null);
  const [msLeft, setMsLeft] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  // ── Countdown tick ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!endsAt) return;
    const target = new Date(endsAt).getTime();

    const tick = () => setMsLeft(Math.max(0, target - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  // ── Poll the status endpoint so the screen auto-releases when done ────────
  const pollStatus = useCallback(async () => {
    try {
      setChecking(true);
      const res = await apiClient.get<MaintenanceStatus>(
        '/api/system/maintenance-status',
        { params: { platform: 'mobile' } },
      );
      const { isActive, title: newTitle, endsAt: newEndsAt } = res.data;

      if (!isActive) {
        // Maintenance ended — go back to login so _layout re-evaluates role
        router.replace('/(auth)/login');
        return;
      }

      // Refresh displayed values in case an admin updated them
      if (newTitle)  setTitle(newTitle);
      if (newEndsAt) setEndsAt(newEndsAt);
    } catch {
      // Silent — keep showing the screen
    } finally {
      setChecking(false);
    }
  }, [router]);

  // Poll every 60 seconds automatically
  useEffect(() => {
    const id = setInterval(pollStatus, 60_000);
    return () => clearInterval(id);
  }, [pollStatus]);

  const countdown = msLeft !== null ? msToCountdown(msLeft) : null;
  const isFinished = msLeft !== null && msLeft <= 0;

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={s.root}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Language toggle ── */}
        <View style={s.langToggleRow}>
          <Pressable
            style={s.langToggleBtn}
            onPress={() => setLang(isHe ? 'en' : 'he')}
            accessibilityRole="button"
            accessibilityLabel={isHe ? 'החלף שפה לאנגלית' : 'Switch language to Hebrew'}
          >
            <Text style={s.langToggleText}>{isHe ? 'English' : 'עברית'}</Text>
          </Pressable>
        </View>

        {/* ── Icon ── */}
        <View style={s.iconWrap}>
          <Text style={s.iconEmoji}>🛠️</Text>
        </View>

        {/* ── Heading ── */}
        <Text style={s.heading}>{isHe ? 'המערכת בתחזוקה' : 'Under Maintenance'}</Text>
        <Text style={s.title}>{title}</Text>

        <Text style={s.body}>
          {isHe
            // Mobile is always "the app" here — this screen only serves the
            // mobile client (see apiClient's platform=mobile above); web's
            // equivalent screen says "האתר" instead.
            ? 'אנו מבצעים תחזוקה מתוכננת כדי לשפר את החוויה שלכם. האפליקציה תחזור לפעול בקרוב.'
            : "We're performing scheduled maintenance to improve your experience.\nThe app will be back online shortly."}
        </Text>

        {/* ── Countdown ── */}
        {countdown && !isFinished && (
          <View style={s.countdownCard}>
            <Text style={s.countdownLabel}>{isHe ? 'זמן משוער שנותר' : 'Estimated time remaining'}</Text>
            <View style={s.countdownRow}>
              <View style={s.countdownUnit}>
                <Text style={s.countdownNum}>{countdown.h}</Text>
                <Text style={s.countdownUnitLabel}>{isHe ? 'שעות' : 'hours'}</Text>
              </View>
              <Text style={s.countdownColon}>:</Text>
              <View style={s.countdownUnit}>
                <Text style={s.countdownNum}>{countdown.m}</Text>
                <Text style={s.countdownUnitLabel}>{isHe ? 'דקות' : 'min'}</Text>
              </View>
              <Text style={s.countdownColon}>:</Text>
              <View style={s.countdownUnit}>
                <Text style={s.countdownNum}>{countdown.s}</Text>
                <Text style={s.countdownUnitLabel}>{isHe ? 'שניות' : 'sec'}</Text>
              </View>
            </View>

            {endsAt && (
              <Text style={s.endsAtText}>
                {(isHe ? 'צפוי לחזור עד ' : 'Back online by ') + formatEndsAt(endsAt)}
              </Text>
            )}
          </View>
        )}

        {/* ── Finished state ── */}
        {isFinished && (
          <View style={[s.countdownCard, { borderColor: '#10B981' }]}>
            <Text style={[s.countdownLabel, { color: '#10B981' }]}>
              ✅ {isHe ? 'התחזוקה אמורה להסתיים בקרוב...' : 'Maintenance should be wrapping up…'}
            </Text>
          </View>
        )}

        {/* ── Refresh button ── */}
        <Pressable
          style={s.refreshBtn}
          onPress={pollStatus}
          disabled={checking}
          accessibilityRole="button"
        >
          {checking
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.refreshBtnText}>↻  {isHe ? 'בדוק שוב' : 'Check again'}</Text>
          }
        </Pressable>

        {/* ── Sign out ── */}
        <Pressable onPress={handleSignOut} accessibilityRole="button">
          <Text style={s.signOutLink}>{isHe ? 'התנתקות' : 'Sign out'}</Text>
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = MaintenanceScreenStyles;
