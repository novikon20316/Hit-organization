// app/stuck-milestones.tsx
// Top-level screen (mirrors relay-tasks.tsx's not-under-(tabs) placement) —
// shared by the administrative coordinator, program head and grad school
// head. Lists every milestone in the caller's scope that has sat on one link
// of its chain longer than the system_admin-set limit, and lets them remind
// whoever it's waiting on. Mirrors web's app/stuck-milestones/page.tsx; see
// server's services/stuckMilestones.ts.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, FlatList, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiClient } from '@/src/api/apiClient';
import { facultyLabel, type FacultyId, type Lang } from '@/components/i18n';
import { underADayLeftLabel } from '@/utils/timeLeft';

type WaitingRole =
  | 'student' | 'supervisor' | 'examiner' | 'coordinator' | 'faculty_admin' | 'administrative_secretary'
  | 'grad_school_head' | 'school_head' | 'program_head' | 'division_head' | 'dean' | 'committee';

interface StuckMilestone {
  milestoneId: string;
  milestoneNameHe: string;
  milestoneNameEn: string;
  projectTitleHe: string;
  projectTitleEn: string;
  facultyId: string | null;
  studentNames: string[];
  waitingRole: WaitingRole | null;
  waitingNames: string[];
  daysStuck: number;
  limitDays: number | null;
  lastManualReminderAt: string | null;
}

const WAITING_ROLE_LABEL: Record<WaitingRole, { he: string; en: string }> = {
  student: { he: 'הסטודנט/ית', en: 'Student' },
  supervisor: { he: 'מנחה', en: 'Supervisor' },
  examiner: { he: 'בוחנים', en: 'Examiners' },
  coordinator: { he: 'רכז/ת', en: 'Coordinator' },
  faculty_admin: { he: 'מנהל/ת פקולטה', en: 'Faculty admin' },
  administrative_secretary: { he: 'רכזת מנהלית', en: 'Administrative coordinator' },
  grad_school_head: { he: 'ראש בית הספר לתארים מתקדמים', en: 'Head of graduate school' },
  school_head: { he: 'ראש בית הספר', en: 'School head' },
  program_head: { he: 'ראש התוכנית', en: 'Program head' },
  division_head: { he: 'ראש המחלקה', en: 'Division head' },
  dean: { he: 'דיקן', en: 'Dean' },
  committee: { he: 'ועדה', en: 'Committee' },
};

interface DueSoonMilestone {
  milestoneId: string;
  milestoneNameHe: string;
  milestoneNameEn: string;
  projectTitleHe: string;
  projectTitleEn: string;
  facultyId: string | null;
  studentNames: string[];
  dueDate: string;
  status: 'pending' | 'rejected';
}

const REMINDER_COOLDOWN_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "3 days and 5 hours left" — or hours + minutes once under a day. Same as web. */
function dueLeftLabel(dueIso: string, lang: Lang, now: number): string {
  const under = underADayLeftLabel(dueIso, lang, now);
  if (under) return under;
  const left = new Date(dueIso).getTime() - now;
  const days = Math.floor(left / DAY_MS);
  const hours = Math.floor((left % DAY_MS) / (60 * 60 * 1000));
  if (lang === 'he') {
    const d = days === 1 ? 'יום אחד' : `${days} ימים`;
    return hours > 0 ? `נותרו ${d} ו-${hours === 1 ? 'שעה אחת' : `${hours} שעות`}` : `נותרו ${d}`;
  }
  const d = `${days} day${days === 1 ? '' : 's'}`;
  return hours > 0 ? `${d} and ${hours} hour${hours === 1 ? '' : 's'} left` : `${d} left`;
}

