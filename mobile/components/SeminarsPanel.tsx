// components/SeminarsPanel.tsx
// Mirror of web's app/administrative_coordinator/dashboard/SeminarsTab.tsx —
// see server/src/services/seminarScheduling.ts. A month calendar with seminars
// and defenses in their own colours, then the seminars waiting on her: set a
// date, or once it arrives record whether the student performed it.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, ActivityIndicator, Alert } from 'react-native';
import { apiClient } from '@/src/api/apiClient';
import { ap } from '@/constants/theme';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import { useDefenseScheduleLiveRefresh } from '@/hooks/useDefenseScheduleLiveRefresh';
import { DEFENSE_CALENDAR_COLOR, SEMINAR_COLOR, formatSeminarDay, type SeminarAttempt, type SeminarSlot } from '@/utils/seminar';

interface SeminarRow {
  milestoneId: string;
  projectTitleHe: string;
  projectTitleEn: string;
  status: string;
  students: { id: string; name: string }[];
  supervisorName: string;
  schedule: SeminarSlot | null;
  attempts: SeminarAttempt[];
  contactRequests: { id: string; studentName: string; message: string }[];
}

interface CalendarDefense {
  milestoneId: string;
  date: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const inputStyle = { borderWidth: 1, borderColor: ap.outlineVariant, borderRadius: 10, padding: 10, marginTop: 4, color: ap.onSurface, backgroundColor: ap.surfaceContainerLow } as const;

export function SeminarsPanel({ lang, isRtl }: { lang: 'he' | 'en'; isRtl: boolean }) {
  const [seminars, setSeminars] = useState<SeminarRow[]>([]);
  const [defenses, setDefenses] = useState<CalendarDefense[]>([]);
  const [today, setToday] = useState('');
  const [loading, setLoading] = useState(true);
  const [dateTarget, setDateTarget] = useState<{ seminar: SeminarRow; date: string } | null>(null);
  const [outcomeTarget, setOutcomeTarget] = useState<SeminarRow | null>(null);
  const [selectedDay, setSelectedDay] = useState('');
  const [month, setMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const textAlign = isRtl ? 'right' : 'left';

  const fetchSeminars = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/coordinator/seminars');
      setSeminars(res.data.seminars ?? []);
      setDefenses(res.data.defenses ?? []);
      setToday(res.data.today ?? '');
    } catch {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'לא ניתן לטעון נתונים' : 'Could not load data');
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => { fetchSeminars(); }, [fetchSeminars]);
  useLiveRefresh(fetchSeminars);
  useDefenseScheduleLiveRefresh(fetchSeminars);

  const markersByDay = useMemo(() => {
    const map = new Map<string, { seminar: boolean; defense: boolean }>();
    const mark = (date: string, kind: 'seminar' | 'defense') => {
      const entry = map.get(date) ?? { seminar: false, defense: false };
      entry[kind] = true;
      map.set(date, entry);
    };
    seminars.forEach((s) => {
      if (s.schedule) mark(s.schedule.date, 'seminar');
      s.attempts.forEach((a) => mark(a.date, 'seminar'));
    });
    defenses.forEach((d) => mark(d.date, 'defense'));
    return map;
  }, [seminars, defenses]);

  const awaiting = seminars.filter((s) => s.status === 'seminar_awaiting_date');
  const scheduled = seminars
    .filter((s) => s.status === 'seminar_scheduled' && s.schedule)
    .sort((a, b) => a.schedule!.date.localeCompare(b.schedule!.date));
  const dueForOutcome = scheduled.filter((s) => s.schedule!.date <= today);
  const upcoming = scheduled.filter((s) => s.schedule!.date > today);

