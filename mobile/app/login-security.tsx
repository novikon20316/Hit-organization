// app/login-security.tsx
// Public screen — no Firebase Auth required (the whole point: the account
// this incident is about is disabled until answered here).
// Arrives via a deep-link:
//   myapp://login-security?code=<code>
//   https://myapp.example.com/login-security?code=<code>
//
// Deliberately server-mediated only (see server/src/services/loginSecurity.ts)
// — unlike examiner-access.tsx, this screen never reads/writes Firestore
// directly; every step goes through the public Express API since resolving
// an incident always requires an Admin-SDK action (re-enable the account,
// issue a temp password, or notify admins).

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { apiClient } from '@/src/api/apiClient';

type Lang = 'he' | 'en';

interface IncidentSummary {
  email: string;
  ip: string;
  location: string;
  dateTime: string;
  status: 'pending' | 'confirmed_owner' | 'confirmed_attacker' | 'expired';
}

export default function LoginSecurityScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [lang] = useState<Lang>('he');
  const L = (he: string, en: string) => (lang === 'he' ? he : en);

  const [phase, setPhase]       = useState<'loading' | 'pending' | 'resolved' | 'invalid'>('loading');
  const [incident, setIncident] = useState<IncidentSummary | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [outcome, setOutcome]   = useState<'owner' | 'attacker' | null>(null);

  const load = useCallback(async () => {
    if (!code || typeof code !== 'string') { setPhase('invalid'); return; }
    try {
      const data: IncidentSummary = await apiClient.getLoginSecurityIncident(code);
      setIncident(data);
      setPhase(data.status === 'pending' ? 'pending' : 'resolved');
    } catch {
      setPhase('invalid');
    }
  }, [code]);

  useEffect(() => { load(); }, [load]);

  const respond = async (decision: 'owner' | 'attacker') => {
    if (!code || typeof code !== 'string' || actionBusy) return;
    setActionBusy(true);
    try {
      await apiClient.confirmLoginSecurityIncident(code, decision);
      setOutcome(decision);
      setPhase('resolved');
    } catch {
      // Leave phase as-is so the buttons stay available to retry.
    } finally {
      setActionBusy(false);
    }
  };

  if (phase === 'loading') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2E86FF" />
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'invalid') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.title}>{L('קישור לא תקין', 'Invalid link')}</Text>
          <Text style={styles.body}>
            {L('קישור זה אינו תקין או שפג תוקפו.', 'This link is invalid or no longer works.')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'resolved') {
    const isExpired   = incident?.status === 'expired' && !outcome;
    const isOwner      = outcome === 'owner'    || incident?.status === 'confirmed_owner';
    const isAttacker   = outcome === 'attacker' || incident?.status === 'confirmed_attacker';

    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.centered}>
          <Text style={styles.title}>
            {isExpired
              ? L('הקישור פג תוקף', 'This link has expired')
              : isOwner
              ? L('תודה! שלחנו לך סיסמה זמנית', 'Thanks! We sent you a temporary password')
              : isAttacker
              ? L('תודה, החשבון נשאר מושבת', 'Thanks — the account stays disabled')
              : L('הקישור כבר נענה', 'This link has already been answered')}
          </Text>
          <Text style={styles.body}>
            {isOwner
              ? L(
                  'בדוק את תיבת הדואר שלך לקבלת הסיסמה הזמנית והוראות התחברות. תתבקש לבחור סיסמה חדשה מיד לאחר ההתחברות.',
                  "Check your email for the temporary password and login instructions. You'll be asked to choose a new password immediately after logging in."
                )
              : isAttacker
              ? L(
                  'התרנו במנהל המערכת. החשבון יישאר מושבת עד לבדיקה ידנית.',
                  "We've alerted a system administrator. The account will remain disabled pending manual review."
                )
              : L('אין צורך בפעולה נוספת.', 'No further action is needed.')}
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // phase === 'pending'
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text style={styles.title}>
          {L('זיהינו ניסיונות התחברות כושלים', 'We noticed failed login attempts')}
        </Text>
        <Text style={styles.body}>
          {L('חשבון: ', 'Account: ')}{incident?.email}
        </Text>

        <View style={styles.detailsBox}>
          <Text style={styles.detailLine}>{L('מתי: ', 'When: ')}{incident?.dateTime}</Text>
          <Text style={styles.detailLine}>{L('כתובת IP: ', 'IP address: ')}{incident?.ip}</Text>
          {!!incident?.location && (
            <Text style={styles.detailLine}>
              {L('מיקום משוער: ', 'Approximate location: ')}{incident.location}
            </Text>
          )}
        </View>

        <Text style={styles.question}>{L('האם זה היית אתה?', 'Was this you?')}</Text>

        <Pressable
          style={[styles.button, styles.yesButton, actionBusy && styles.buttonDisabled]}
          onPress={() => respond('owner')}
          disabled={actionBusy}
        >
          <Text style={styles.buttonText}>{L('כן, זה הייתי אני', 'Yes, that was me')}</Text>
        </Pressable>

        <Pressable
          style={[styles.button, styles.noButton, actionBusy && styles.buttonDisabled]}
          onPress={() => respond('attacker')}
          disabled={actionBusy}
        >
          <Text style={styles.buttonText}>{L('לא, זה לא הייתי אני', "No, that wasn't me")}</Text>
        </Pressable>

        {actionBusy && <ActivityIndicator style={{ marginTop: 16 }} color="#2E86FF" />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#F0F4FF' },
  centered:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title:          { fontSize: 20, fontWeight: 'bold', color: '#1a1a2e', textAlign: 'center', marginBottom: 12 },
  body:           { fontSize: 15, color: '#444', textAlign: 'center', marginBottom: 16 },
  detailsBox:     { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 20 },
  detailLine:     { fontSize: 14, color: '#333', marginBottom: 6 },
  question:       { fontSize: 17, fontWeight: '600', textAlign: 'center', marginBottom: 16 },
  button:         { padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  yesButton:      { backgroundColor: '#2E86FF' },
  noButton:       { backgroundColor: '#e74c3c' },
  buttonDisabled: { opacity: 0.6 },
  buttonText:     { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
