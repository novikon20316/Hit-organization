// components/modals/ReserveDefenseDateModal.tsx
// The coordinator fixes the defense date directly instead of waiting for the
// examiners' candidate dates. Ports web/app/coordinator/home/ReserveDateModal.tsx
// onto the same endpoint (coordinatorController.ts's reserveDefenseDateHandler
// → services/defenseScheduling.ts's reserveDefenseDate), which enforces the
// role + scope, the allowed statuses, unfinished earlier milestones and the
// Sunday–Thursday rule. Leaves the defense at 'defense_date_set', so the card
// then offers the usual time/place step. Callers mount it only while open, so
// its form state starts fresh each time.
import React, { useState } from 'react';
import { Modal, View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { apiClient } from '../../src/api/apiClient';
import { ap } from '../../constants/theme';
import type { Lang } from '../i18n';

interface Props {
  visible: boolean;
  lang: Lang;
  milestoneId: string;
  projectTitle: string;
  /** True when examiners were already asked for dates — this replaces that. */
  overridesExaminerDates: boolean;
  onClose: () => void;
  onReserved: () => void;
}

/** Local 'YYYY-MM-DD' (staff and the server both work in Asia/Jerusalem). */
function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function ReserveDefenseDateModal({ visible, lang, milestoneId, projectTitle, overridesExaminerDates, onClose, onReserved }: Props) {
  const he = lang === 'he';
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const submit = async () => {
    setError('');
    const trimmed = date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || isNaN(new Date(`${trimmed}T12:00:00`).getTime())) {
      setError(he ? 'יש להזין תאריך בפורמט YYYY-MM-DD' : 'Enter a date in YYYY-MM-DD format');
      return;
    }
    if (trimmed < todayISO()) {
      setError(he ? 'לא ניתן לשריין תאריך שעבר' : 'The date cannot be in the past');
      return;
    }
    // Same rule the server enforces (Sunday-Thursday) — caught here for a faster message.
    const day = new Date(`${trimmed}T12:00:00`).getDay();
    if (day === 5 || day === 6) {
      setError(he ? 'הגנות מתקיימות בימים א׳–ה׳ בלבד — יש לבחור יום אחר.' : 'Defenses run Sunday to Thursday — please pick another day.');
      return;
    }
    setSaving(true);
    try {
      await apiClient.post(`/api/coordinator/milestones/${milestoneId}/reserve-defense-date`, { date: trimmed });
      const [y, m, d] = trimmed.split('-');
      setResult(he ? `✅ מועד ההגנה שוריין: ${d}/${m}/${y}` : `✅ Defense date reserved: ${d}/${m}/${y}`);
      setTimeout(onReserved, 1200);
    } catch (err: any) {
      setError(err.response?.data?.message || (he ? 'שריון המועד נכשל' : 'Failed to reserve the date'));
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: ap.surfaceContainerLow }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: ap.onSurface }}>📅 {he ? 'שריון מועד הגנה' : 'Reserve defense date'}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={he ? 'סגור' : 'Close'} hitSlop={10}>
            <Text style={{ fontSize: 20, color: ap.outline }}>✕</Text>
          </Pressable>
        </View>
        <Text style={{ marginTop: 4, fontSize: 13, color: ap.onSurfaceVariant, textAlign: he ? 'right' : 'left' }}>{projectTitle}</Text>
        <Text style={{ marginTop: 12, fontSize: 13, color: ap.onSurfaceVariant, textAlign: he ? 'right' : 'left' }}>
          {he
            ? 'המועד יישלח לסטודנט, למנחה ולבוחנים. אחרי השריון ניתן לקבוע שעה, מקום ואופן הגנה, ולשבץ בוחנים אם טרם שובצו.'
            : 'The student, supervisor and examiners are notified. Afterwards you can set the time, place and format, and assign examiners if you have not yet.'}
        </Text>
        {overridesExaminerDates && (
          <Text style={{ marginTop: 10, borderRadius: 8, padding: 10, fontSize: 12, backgroundColor: '#FEF3C7', color: '#92400E', textAlign: he ? 'right' : 'left' }}>
            {he
              ? 'הבוחנים כבר התבקשו להגיש תאריכים — השריון מחליף את תהליך התיאום ביניהם.'
              : 'The examiners were already asked for dates — reserving replaces that matching.'}
          </Text>
        )}

        <Text style={{ marginTop: 16, marginBottom: 6, fontSize: 13, fontWeight: '600', color: ap.onSurfaceVariant, textAlign: he ? 'right' : 'left' }}>
          {he ? 'תאריך ההגנה (YYYY-MM-DD)' : 'Defense date (YYYY-MM-DD)'}
        </Text>
        <TextInput
          style={{ borderWidth: 1.5, borderColor: ap.outlineVariant, borderRadius: 8, padding: 11, fontSize: 14, color: ap.onSurface, backgroundColor: '#fff' }}
          value={date}
          onChangeText={setDate}
          placeholder={todayISO()}
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
          accessibilityLabel={he ? 'תאריך ההגנה' : 'Defense date'}
        />

        {result ? <Text style={{ marginTop: 12, color: '#10B981', fontSize: 13, fontWeight: '600' }} accessibilityRole="text">{result}</Text> : null}
        {error ? <Text style={{ marginTop: 12, color: '#EF4444', fontSize: 13 }} accessibilityRole="alert">{error}</Text> : null}

        <View style={{ marginTop: 20, flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={onClose}
            style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: ap.outlineVariant, paddingVertical: 12, alignItems: 'center' }}
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: ap.onSurface }}>{he ? 'ביטול' : 'Cancel'}</Text>
          </Pressable>
          <Pressable
            onPress={submit}
            disabled={saving || !!result}
            style={{ flex: 1, borderRadius: 10, backgroundColor: ap.primary, paddingVertical: 12, alignItems: 'center', opacity: saving || result ? 0.6 : 1 }}
            accessibilityRole="button"
          >
            {saving && !result
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: ap.onPrimary, fontSize: 14, fontWeight: '700' }}>{he ? 'שריין מועד' : 'Reserve date'}</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </Modal>
  );
}
