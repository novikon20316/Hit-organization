// app/(tabs)/Reports.tsx
//
// The reports suite (requirements doc section 12) — see
// server/src/services/reports.ts / reportsController.ts. One screen covering
// all 9 report types: a selector, a light filter bar, a generic row list
// (each report shapes its rows differently, so this picks a curated set of
// display fields per type rather than one fixed table), and an Excel export
// button that mirrors the same filters.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, TextInput, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../src/firebase/firebase';
import type { Lang } from '../../components/i18n';
import { TopBar } from '../../components/shared';
import { apiClient } from '../../src/api/apiClient';
import { fetchReport, exportReport, type ReportType } from '../../src/api/reports';

// ─── Report type catalog ───────────────────────────────────────────────────────

interface ReportDef {
  key: ReportType;
  he: string;
  en: string;
  fields: { key: string; he: string; en: string }[];
}

const REPORTS: ReportDef[] = [
  {
    key: 'full-status', he: 'דוח סטטוס מלא', en: 'Full Status Report',
    fields: [
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'facultyNameHe', he: 'פקולטה', en: 'Faculty' },
      { key: 'advisorName', he: 'מנחה', en: 'Advisor' },
      { key: 'currentMilestoneNameHe', he: 'אבן דרך נוכחית', en: 'Current Milestone' },
      { key: 'daysInStage', he: 'ימים בשלב', en: 'Days in Stage' },
      { key: 'isOverdue', he: 'חריגה', en: 'Overdue' },
    ],
  },
  {
    key: 'no-advisor', he: 'ללא מנחה/נושא', en: 'No Advisor/Topic',
    fields: [
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'facultyNameHe', he: 'פקולטה', en: 'Faculty' },
      { key: 'daysInStage', he: 'ימים בשלב', en: 'Days in Stage' },
    ],
  },
  {
    key: 'proposal-delay', he: 'עיכוב בהצעת מחקר', en: 'Proposal Delay',
    fields: [
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'advisorName', he: 'מנחה', en: 'Advisor' },
      { key: 'daysInStage', he: 'ימים בשלב', en: 'Days in Stage' },
      { key: 'isOverdue', he: 'חריגה', en: 'Overdue' },
    ],
  },
  {
    key: 'examiner-tracking', he: 'מעקב בוחנים', en: 'Examiner Tracking',
    fields: [
      { key: 'examinerName', he: 'בוחן', en: 'Examiner' },
      { key: 'examinerType', he: 'סוג', en: 'Type' },
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'daysElapsed', he: 'ימים שחלפו', en: 'Days Elapsed' },
      { key: 'opinionStatus', he: 'סטטוס חוו"ד', en: 'Opinion Status' },
      { key: 'exceptionLevel', he: 'רמת חריגה', en: 'Exception' },
    ],
  },
  {
    key: 'missing-closure', he: 'חוסרים לסגירת תואר', en: 'Missing for Closure',
    fields: [
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'advisorName', he: 'מנחה', en: 'Advisor' },
      { key: 'missing', he: 'חסר', en: 'Missing' },
    ],
  },
  {
    key: 'stuck-students', he: 'סטודנטים תקועים', en: 'Stuck Students',
    fields: [
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'facultyNameHe', he: 'פקולטה', en: 'Faculty' },
      { key: 'currentMilestoneNameHe', he: 'אבן דרך', en: 'Milestone' },
      { key: 'daysInStage', he: 'ימים בשלב', en: 'Days in Stage' },
    ],
  },
  {
    key: 'statute-exceedance', he: 'חריגת שנות תקן', en: 'Statute-Year Exceedance',
    fields: [
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'advisorName', he: 'מנחה', en: 'Advisor' },
      { key: 'expectedCompletionDate', he: 'תאריך סיום צפוי', en: 'Expected Completion' },
      { key: 'yearsOverdue', he: 'שנות חריגה', en: 'Years Overdue' },
    ],
  },
  {
    key: 'load', he: 'עומס הנחיה ובחינה', en: 'Advising/Examining Load',
    fields: [
      { key: 'personName', he: 'שם', en: 'Name' },
      { key: 'role', he: 'תפקיד', en: 'Role' },
      { key: 'activeCount', he: 'פעילים', en: 'Active' },
      { key: 'pendingReviewCount', he: 'ממתינים', en: 'Pending' },
    ],
  },
  {
    key: 'repository', he: 'מאגר עבודות', en: 'Repository',
    fields: [
      { key: 'projectTitleHe', he: 'כותרת', en: 'Title' },
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'advisorName', he: 'מנחה', en: 'Advisor' },
      { key: 'finalGrade', he: 'ציון סופי', en: 'Final Grade' },
    ],
  },
];

