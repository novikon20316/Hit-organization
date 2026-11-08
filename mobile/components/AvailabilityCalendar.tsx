// components/AvailabilityCalendar.tsx
// E2 — pick defense availability on a month calendar instead of typing
// YYYY-MM-DD dates one by one. Mobile counterpart of web's
// components/AvailabilityCalendar.tsx: tap days to toggle; Fri/Sat, past
// days and days outside the scheduling window are disabled (the server
// re-checks — defenseScheduling.ts's validateCandidateDates). Dates are
// plain 'YYYY-MM-DD' strings computed in UTC so no time zone shifts a day.
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { Lang } from './i18n';

interface Props {
  lang: Lang;
  windowStart: string | null;
  windowEnd: string | null;
  selected: string[];
  onChange: (dates: string[]) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (s: string) => new Date(`${s}T00:00:00Z`);

function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const WEEKDAYS = { he: ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'], en: ['S', 'M', 'T', 'W', 'T', 'F', 'S'] };
const PRIMARY = '#2E86FF';

export function AvailabilityCalendar({ lang, windowStart, windowEnd, selected, onChange }: Props) {
  const he = lang === 'he';
  const today = todayYmd();
  const min = windowStart && windowStart > today ? windowStart : today;
  const max = windowEnd;
  const firstMonth = parse(min.slice(0, 8) + '01');
  const lastMonth = max ? parse(max.slice(0, 8) + '01') : null;
  const [month, setMonth] = useState(firstMonth);

  const selectable = (d: string) => {
    const day = parse(d).getUTCDay();
    return day !== 5 && day !== 6 && d >= min && (!max || d <= max);
  };

  const weeks = useMemo(() => {
    const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
    const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
    const cells: Array<string | null> = Array.from({ length: first.getUTCDay() }, () => null);
    for (let i = 1; i <= daysInMonth; i++) cells.push(ymd(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), i))));
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: Array<Array<string | null>> = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [month]);

  const toggle = (d: string) => onChange(selected.includes(d) ? selected.filter((x) => x !== d) : [...selected, d].sort());
  const monthSelectable = weeks.flat().filter((d): d is string => !!d && selectable(d));
  const allMonthSelected = monthSelectable.length > 0 && monthSelectable.every((d) => selected.includes(d));
  const shiftMonth = (delta: number) => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + delta, 1)));
  const canPrev = month > firstMonth;
  const canNext = !lastMonth || month < lastMonth;
  // Calendar columns always run Sunday → Saturday in reading order.
  const row = he ? 'row-reverse' : 'row';

  return (
    <View style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 8, backgroundColor: '#fff', marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Pressable onPress={() => shiftMonth(he ? 1 : -1)} disabled={he ? !canNext : !canPrev} accessibilityRole="button" accessibilityLabel={he ? 'החודש הבא' : 'Previous month'} hitSlop={8} style={{ opacity: (he ? canNext : canPrev) ? 1 : 0.3, padding: 4 }}>
          <Text style={{ fontSize: 16 }}>‹</Text>
        </Pressable>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }} accessibilityLiveRegion="polite">
          {month.toLocaleDateString(he ? 'he-IL' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
        </Text>
        <Pressable onPress={() => shiftMonth(he ? -1 : 1)} disabled={he ? !canPrev : !canNext} accessibilityRole="button" accessibilityLabel={he ? 'החודש הקודם' : 'Next month'} hitSlop={8} style={{ opacity: (he ? canPrev : canNext) ? 1 : 0.3, padding: 4 }}>
          <Text style={{ fontSize: 16 }}>›</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: row }}>
        {WEEKDAYS[lang].map((w, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#6B7280' }}>{w}</Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: row, marginTop: 4 }}>
          {week.map((d, di) => {
            if (!d) return <View key={di} style={{ flex: 1, height: 34 }} />;
            const can = selectable(d);
            const on = selected.includes(d);
            return (
              <Pressable
                key={d}
                onPress={() => toggle(d)}
                disabled={!can}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: !can }}
                accessibilityLabel={parse(d).toLocaleDateString(he ? 'he-IL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}
                style={{ flex: 1, height: 34, marginHorizontal: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? PRIMARY : can ? '#F3F4F6' : 'transparent' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: on ? '#fff' : can ? '#111827' : '#D1D5DB' }}>{Number(d.slice(8))}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <Text style={{ fontSize: 12, color: '#6B7280' }}>{he ? `נבחרו ${selected.length} תאריכים` : `${selected.length} selected`}</Text>
        <View style={{ flexDirection: row, gap: 12 }}>
          {monthSelectable.length > 0 && (
            <Pressable
              onPress={() => onChange(allMonthSelected
                ? selected.filter((d) => !monthSelectable.includes(d))
                : [...new Set([...selected, ...monthSelectable])].sort())}
              accessibilityRole="button"
              hitSlop={6}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: PRIMARY }}>
                {allMonthSelected ? (he ? 'בטל את החודש' : 'Clear month') : (he ? 'כל החודש' : 'Whole month')}
              </Text>
            </Pressable>
          )}
          {selected.length > 0 && (
            <Pressable onPress={() => onChange([])} accessibilityRole="button" hitSlop={6}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#6B7280' }}>{he ? 'נקה' : 'Clear'}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
