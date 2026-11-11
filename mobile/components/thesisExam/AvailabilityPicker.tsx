// components/thesisExam/AvailabilityPicker.tsx
// One participant's picks for the CS thesis exam (server's
// services/thesisExam.ts): tap exactly N days of the round's window, then set
// the free hours on each with −/+ (15-minute steps). Mobile counterpart of
// web's components/thesisExam/AvailabilityPicker.tsx; the data source is
// passed in, so the outside examiner's access screen reuses it.

import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import type { ThesisExamAvailabilityEntry } from '@/src/api/apiClient';
import type { Lang } from '@/components/i18n';
import { C, formatExamDay } from './shared';

const pad = (n: number) => String(n).padStart(2, '0');
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h! * 60 + m!; };
const toClock = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const STEP = 15;

/** Israel's date and clock — the server's window and "already passed" check
 *  (services/thesisExam.ts validateAvailability) are in Asia/Jerusalem, so a
 *  device in another zone must offer the same days. Falls back to the device
 *  clock if this engine's Intl lacks time-zone support. */
export function israelNow(): { date: string; time: string } {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value]),
    );
    if (parts.year && parts.month && parts.day && parts.hour && parts.minute) {
      return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
    }
  } catch {
    // fall through to the device clock
  }
  const d = new Date();
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export function todayIso(): string {
  return israelNow().date;
}

export function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (d <= last) {
    out.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function Stepper({ label, value, onChange, lang }: { label: string; value: string; onChange: (v: string) => void; lang: Lang }) {
  const isRtl = lang === 'he';
  const step = (delta: number) => onChange(toClock(Math.min(23 * 60 + 45, Math.max(0, toMin(value) + delta))));
  const btn = { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: C.line, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: '#fff' };
  return (
    <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }}>
      <Text style={{ fontSize: 12, color: C.muted }}>{label}</Text>
      <Pressable onPress={() => step(-STEP)} style={btn} accessibilityRole="button" accessibilityLabel={`${label} −${STEP}`}><Text style={{ fontSize: 16, color: C.ink }}>−</Text></Pressable>
      <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink, minWidth: 46, textAlign: 'center' }} accessibilityLabel={`${label} ${value}`}>{value}</Text>
      <Pressable onPress={() => step(STEP)} style={btn} accessibilityRole="button" accessibilityLabel={`${label} +${STEP}`}><Text style={{ fontSize: 16, color: C.ink }}>+</Text></Pressable>
    </View>
  );
}