export default function StuckMilestonesScreen() {
  const router = useRouter();
  const { lang: langParam } = useLocalSearchParams<{ lang?: string }>();
  const [lang, setLang] = useState<Lang>(langParam === 'en' ? 'en' : 'he');
  const isRtl = lang === 'he';
  const L = (he: string, en: string) => (lang === 'he' ? he : en);

  const [rows, setRows] = useState<StuckMilestone[]>([]);
  const [dueSoon, setDueSoon] = useState<DueSoonMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [remindingId, setRemindingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/stuck-milestones');
      setRows((res.data?.milestones ?? []) as StuckMilestone[]);
      setDueSoon((res.data?.dueSoon ?? []) as DueSoonMilestone[]);
      setError('');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? (lang === 'he' ? 'הטעינה נכשלה' : 'Failed to load'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [lang]);

  useEffect(() => { load(); }, [load]);

  const handleRemind = async (row: StuckMilestone) => {
    setRemindingId(row.milestoneId);
    try {
      const res = await apiClient.post(`/api/stuck-milestones/${row.milestoneId}/remind`);
      Alert.alert(L('נשלח', 'Sent'), L(`נשלחה תזכורת ל-${res.data?.reminded ?? 0} נמענים.`, `Reminder sent to ${res.data?.reminded ?? 0} recipient(s).`));
      setRows((prev) => prev.map((r) => (r.milestoneId === row.milestoneId ? { ...r, lastManualReminderAt: new Date().toISOString() } : r)));
    } catch (err: any) {
      Alert.alert(L('שגיאה', 'Error'), err?.response?.data?.message ?? L('שליחת התזכורת נכשלה', 'Failed to send the reminder'));
    } finally {
      setRemindingId(null);
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
        {L('אבני דרך תקועות', 'Stuck Milestones')}
      </Text>
      <Text style={{ fontSize: 13, color: '#6B7280', marginHorizontal: 16, marginTop: 2, textAlign: isRtl ? 'right' : 'left' }}>
        {L('אבני דרך שממתינות בשלב אחד יותר מהמגבלה שנקבעה, ואבני דרך שמועד ההגשה שלהן בעוד 7 ימים או פחות', 'Milestones waiting on one step longer than their set limit, and milestones due within 7 days')}
      </Text>
      {!!error && (
        <Text style={{ color: '#EF4444', fontSize: 13, marginHorizontal: 16, marginTop: 8, textAlign: isRtl ? 'right' : 'left' }}>{error}</Text>
      )}

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#2E86FF" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.milestoneId}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListHeaderComponent={
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#1A1F36', textAlign: isRtl ? 'right' : 'left' }}>
              {L(`⏳ תקועות מעבר למגבלה (${rows.length})`, `⏳ Stuck past their limit (${rows.length})`)}
            </Text>
          }
          ListFooterComponent={
            <View style={{ marginTop: 18, gap: 10 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#1A1F36', textAlign: isRtl ? 'right' : 'left' }}>
                {L(`📅 מועד הגשה בעוד 7 ימים או פחות (${dueSoon.length})`, `📅 Due within 7 days (${dueSoon.length})`)}
              </Text>
              <Text style={{ fontSize: 12, color: '#8899BB', textAlign: isRtl ? 'right' : 'left' }}>
                {L('אבני דרך שהסטודנט/ית עדיין לא הגיש/ה (או שהוחזרו לתיקון). נשארות כאן עד הרגע האחרון של מועד ההגשה.', 'Milestones the student has not submitted yet (or that were sent back). They stay here until the very last minute of the deadline.')}
              </Text>
              {dueSoon.length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#8899BB', marginTop: 8 }}>{L('✅ אין הגשות קרובות', '✅ Nothing due in the next 7 days')}</Text>
              ) : dueSoon.map((item) => {
                const now = Date.now();
                const urgent = new Date(item.dueDate).getTime() - now < 2 * DAY_MS;
                const align = { textAlign: isRtl ? 'right' as const : 'left' as const };
                return (
                  <View key={item.milestoneId} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' }}>
                    <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: '#1A1F36', flexShrink: 1, ...align }}>
                        {lang === 'he' ? item.milestoneNameHe : item.milestoneNameEn}
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: urgent ? '#EF4444' : '#B45309' }}>
                        {dueLeftLabel(item.dueDate, lang, now)}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 4, ...align }}>
                      📁 {lang === 'he' ? item.projectTitleHe : item.projectTitleEn}
                      {item.facultyId ? ` · ${facultyLabel(item.facultyId as FacultyId, lang)}` : ''}
                    </Text>
                    {item.studentNames.length > 0 && (
                      <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 2, ...align }}>🎓 {item.studentNames.join(', ')}</Text>
                    )}
                    <Text style={{ fontSize: 12, color: '#8899BB', marginTop: 6, ...align }}>
                      {L('מועד הגשה: ', 'Due: ')}
                      {new Date(item.dueDate).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', { timeZone: 'Asia/Jerusalem', dateStyle: 'medium', timeStyle: 'short' })}
                      {item.status === 'rejected' ? L(' · הוחזרה לתיקון', ' · Sent back for revision') : ''}
                    </Text>
                  </View>
                );
              })}
            </View>
          }
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', color: '#8899BB', marginTop: 24 }}>
              {L('✅ אין אבני דרך תקועות', '✅ No stuck milestones')}
            </Text>
          }
          renderItem={({ item }) => {
            const waitingLabel = item.waitingRole ? WAITING_ROLE_LABEL[item.waitingRole][lang] : '—';
            const coolingDown = !!item.lastManualReminderAt && Date.now() - new Date(item.lastManualReminderAt).getTime() < REMINDER_COOLDOWN_MS;
            const disabled = remindingId === item.milestoneId || coolingDown || item.waitingNames.length === 0;
            const over = item.limitDays != null ? item.daysStuck - item.limitDays : 0;
            const align = { textAlign: isRtl ? 'right' as const : 'left' as const };
            return (
              <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' }}>
                <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#1A1F36', flexShrink: 1, ...align }}>
                    {lang === 'he' ? item.milestoneNameHe : item.milestoneNameEn}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>
                    {L(`${item.daysStuck} ימים`, `${item.daysStuck} days`)}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 4, ...align }}>
                  📁 {lang === 'he' ? item.projectTitleHe : item.projectTitleEn}
                  {item.facultyId ? ` · ${facultyLabel(item.facultyId as FacultyId, lang)}` : ''}
                </Text>
                {item.studentNames.length > 0 && (
                  <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 2, ...align }}>🎓 {item.studentNames.join(', ')}</Text>
                )}
                <Text style={{ fontSize: 13, color: '#1A1F36', marginTop: 8, ...align }}>
                  ⏳ {L('ממתין ל:', 'Waiting on:')} {waitingLabel}
                  {item.waitingNames.length > 0 ? ` (${item.waitingNames.join(', ')})` : ''}
                </Text>
                <Text style={{ fontSize: 12, color: '#8899BB', marginTop: 2, ...align }}>
                  {L(`מגבלה: ${item.limitDays ?? '—'} ימים · חריגה של ${over} ימים`, `Limit: ${item.limitDays ?? '—'} days · ${over} day(s) over`)}
                </Text>
                <Pressable
                  onPress={() => handleRemind(item)}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityState={{ disabled }}
                  style={{ marginTop: 10, backgroundColor: '#2E86FF', borderRadius: 20, paddingVertical: 8, alignItems: 'center', opacity: disabled ? 0.5 : 1 }}
                >
                  {remindingId === item.milestoneId ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>
                      {coolingDown ? L('תזכורת נשלחה בשעה האחרונה', 'Reminder sent within the last hour') : L(`🔔 שליחת תזכורת ל${waitingLabel}`, `🔔 Remind ${waitingLabel.toLowerCase()}`)}
                    </Text>
                  )}
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
