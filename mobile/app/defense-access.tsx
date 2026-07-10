// app/defense-access.tsx
// Public screen — no Firebase Auth required.
// External examiners arrive via a SEPARATE deep-link from examiner-access.tsx
// (that one is for thesis review; this one is defense-day-only app access):
//   myapp://defense-access?grant=<code>
//
// Access is gated server-side (see examinerAccessController.getDefenseAccessStatus)
// to only the calendar day of the defense, until midnight Asia/Jerusalem —
// the server recomputes this fresh on every load, this screen never decides
// access on its own.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { apiClient } from '@/src/api/apiClient';
import type { Lang } from '@/components/i18n';

type GateStatus = 'loading' | 'invalid' | 'not_yet_active' | 'active' | 'expired' | 'error';

interface DefenseAccessInfo {
  examinerName: string;
  defenseDateISO: string;
  activatesAt?: string;
  expiresAt?: string;
  projectTitleHe?: string;
  projectTitleEn?: string;
  room?: string | null;
  building?: string | null;
  time?: string | null;
}

export default function DefenseAccessScreen() {
  const { grant } = useLocalSearchParams<{ grant: string }>();
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';
  const L = (he: string, en: string) => (lang === 'he' ? he : en);

  const [status, setStatus] = useState<GateStatus>('loading');
  const [info, setInfo] = useState<DefenseAccessInfo | null>(null);

  const load = useCallback(async () => {
    if (!grant) { setStatus('invalid'); return; }
    try {
      const res = await apiClient.get(`/api/examiner-access/defense/${grant}`);
      setStatus(res.data.status);
      setInfo(res.data);
    } catch (e) {
      console.error('defense-access: load error', e);
      setStatus('error');
    }
  }, [grant]);

  useEffect(() => { load(); }, [load]);

  if (status === 'loading') {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color="#2E86FF" />
      </View>
    );
  }

  if (status === 'invalid' || status === 'error') {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.centered}>
          <Text style={s.emoji}>🔗</Text>
          <Text style={s.title}>{L('קישור לא תקין', 'Invalid link')}</Text>
          <Text style={s.sub}>
            {L('פנה לרכז הפקולטה לקבלת קישור חדש.', 'Contact the faculty coordinator for a new link.')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (status === 'not_yet_active') {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.centered}>
          <Text style={s.emoji}>⏳</Text>
          <Text style={s.title}>{L('עדיין לא זמין', 'Not yet available')}</Text>
          <Text style={s.sub}>
            {L('קישור זה יהיה פעיל רק ביום ההגנה:', 'This link only activates on the day of the defense:')}
            {' '}{info?.defenseDateISO}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (status === 'expired') {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.centered}>
          <Text style={s.emoji}>⏰</Text>
          <Text style={s.title}>{L('הקישור פג תוקף', 'Link expired')}</Text>
          <Text style={s.sub}>
            {L(
              'הגישה ליום ההגנה הסתיימה בחצות. אם לא הצלחת להתחבר, פנה למנהל המערכת לקבלת הארכה.',
              'Defense-day access ended at midnight. If you missed it, contact the system administrator for an extension.',
            )}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── active ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.root}>
      <View style={s.content}>
        <Text style={s.emoji}>🎓</Text>
        <Text style={s.title}>{L('גישה ליום ההגנה', "Today's Defense Access")}</Text>
        <Text style={s.sub}>{L('שלום', 'Hello')} {info?.examinerName}</Text>

        <View style={s.card}>
          <InfoRow label={L('כותרת העבודה', 'Thesis')} value={lang === 'he' ? info?.projectTitleHe : info?.projectTitleEn} />
          <InfoRow label={L('תאריך', 'Date')} value={info?.defenseDateISO} />
          <InfoRow label={L('שעה', 'Time')} value={info?.time ?? L('טרם נקבע', 'Not set yet')} />
          <InfoRow label={L('חדר', 'Room')} value={info?.room ?? L('טרם נקבע', 'Not set yet')} />
          <InfoRow label={L('בניין', 'Building')} value={info?.building ?? L('טרם נקבע', 'Not set yet')} />
        </View>

        <Text style={s.footnote}>
          {L('גישה זו תקפה עד חצות היום.', 'This access is valid until midnight tonight.')}
        </Text>
      </View>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value ?? '—'}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#F0F4FF' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  content:  { flex: 1, alignItems: 'center', padding: 24, paddingTop: 64 },
  emoji:    { fontSize: 56, marginBottom: 16 },
  title:    { fontSize: 20, fontWeight: '700', color: '#1E293B', textAlign: 'center', marginBottom: 8 },
  sub:      { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22 },
  card:     { width: '100%', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginTop: 20,
              shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  infoRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8,
              borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  infoLabel:{ fontSize: 13, color: '#64748B' },
  infoValue:{ fontSize: 13, color: '#1E293B', fontWeight: '600' },
  footnote: { marginTop: 16, fontSize: 12, color: '#94A3B8', textAlign: 'center' },
});