export function AvailabilityPicker({ lang, window, count, initial, onSubmit }: {
  lang: Lang;
  window: { start: string; end: string };
  count: number;
  initial: ThesisExamAvailabilityEntry[] | null;
  onSubmit: (entries: ThesisExamAvailabilityEntry[]) => Promise<void>;
}) {
  const he = lang === 'he';
  const isRtl = he;
  const today = todayIso();
  const min = today > window.start ? today : window.start;
  const days = useMemo(() => daysBetween(min, window.end), [min, window.end]);
  // Only days still inside the window — a saved pick whose day has passed
  // was invisible in the chips yet still counted and re-submitted.
  const [picks, setPicks] = useState<Record<string, { from: string; to: string }>>(() =>
    Object.fromEntries((initial ?? []).filter((e) => e.date >= min && e.date <= window.end).map((e) => [e.date, { from: e.from, to: e.to }])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const chosen = Object.keys(picks).sort();

  const toggle = (date: string) => {
    setSaved(false);
    setError('');
    if (picks[date]) {
      const { [date]: _gone, ...rest } = picks;
      setPicks(rest);
    } else if (chosen.length >= count) {
      setError(he ? `ניתן לבחור ${count} תאריכים בלבד — יש לבטל תאריך קודם.` : `You can pick only ${count} dates — unselect one first.`);
    } else {
      setPicks({ ...picks, [date]: { from: '09:00', to: '12:00' } });
    }
  };

  // Per-day problem, shown on that day's block (red frame + message) as soon
  // as it exists — not only as one line under the whole picker.
  const now = israelNow();
  const dayIssue = (d: string): string | null => {
    const pk = picks[d];
    if (!pk) return null;
    if (d < now.date || d > window.end) return he ? 'התאריך מחוץ לטווח המותר — יש לבטל אותו ולבחור אחר.' : 'This date is outside the allowed range — unselect it and pick another.';
    if (toMin(pk.to) <= toMin(pk.from)) return he ? 'שעת הסיום חייבת להיות אחרי שעת ההתחלה.' : 'The end time must be after the start time.';
    if (d === now.date && toMin(pk.to) <= toMin(now.time)) return he ? 'השעות שנבחרו להיום כבר עברו.' : 'The hours picked for today have already passed.';
    return null;
  };
  const badDays = chosen.filter((d) => dayIssue(d));

  const submit = async () => {
    if (chosen.length !== count) { setError(he ? `יש לבחור בדיוק ${count} תאריכים.` : `Pick exactly ${count} dates.`); return; }
    if (badDays.length > 0) { setError(he ? 'יש לתקן את התאריכים המסומנים באדום.' : 'Fix the dates marked in red.'); return; }
    setBusy(true);
    setError('');
    try {
      await onSubmit(chosen.map((date) => ({ date, ...picks[date]! })));
      setSaved(true);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? (he ? 'השמירה נכשלה' : 'Saving failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginTop: 10, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, backgroundColor: C.paper }}>
      <Text style={{ fontSize: 12, color: C.muted, textAlign: isRtl ? 'right' : 'left' }}>
        {he
          ? `בחר/י ${count} תאריכים (${chosen.length}/${count}), ובכל אחד את השעות שבהן את/ה פנוי/ה. המערכת תקבע את המועד המשותף לכולם.`
          : `Pick ${count} dates (${chosen.length}/${count}) and the hours you're free on each. The system sets the time everyone shares.`}
      </Text>
      <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {days.map((d) => {
          const on = !!picks[d];
          return (
            <Pressable
              key={d}
              onPress={() => toggle(d)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={formatExamDay(d, lang, { weekday: 'long', day: 'numeric', month: 'long' })}
              style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primary : '#fff' }}
            >
              <Text style={{ fontSize: 12, fontWeight: on ? '700' : '500', color: on ? '#fff' : C.ink }}>{formatExamDay(d, lang)}</Text>
            </Pressable>
          );
        })}
      </View>
      {chosen.map((d) => (
        <View
          key={d}
          style={dayIssue(d)
            ? { marginTop: 10, padding: 8, borderWidth: 1.5, borderColor: C.danger, borderRadius: 8, backgroundColor: C.dangerBg, gap: 6 }
            : { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.line, gap: 6 }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: dayIssue(d) ? C.danger : C.ink, textAlign: isRtl ? 'right' : 'left' }}>
            {formatExamDay(d, lang, { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 12 }}>
            <Stepper lang={lang} label={he ? 'משעה' : 'From'} value={picks[d]!.from} onChange={(v) => { setSaved(false); setError(''); setPicks((p) => ({ ...p, [d]: { ...p[d]!, from: v } })); }} />
            <Stepper lang={lang} label={he ? 'עד' : 'To'} value={picks[d]!.to} onChange={(v) => { setSaved(false); setError(''); setPicks((p) => ({ ...p, [d]: { ...p[d]!, to: v } })); }} />
          </View>
          {!!dayIssue(d) && (
            <Text style={{ fontSize: 12, color: C.danger, textAlign: isRtl ? 'right' : 'left' }}>⚠ {dayIssue(d)}</Text>
          )}
        </View>
      ))}
      {!!error && <Text style={{ marginTop: 8, fontSize: 12, color: C.danger, textAlign: isRtl ? 'right' : 'left' }} accessibilityRole="alert">{error}</Text>}
      {saved && !error && (
        <Text style={{ marginTop: 8, fontSize: 12, color: C.success, textAlign: isRtl ? 'right' : 'left' }}>
          {he ? '✓ התאריכים נשמרו. ניתן לעדכן עד שכולם יבחרו.' : '✓ Dates saved. You can update them until everyone has picked.'}
        </Text>
      )}
      <Pressable
        onPress={submit}
        disabled={busy}
        accessibilityRole="button"
        style={{ marginTop: 10, backgroundColor: C.primary, borderRadius: 20, paddingVertical: 9, alignItems: 'center', opacity: busy ? 0.6 : 1 }}
      >
        {busy ? <ActivityIndicator color="#fff" size="small" /> : (
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>
            {initial ? (he ? 'עדכון התאריכים' : 'Update my dates') : (he ? 'שליחת התאריכים' : 'Submit my dates')}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
