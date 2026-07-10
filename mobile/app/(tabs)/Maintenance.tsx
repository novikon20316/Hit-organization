// app/maintenance.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
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

  const [title,  setTitle]  = useState(params.title  ?? 'Scheduled maintenance');
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
        '/api/system/maintenance-status'
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

        {/* ── Icon ── */}
        <View style={s.iconWrap}>
          <Text style={s.iconEmoji}>🛠️</Text>
        </View>

        {/* ── Heading ── */}
        <Text style={s.heading}>Under Maintenance</Text>
        <Text style={s.title}>{title}</Text>

        <Text style={s.body}>
          We&apos;re performing scheduled maintenance to improve your experience.{'\n'}
          The app will be back online shortly.
        </Text>

        {/* ── Countdown ── */}
        {countdown && !isFinished && (
          <View style={s.countdownCard}>
            <Text style={s.countdownLabel}>Estimated time remaining</Text>
            <View style={s.countdownRow}>
              <View style={s.countdownUnit}>
                <Text style={s.countdownNum}>{countdown.h}</Text>
                <Text style={s.countdownUnitLabel}>hours</Text>
              </View>
              <Text style={s.countdownColon}>:</Text>
              <View style={s.countdownUnit}>
                <Text style={s.countdownNum}>{countdown.m}</Text>
                <Text style={s.countdownUnitLabel}>min</Text>
              </View>
              <Text style={s.countdownColon}>:</Text>
              <View style={s.countdownUnit}>
                <Text style={s.countdownNum}>{countdown.s}</Text>
                <Text style={s.countdownUnitLabel}>sec</Text>
              </View>
            </View>

            {endsAt && (
              <Text style={s.endsAtText}>
                Back online by {formatEndsAt(endsAt)}
              </Text>
            )}
          </View>
        )}

        {/* ── Finished state ── */}
        {isFinished && (
          <View style={[s.countdownCard, { borderColor: '#10B981' }]}>
            <Text style={[s.countdownLabel, { color: '#10B981' }]}>
              ✅ Maintenance should be wrapping up…
            </Text>
          </View>
        )}

        {/* ── Refresh button ── */}
        <Pressable
          style={s.refreshBtn}
          onPress={pollStatus}
          disabled={checking}
        >
          {checking
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.refreshBtnText}>↻  Check again</Text>
          }
        </Pressable>

        {/* ── Sign out ── */}
        <Pressable onPress={handleSignOut}>
          <Text style={s.signOutLink}>Sign out</Text>
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#F0F4FF' },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 48,
  },

  iconWrap: {
    width: 88, height: 88,
    borderRadius: 24,
    backgroundColor: '#1a1a2e',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 28,
  },
  iconEmoji: { fontSize: 42 },

  heading: {
    fontSize: 26, fontWeight: '700',
    color: '#1a1a2e', textAlign: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 15, fontWeight: '500',
    color: '#7F77DD', textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    fontSize: 14, color: '#64748B',
    textAlign: 'center', lineHeight: 22,
    marginBottom: 32,
  },

  // Countdown
  countdownCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  countdownLabel: {
    fontSize: 11, fontWeight: '600',
    color: '#94A3B8', textTransform: 'uppercase',
    letterSpacing: 0.6, marginBottom: 16,
  },
  countdownRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  countdownUnit:      { alignItems: 'center', minWidth: 56 },
  countdownNum: {
    fontSize: 44, fontWeight: '700',
    color: '#1a1a2e', lineHeight: 52,
  },
  countdownUnitLabel: {
    fontSize: 11, color: '#94A3B8',
    fontWeight: '500', marginTop: 2,
  },
  countdownColon: {
    fontSize: 38, fontWeight: '700',
    color: '#CBD5E1', marginBottom: 16, paddingHorizontal: 4,
  },
  endsAtText: {
    fontSize: 12, color: '#94A3B8',
    marginTop: 14, textAlign: 'center',
  },

  // Buttons
  refreshBtn: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    minWidth: 180,
    alignItems: 'center',
    marginBottom: 16,
  },
  refreshBtnText: { color: '#fff', fontSize: 15, fontWeight: '500' },

  signOutLink: {
    color: '#94A3B8', fontSize: 13,
    textDecorationLine: 'underline',
    marginTop: 4,
  },
});