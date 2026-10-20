// app/relay-tasks.tsx
// Top-level screen (reachable from any staff role's dashboard, mirrors
// account-deletion-pending.tsx/defense-access.tsx's not-under-(tabs)
// placement) — a relay task's recipient can be a supervisor, coordinator,
// administrative_secretary, or program_head (see server's
// decisionRelay.ts), not one specific role. Lists every open relay task
// assigned to the caller: a committee chairman routed a decision to them
// instead of the student (CS-enabled only, for now), and they're
// responsible for passing the outcome on to the student themselves. An
// administrative coordinator recipient gets a dropdown instead of the single
// button — she can also send the decision back to the committee or the
// supervisor if something's wrong (mirrors web's RelayActionPicker).

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, FlatList, RefreshControl, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { apiClient } from '@/src/api/apiClient';
import type { Lang } from '@/components/i18n';

interface RelayTask {
  id: string;
  decision: 'approve' | 'reject';
  comment: string;
  milestoneNameHe: string;
  milestoneNameEn: string;
  projectTitleHe: string;
  projectTitleEn: string;
  decidedByName: string;
  recipientRole: string;
  canReturnToCommittee: boolean;
  canReturnToSupervisor: boolean;
}

type RelayAction = 'student' | 'committee' | 'supervisor';