  if (loading) return <ActivityIndicator style={{ marginTop: 24 }} />;

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  const renderCard = (s: SeminarRow, action: React.ReactNode) => {
    const missed = s.attempts.filter((a) => a.outcome === 'not_performed');
    return (
      <View key={s.milestoneId} style={{ backgroundColor: ap.surfaceContainerLowest, borderRadius: 12, borderWidth: 1, borderColor: ap.outlineVariant, borderLeftWidth: 4, borderLeftColor: SEMINAR_COLOR, padding: 12, marginBottom: 10 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: ap.onSurface, textAlign }}>{lang === 'he' ? s.projectTitleHe : s.projectTitleEn}</Text>
        <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, marginTop: 2, textAlign }}>
          👤 {s.students.map((st) => st.name).join(', ')}{s.supervisorName ? ` · 👨‍🏫 ${s.supervisorName}` : ''}
        </Text>
        {!!s.schedule && (
          <Text style={{ fontSize: 12, fontWeight: '700', color: SEMINAR_COLOR, marginTop: 4, textAlign }}>
            📅 {formatSeminarDay(s.schedule.date, lang)} · 🕐 {s.schedule.time}{s.schedule.location ? ` · 🏫 ${s.schedule.location}` : ''}
          </Text>
        )}
        {missed.length > 0 && (
          <Text style={{ fontSize: 12, color: '#A8433A', marginTop: 4, textAlign }}>
            ✗ {lang === 'he' ? 'לא בוצע במועד:' : 'Not performed on:'} {missed.map((a) => formatSeminarDay(a.date, lang, { day: 'numeric', month: 'numeric', year: '2-digit' })).join(', ')}
          </Text>
        )}
        {s.contactRequests.map((r) => (
          <View key={r.id} style={{ backgroundColor: ap.surfaceContainerLow, borderRadius: 8, padding: 8, marginTop: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: ap.onSurface, textAlign }}>✉️ {r.studentName}</Text>
            <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, marginTop: 2, textAlign }}>{r.message}</Text>
          </View>
        ))}
        <View style={{ marginTop: 8 }}>{action}</View>
      </View>
    );
  };

  const primaryButton = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ backgroundColor: SEMINAR_COLOR, borderRadius: 10, paddingVertical: 9 }}>
      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );

  const sectionTitle = (title: string, count: number) => (
    <Text style={{ fontSize: 14, fontWeight: '700', color: ap.onSurface, marginBottom: 8, marginTop: 6, textAlign }}>{title} ({count})</Text>
  );

  return (
    <View>
      <View style={{ backgroundColor: ap.surfaceContainerLowest, borderRadius: 12, borderWidth: 1, borderColor: ap.outlineVariant, padding: 10, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => setMonth(new Date(year, monthIndex - 1, 1))} hitSlop={8} accessibilityRole="button" accessibilityLabel={lang === 'he' ? 'חודש קודם' : 'Previous month'}>
            <Text style={{ fontSize: 18, color: ap.onSurfaceVariant, paddingHorizontal: 8 }}>‹</Text>
          </Pressable>
          <Text style={{ fontSize: 14, fontWeight: '700', color: ap.onSurface }}>
            {month.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { month: 'long', year: 'numeric' })}
          </Text>
          <Pressable onPress={() => setMonth(new Date(year, monthIndex + 1, 1))} hitSlop={8} accessibilityRole="button" accessibilityLabel={lang === 'he' ? 'חודש הבא' : 'Next month'}>
            <Text style={{ fontSize: 18, color: ap.onSurfaceVariant, paddingHorizontal: 8 }}>›</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 4, marginBottom: 6 }}>
          <Text style={{ fontSize: 11, color: SEMINAR_COLOR, fontWeight: '700' }}>● {lang === 'he' ? 'סמינר' : 'Seminar'}</Text>
          <Text style={{ fontSize: 11, color: DEFENSE_CALENDAR_COLOR, fontWeight: '700' }}>● {lang === 'he' ? 'הגנה' : 'Defense'}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {Array.from({ length: cellCount }, (_, i) => {
            const dayNum = i - firstWeekday + 1;
            const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
            const key = inMonth ? `${year}-${pad(monthIndex + 1)}-${pad(dayNum)}` : '';
            const markers = inMonth ? markersByDay.get(key) : undefined;
            const selected = inMonth && key === selectedDay;
            return (
              <Pressable
                key={i}
                disabled={!inMonth}
                onPress={() => setSelectedDay(selected ? '' : key)}
                accessibilityRole="button"
                accessibilityLabel={inMonth ? formatSeminarDay(key, lang) : undefined}
                style={{ width: `${100 / 7}%`, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: selected ? `${SEMINAR_COLOR}22` : 'transparent' }}
              >
                {inMonth && (
                  <>
                    <Text style={{ fontSize: 12, fontWeight: key === today ? '800' : '400', color: ap.onSurface }}>{dayNum}</Text>
                    <View style={{ flexDirection: 'row', gap: 2, height: 6, marginTop: 2 }}>
                      {markers?.seminar && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: SEMINAR_COLOR }} />}
                      {markers?.defense && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: DEFENSE_CALENDAR_COLOR }} />}
                    </View>
                  </>
                )}
              </Pressable>
            );
          })}
        </View>
        {!!selectedDay && selectedDay >= today && awaiting.length > 0 && (
          <Text style={{ fontSize: 11, color: ap.onSurfaceVariant, marginTop: 6, textAlign: 'center' }}>
            {lang === 'he' ? `נבחר ${formatSeminarDay(selectedDay, lang)} — "קביעת מועד" למטה ישתמש בו` : `${formatSeminarDay(selectedDay, lang)} selected — "Set date" below will use it`}
          </Text>
        )}
      </View>

      {dueForOutcome.length > 0 && sectionTitle(lang === 'he' ? 'יש לאשר אם הסמינר בוצע' : 'Confirm whether the seminar took place', dueForOutcome.length)}
      {dueForOutcome.map((s) => renderCard(s, primaryButton(`✅ ${lang === 'he' ? 'סימון ביצוע' : 'Record outcome'}`, () => setOutcomeTarget(s))))}

      {awaiting.length > 0 && sectionTitle(lang === 'he' ? 'ממתינים לקביעת מועד' : 'Waiting for a date', awaiting.length)}
      {awaiting.map((s) => renderCard(s, primaryButton(`📅 ${lang === 'he' ? 'קביעת מועד' : 'Set date'}`, () => setDateTarget({ seminar: s, date: selectedDay >= today ? selectedDay : '' }))))}

      {upcoming.length > 0 && sectionTitle(lang === 'he' ? 'מועדים שנקבעו' : 'Scheduled', upcoming.length)}
      {upcoming.map((s) => renderCard(s, primaryButton(`✏️ ${lang === 'he' ? 'שינוי מועד' : 'Change date'}`, () => setDateTarget({ seminar: s, date: s.schedule!.date }))))}

      {awaiting.length === 0 && scheduled.length === 0 && (
        <Text style={{ fontSize: 13, color: ap.onSurfaceVariant, textAlign: 'center', marginTop: 16 }}>
          ✅ {lang === 'he' ? 'אין סמינרים הממתינים לטיפול' : 'No seminars need attention'}
        </Text>
      )}

      {dateTarget && (
        <SeminarDateModal
          seminar={dateTarget.seminar}
          initialDate={dateTarget.date}
          lang={lang}
          isRtl={isRtl}
          onClose={() => setDateTarget(null)}
          onSaved={() => { setDateTarget(null); fetchSeminars(); }}
        />
      )}
      {outcomeTarget && (
        <SeminarOutcomeModal
          seminar={outcomeTarget}
          lang={lang}
          isRtl={isRtl}
          onClose={() => setOutcomeTarget(null)}
          onSaved={async (performed) => {
            const seminar = outcomeTarget;
            setOutcomeTarget(null);
            await fetchSeminars();
            // Not performed means a new date is mandatory — go straight to it.
            if (!performed) setDateTarget({ seminar: { ...seminar, schedule: null }, date: '' });
          }}
        />
      )}
    </View>
  );
}

