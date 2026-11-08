// components/ProjectRemindersPanel.tsx
// Reminders the supervisor schedules for their own project's students —
// mobile counterpart of web's app/supervisor/dashboard/ProjectRemindersPanel.tsx,
// same /api/supervisor/projects/:id/reminders endpoints (server
// supervisorReminders.ts: fixed wording + optional short note, up to 5
// waiting per project, dropped if the milestone is submitted first, sent at
// 09:00 on the chosen day).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { apiClient } from '@/src/api/apiClient';
import type { Lang } from './i18n';

const DAY_OPTIONS = [0, 1, 2, 3, 5, 7, 14];
const MAX_NOTE = 200;

export interface ReminderMilestoneOption {
  id: string;
  nameHe: string;
  nameEn: string;
  dueDate: string;
}

interface ScheduledReminder {
  id: string;
  milestoneNameHe: string;
  milestoneNameEn: string;
  sendAt: string;
  note: string | null;
}

function formatDate(iso: string, lang: Lang) {
  return new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short' });
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={{ borderWidth: 1, borderColor: selected ? '#2E86FF' : '#D0DEFF', backgroundColor: selected ? '#2E86FF' : '#fff', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 }}
    >
      <Text style={{ fontSize: 12, color: selected ? '#fff' : '#445', fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function ProjectRemindersPanel({ lang, projectId, milestones }: { lang: Lang; projectId: string; milestones: ReminderMilestoneOption[] }) {
  const he = lang === 'he';
  const align = he ? 'right' : 'left';
  const row = he ? 'row-reverse' : 'row';
  const [reminders, setReminders] = useState<ScheduledReminder[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [milestoneId, setMilestoneId] = useState('');
  const [daysBefore, setDaysBefore] = useState(3);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    apiClient.get(`/api/supervisor/projects/${projectId}/reminders`)
      .then((res) => setReminders(res.data.reminders as ScheduledReminder[]))
      .catch(() => setReminders([]));
  }, [projectId]);
  useEffect(load, [load]);

  const selectedId = milestoneId || milestones[0]?.id || '';

  const create = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.post(`/api/supervisor/projects/${projectId}/reminders`, { milestoneId: selectedId, daysBefore, note: note.trim() || undefined });
      setAdding(false);
      setNote('');
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || (he ? 'התזמון נכשל' : 'Failed to schedule'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await apiClient.delete(`/api/supervisor/reminders/${id}`);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || (he ? 'הביטול נכשל' : 'Failed to cancel'));
    } finally {
      setBusy(false);
    }
  };

  if (milestones.length === 0 && (reminders?.length ?? 0) === 0) return null;

  return (
    <View style={{ marginTop: 12, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 10 }}>
      <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#1a1b21' }}>⏰ {he ? 'תזכורות לסטודנטים' : 'Reminders to students'}</Text>
        {!adding && milestones.length > 0 && (reminders?.length ?? 0) < 5 && (
          <Pressable onPress={() => setAdding(true)} accessibilityRole="button" hitSlop={6}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#00236f' }}>＋ {he ? 'תזמון' : 'Schedule'}</Text>
          </Pressable>
        )}
      </View>

      {reminders === null ? <ActivityIndicator style={{ marginTop: 6 }} /> : reminders.map((r) => (
        <View key={r.id} style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginTop: 6 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: '#1a1b21', textAlign: align }}>{he ? r.milestoneNameHe : r.milestoneNameEn} · {formatDate(r.sendAt, lang)}</Text>
            {r.note ? <Text style={{ fontSize: 11, color: '#64748B', textAlign: align }} numberOfLines={1}>“{r.note}”</Text> : null}
          </View>
          <Pressable onPress={() => remove(r.id)} disabled={busy} accessibilityRole="button" hitSlop={6}>
            <Text style={{ fontSize: 12, color: '#64748B' }}>{he ? 'ביטול' : 'Cancel'}</Text>
          </Pressable>
        </View>
      ))}

      {adding && (
        <View style={{ marginTop: 8, gap: 8 }}>
          <Text style={{ fontSize: 12, color: '#64748B', textAlign: align }}>{he ? 'אבן דרך' : 'Milestone'}</Text>
          <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 6 }}>
            {milestones.map((m) => (
              <Chip key={m.id} label={`${he ? m.nameHe : m.nameEn} · ${formatDate(m.dueDate, lang)}`} selected={selectedId === m.id} onPress={() => setMilestoneId(m.id)} />
            ))}
          </View>
          <Text style={{ fontSize: 12, color: '#64748B', textAlign: align }}>{he ? 'מתי' : 'When'}</Text>
          <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 6 }}>
            {DAY_OPTIONS.map((d) => (
              <Chip
                key={d}
                label={d === 0 ? (he ? 'ביום ההגשה' : 'Due date') : he ? `${d} ימים לפני` : `${d}d before`}
                selected={daysBefore === d}
                onPress={() => setDaysBefore(d)}
              />
            ))}
          </View>
          <TextInput
            accessibilityLabel={he ? 'הערה קצרה (לא חובה)' : 'Short note (optional)'}
            value={note}
            onChangeText={setNote}
            maxLength={MAX_NOTE}
            placeholder={he ? 'הערה קצרה (לא חובה)' : 'Short note (optional)'}
            textAlign={he ? 'right' : 'left'}
            style={{ borderWidth: 1, borderColor: '#D0DEFF', borderRadius: 8, padding: 8, fontSize: 13 }}
          />
          <Text style={{ fontSize: 11, color: '#64748B', textAlign: align }}>
            {he
              ? 'הסטודנטים יקבלו הודעה קבועה עם שם אבן הדרך ומועד ההגשה, ב-09:00 ביום שנבחר. אם יגישו לפני כן — לא תישלח.'
              : 'Students get a standard message with the milestone and due date at 09:00 on that day. Not sent if they submit first.'}
          </Text>
          {error ? <Text style={{ fontSize: 12, color: '#EF4444', textAlign: align }} accessibilityRole="alert">{error}</Text> : null}
          <View style={{ flexDirection: row, gap: 8, justifyContent: 'flex-end' }}>
            <Pressable onPress={() => { setAdding(false); setError(''); }} accessibilityRole="button" style={{ borderWidth: 1, borderColor: '#D0DEFF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
              <Text style={{ fontSize: 13, color: '#445' }}>{he ? 'ביטול' : 'Cancel'}</Text>
            </Pressable>
            <Pressable onPress={create} disabled={busy || !selectedId} accessibilityRole="button" style={{ backgroundColor: '#00236f', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, opacity: busy ? 0.6 : 1 }}>
              {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 13, color: '#fff', fontWeight: '600' }}>{he ? 'תזמן' : 'Schedule'}</Text>}
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