function displayValue(v: any): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? '✓' : '—';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Reports() {
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';

  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState<string | null>(null);

  const [activeReport, setActiveReport] = useState<ReportType>('full-status');
  const [startYear, setStartYear] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<{ threshold?: number } | null>(null);

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const res = await apiClient.get('/api/users/profile');
        setUserName(res.data.displayName || '');
        setUserRole(res.data.role || null);
      } catch (err) {
        console.error('Reports: failed to load profile', err);
      }
    })();
  }, [uid]);

  const filters = {
    startYear: startYear ? Number(startYear) : undefined,
    overdueOnly: overdueOnly || undefined,
  };

  const load = useCallback(async () => {
    if (!uid) return; // no session yet (or signed out) — nothing to fetch
    setLoading(true);
    try {
      const data = await fetchReport(activeReport, filters);
      if (activeReport === 'stuck-students') {
        setRows(data.students ?? []);
        setMeta({ threshold: data.threshold });
      } else {
        setRows(Array.isArray(data) ? data : []);
        setMeta(null);
      }
    } catch (err) {
      console.error('Reports: failed to load report', err);
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'טעינת הדוח נכשלה' : 'Failed to load the report');
      setRows([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, activeReport, startYear, overdueOnly, lang]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportReport(activeReport, filters);
    } catch (e: any) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', e.message || (lang === 'he' ? 'הייצוא נכשל' : 'Export failed'));
    } finally {
      setExporting(false);
    }
  };

  const def = REPORTS.find((r) => r.key === activeReport)!;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F0F4FF' }}>
      <TopBar
        name={userName}
        role={(userRole as any) ?? 'coordinator'}
        lang={lang}
        isRtl={isRtl}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
      />

      {/* Report type selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, paddingTop: 12, flexGrow: 0 }}>
        {REPORTS.map((r) => (
          <Pressable
            key={r.key}
            style={{
              borderWidth: 1.5, borderColor: activeReport === r.key ? '#2E86FF' : '#D0DEFF',
              backgroundColor: activeReport === r.key ? '#2E86FF' : '#fff',
              borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8,
            }}
            onPress={() => setActiveReport(r.key)}
          >
            <Text style={{ color: activeReport === r.key ? '#fff' : '#2E86FF', fontWeight: '600', fontSize: 13 }}>
              {lang === 'he' ? r.he : r.en}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Filter bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
        <TextInput
          style={{ borderWidth: 1.5, borderColor: '#D0DEFF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, width: 110, backgroundColor: '#fff' }}
          value={startYear}
          onChangeText={setStartYear}
          keyboardType="numeric"
          placeholder={lang === 'he' ? 'שנת התחלה' : 'Start year'}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 13, color: '#445' }}>{lang === 'he' ? 'חריגה בלבד' : 'Overdue only'}</Text>
          <Switch value={overdueOnly} onValueChange={setOverdueOnly} trackColor={{ true: '#2E86FF' }} />
        </View>
      </View>

      {/* Export button */}
      <Pressable
        style={{ marginHorizontal: 16, marginTop: 12, backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 10, alignItems: 'center', opacity: exporting ? 0.6 : 1 }}
        onPress={handleExport}
        disabled={exporting}
      >
        {exporting
          ? <ActivityIndicator color="#fff" />
          : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>📤 {lang === 'he' ? 'ייצוא לאקסל' : 'Export to Excel'}</Text>
        }
      </Pressable>

      {meta?.threshold != null && (
        <Text style={{ paddingHorizontal: 16, paddingTop: 10, fontSize: 12, color: '#8899BB' }}>
          {lang === 'he' ? `סף "תקוע": ${meta.threshold} ימים` : `"Stuck" threshold: ${meta.threshold} days`}
        </Text>
      )}

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#2E86FF" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {rows.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Text style={{ fontSize: 40, marginBottom: 10 }}>📭</Text>
              <Text style={{ fontSize: 14, color: '#8899BB' }}>{lang === 'he' ? 'אין נתונים' : 'No data'}</Text>
            </View>
          ) : (
            rows.map((row, idx) => (
              <View key={idx} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E0E8FF' }}>
                {def.fields.map((f) => (
                  <View key={f.key} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                    <Text style={{ fontSize: 12, color: '#8899BB' }}>{lang === 'he' ? f.he : f.en}</Text>
                    <Text style={{ fontSize: 13, color: '#111', fontWeight: '600', flexShrink: 1, textAlign: isRtl ? 'left' : 'right' }}>
                      {displayValue(row[f.key])}
                    </Text>
                  </View>
                ))}
              </View>
            ))
          )}
          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