function SeminarDateModal({ seminar, initialDate, lang, isRtl, onClose, onSaved }: {
  seminar: SeminarRow;
  initialDate: string;
  lang: 'he' | 'en';
  isRtl: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(seminar.schedule?.time ?? '');
  const [location, setLocation] = useState(seminar.schedule?.location ?? '');
  const [note, setNote] = useState(seminar.schedule?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const textAlign = isRtl ? 'right' : 'left';

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await apiClient.post(`/api/coordinator/seminars/${seminar.milestoneId}/schedule`, { date: date.trim(), time: time.trim(), location, note });
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? (lang === 'he' ? 'השמירה נכשלה' : 'Failed to save'));
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 }}>
        <View style={{ backgroundColor: ap.surfaceContainerLowest, borderRadius: 16, padding: 18 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: ap.onSurface, textAlign }}>📅 {lang === 'he' ? 'קביעת מועד סמינר' : 'Set seminar date'}</Text>
          <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, marginTop: 4, textAlign }}>👤 {seminar.students.map((s) => s.name).join(', ')}</Text>
          <Text style={{ fontSize: 12, color: ap.onSurface, marginTop: 10, textAlign }}>{lang === 'he' ? 'תאריך (YYYY-MM-DD)' : 'Date (YYYY-MM-DD)'}</Text>
          <TextInput accessibilityLabel={lang === 'he' ? 'תאריך (YYYY-MM-DD)' : 'Date (YYYY-MM-DD)'} value={date} onChangeText={setDate} placeholder="2026-12-01" autoCapitalize="none" style={inputStyle} />
          <Text style={{ fontSize: 12, color: ap.onSurface, marginTop: 8, textAlign }}>{lang === 'he' ? 'שעה (HH:MM)' : 'Time (HH:MM)'}</Text>
          <TextInput accessibilityLabel={lang === 'he' ? 'שעה (HH:MM)' : 'Time (HH:MM)'} value={time} onChangeText={setTime} placeholder="10:00" autoCapitalize="none" style={inputStyle} />
          <Text style={{ fontSize: 12, color: ap.onSurface, marginTop: 8, textAlign }}>{lang === 'he' ? 'מיקום (לא חובה)' : 'Location (optional)'}</Text>
          <TextInput accessibilityLabel={lang === 'he' ? 'מיקום (לא חובה)' : 'Location (optional)'} value={location} onChangeText={setLocation} maxLength={200} style={[inputStyle, { textAlign }]} />
          <Text style={{ fontSize: 12, color: ap.onSurface, marginTop: 8, textAlign }}>{lang === 'he' ? 'הערה לסטודנט/ית (לא חובה)' : 'Note to the student (optional)'}</Text>
          <TextInput accessibilityLabel={lang === 'he' ? 'הערה לסטודנט/ית (לא חובה)' : 'Note to the student (optional)'} value={note} onChangeText={setNote} maxLength={500} multiline style={[inputStyle, { textAlign }]} />
          {!!error && <Text style={{ fontSize: 12, color: '#A8433A', marginTop: 6, textAlign }}>{error}</Text>}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Pressable onPress={onClose} accessibilityRole="button" style={{ flex: 1, borderWidth: 1, borderColor: ap.outlineVariant, borderRadius: 10, paddingVertical: 10 }}>
              <Text style={{ textAlign: 'center', fontSize: 13, fontWeight: '600', color: ap.onSurface }}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
            </Pressable>
            <Pressable onPress={save} disabled={saving} accessibilityRole="button" style={{ flex: 1, backgroundColor: SEMINAR_COLOR, borderRadius: 10, paddingVertical: 10, opacity: saving ? 0.6 : 1 }}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ textAlign: 'center', fontSize: 13, fontWeight: '700', color: '#fff' }}>{lang === 'he' ? 'שמירה ושליחה' : 'Save and notify'}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SeminarOutcomeModal({ seminar, lang, isRtl, onClose, onSaved }: {
  seminar: SeminarRow;
  lang: 'he' | 'en';
  isRtl: boolean;
  onClose: () => void;
  onSaved: (performed: boolean) => void;
}) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const textAlign = isRtl ? 'right' : 'left';

  const save = async (performed: boolean) => {
    setSaving(true);
    setError('');
    try {
      await apiClient.post(`/api/coordinator/seminars/${seminar.milestoneId}/outcome`, { performed, note });
      onSaved(performed);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? (lang === 'he' ? 'השמירה נכשלה' : 'Failed to save'));
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 }}>
        <View style={{ backgroundColor: ap.surfaceContainerLowest, borderRadius: 16, padding: 18 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: ap.onSurface, textAlign }}>{lang === 'he' ? 'האם הסמינר התקיים?' : 'Did the seminar take place?'}</Text>
          <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, marginTop: 4, textAlign }}>👤 {seminar.students.map((s) => s.name).join(', ')}</Text>
          {!!seminar.schedule && (
            <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, marginTop: 2, textAlign }}>📅 {formatSeminarDay(seminar.schedule.date, lang)} · 🕐 {seminar.schedule.time}</Text>
          )}
          <Text style={{ fontSize: 12, color: ap.onSurface, marginTop: 10, textAlign }}>{lang === 'he' ? 'הערה (לא חובה)' : 'Note (optional)'}</Text>
          <TextInput accessibilityLabel={lang === 'he' ? 'הערה (לא חובה)' : 'Note (optional)'} value={note} onChangeText={setNote} maxLength={500} multiline style={[inputStyle, { textAlign }]} />
          {!!error && <Text style={{ fontSize: 12, color: '#A8433A', marginTop: 6, textAlign }}>{error}</Text>}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Pressable onPress={() => save(true)} disabled={saving} accessibilityRole="button" style={{ flex: 1, backgroundColor: '#3F6B4C', borderRadius: 10, paddingVertical: 10, opacity: saving ? 0.6 : 1 }}>
              <Text style={{ textAlign: 'center', fontSize: 13, fontWeight: '700', color: '#fff' }}>✅ {lang === 'he' ? 'בוצע' : 'Performed'}</Text>
            </Pressable>
            <Pressable onPress={() => save(false)} disabled={saving} accessibilityRole="button" style={{ flex: 1, backgroundColor: '#A8433A', borderRadius: 10, paddingVertical: 10, opacity: saving ? 0.6 : 1 }}>
              <Text style={{ textAlign: 'center', fontSize: 13, fontWeight: '700', color: '#fff' }}>✗ {lang === 'he' ? 'לא בוצע' : 'Not performed'}</Text>
            </Pressable>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" style={{ marginTop: 10 }}>
            <Text style={{ textAlign: 'center', fontSize: 13, color: ap.onSurfaceVariant }}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