export default function RelayTasksScreen() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';
  const L = (he: string, en: string) => (lang === 'he' ? he : en);

  const [tasks, setTasks] = useState<RelayTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.getMyRelayTasks();
      setTasks(res.tasks as RelayTask[]);
    } catch {
      // Best-effort list — an empty state on failure is preferable to a crash.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleResolve = async (id: string, action: RelayAction = 'student', comment = '') => {
    setResolvingId(id);
    try {
      await apiClient.resolveRelayTask(id, action, comment);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err: any) {
      Alert.alert(L('שגיאה', 'Error'), err?.response?.data?.message ?? L('הפעולה נכשלה', 'Action failed'));
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8FA' }}>
      <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={L('חזור', 'Back')}>
          <Text style={{ fontSize: 15, color: '#2E86FF', fontWeight: '600' }}>{L('חזור', '← Back')}</Text>
        </Pressable>
        <Pressable onPress={() => setLang(lang === 'he' ? 'en' : 'he')} accessibilityRole="button">
          <Text style={{ fontSize: 13, color: '#8899BB' }}>{lang === 'he' ? 'EN' : 'עב'}</Text>
        </Pressable>
      </View>

      <Text style={{ fontSize: 20, fontWeight: '700', color: '#1A1F36', marginHorizontal: 16, textAlign: isRtl ? 'right' : 'left' }}>
        {L('החלטות להעברה', 'Decisions to Relay')}
      </Text>
      <Text style={{ fontSize: 13, color: '#6B7280', marginHorizontal: 16, marginTop: 2, textAlign: isRtl ? 'right' : 'left' }}>
        {L("החלטות ועדה שעלייך להעביר לסטודנט/ית", "Committee decisions you're responsible for passing on to the student")}
      </Text>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#2E86FF" />
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', color: '#8899BB', marginTop: 24 }}>
              {L('✅ אין החלטות ממתינות להעברה', '✅ No decisions waiting to be relayed')}
            </Text>
          }
          renderItem={({ item }) => (
            <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' }}>
              <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#1A1F36', flexShrink: 1 }}>
                  {lang === 'he' ? item.projectTitleHe : item.projectTitleEn}
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: item.decision === 'approve' ? '#10B981' : '#EF4444' }}>
                  {item.decision === 'approve' ? L('✓ אושר', '✓ Approved') : L('✗ נדחה', '✗ Rejected')}
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 4, textAlign: isRtl ? 'right' : 'left' }}>
                {lang === 'he' ? item.milestoneNameHe : item.milestoneNameEn}
              </Text>
              {!!item.comment && (
                <Text style={{ fontSize: 13, color: '#1A1F36', marginTop: 4, textAlign: isRtl ? 'right' : 'left' }}>{item.comment}</Text>
              )}
              <Text style={{ fontSize: 12, color: '#8899BB', marginTop: 4, textAlign: isRtl ? 'right' : 'left' }}>
                {L(`הוחלט על ידי ${item.decidedByName}`, `Decided by ${item.decidedByName}`)}
              </Text>
              {item.recipientRole === 'administrative_secretary' ? (
                <RelayActionPicker
                  task={item}
                  lang={lang}
                  busy={resolvingId === item.id}
                  onSubmit={(action, comment) => handleResolve(item.id, action, comment)}
                />
              ) : (
                <Pressable
                  onPress={() => handleResolve(item.id)}
                  disabled={resolvingId === item.id}
                  accessibilityRole="button"
                  style={{ marginTop: 10, backgroundColor: '#2E86FF', borderRadius: 20, paddingVertical: 8, alignItems: 'center', opacity: resolvingId === item.id ? 0.6 : 1 }}
                >
                  {resolvingId === item.id ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>
                      {L("עברתי לסטודנט/ית ✓", "I've informed the student ✓")}
                    </Text>
                  )}
                </Pressable>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function RelayActionPicker({ task, lang, busy, onSubmit }: {
  task: RelayTask;
  lang: Lang;
  busy: boolean;
  onSubmit: (action: RelayAction, comment: string) => void;
}) {
  const isRtl = lang === 'he';
  const L = (he: string, en: string) => (lang === 'he' ? he : en);
  const [action, setAction] = useState<RelayAction>('student');
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const needsReason = action !== 'student';

  const options: Array<{ value: RelayAction; label: string; disabled: boolean }> = [
    { value: 'student', label: L('העברה לסטודנט/ית', 'Pass on to the student'), disabled: false },
    { value: 'committee', label: L('החזרה לוועדה (לדיון חוזר)', 'Return to the committee (reconsider)'), disabled: !task.canReturnToCommittee },
    { value: 'supervisor', label: L('החזרה למנחה (לבדיקה חוזרת)', 'Return to the supervisor (re-check)'), disabled: !task.canReturnToSupervisor },
  ];
  const selected = options.find((o) => o.value === action)!;
  const canSubmit = !busy && (!needsReason || !!comment.trim());

  return (
    <View style={{ marginTop: 10, gap: 8 }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={L('מה לעשות עם ההחלטה', 'What to do with this decision')}
        style={{ flexDirection: isRtl ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}
      >
        <Text style={{ fontSize: 13, color: '#1A1F36' }}>{selected.label}</Text>
        <Text style={{ fontSize: 12, color: '#8899BB' }}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open && (
        <View style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
          {options.map((o) => (
            <Pressable
              key={o.value}
              onPress={() => { setAction(o.value); setOpen(false); }}
              disabled={o.disabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: o.disabled, selected: o.value === action }}
              style={{ paddingHorizontal: 10, paddingVertical: 9, backgroundColor: o.value === action ? '#EEF4FF' : '#fff', opacity: o.disabled ? 0.4 : 1 }}
            >
              <Text style={{ fontSize: 13, color: '#1A1F36', textAlign: isRtl ? 'right' : 'left' }}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {needsReason && (
        <TextInput
          value={comment}
          onChangeText={setComment}
          multiline
          placeholder={L('סיבת ההחזרה (חובה)', 'Reason for sending it back (required)')}
          style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 10, minHeight: 60, fontSize: 13, textAlign: isRtl ? 'right' : 'left', textAlignVertical: 'top' }}
        />
      )}
      <Pressable
        onPress={() => onSubmit(action, comment.trim())}
        disabled={!canSubmit}
        accessibilityRole="button"
        style={{ backgroundColor: '#2E86FF', borderRadius: 20, paddingVertical: 8, alignItems: 'center', opacity: canSubmit ? 1 : 0.6 }}
      >
        {busy ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>
            {action === 'student' ? L('שליחה לסטודנט/ית ✓', 'Send to the student ✓') : L('החזרה', 'Send back')}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
