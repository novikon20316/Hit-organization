// app/(tabs)/Reports.tsx
//
// The reports suite (requirements doc section 12) — see
// server/src/services/reports.ts / reportsController.ts. One screen covering
// all 10 report types: a block-card selector (name + short description per
// report, ported from web/app/reports), a light filter bar, a generic row
// list (each report shapes its rows differently, so this picks a curated set
// of display fields per type rather than one fixed table), and an Excel
// export button that mirrors the same filters.

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
  /** Short one-line explanation shown on the report's selector block. */
  heDesc: string;
  enDesc: string;
  fields: { key: string; he: string; en: string }[];
}

const REPORTS: ReportDef[] = [
  {
    key: 'full-status', he: 'דוח סטטוס מלא', en: 'Full Status Report',
    heDesc: 'כל הסטודנטים הפעילים, השלב הנוכחי שלהם וכמה זמן הם נמצאים בו',
    enDesc: 'Every active student, their current stage, and how long they’ve been there',
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
    heDesc: 'סטודנטים שעדיין לא שובצו למנחה או נושא מעבר לזמן הסביר',
    enDesc: 'Students still without an assigned advisor or topic beyond the normal grace period',
    fields: [
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'facultyNameHe', he: 'פקולטה', en: 'Faculty' },
      { key: 'daysInStage', he: 'ימים בשלב', en: 'Days in Stage' },
    ],
  },
  {
    key: 'proposal-delay', he: 'עיכוב בהצעת מחקר', en: 'Proposal Delay',
    heDesc: 'סטודנטים שמתעכבים בשלב הצעת המחקר',
    enDesc: 'Students who are delayed at the research-proposal stage',
    fields: [
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'advisorName', he: 'מנחה', en: 'Advisor' },
      { key: 'daysInStage', he: 'ימים בשלב', en: 'Days in Stage' },
      { key: 'isOverdue', he: 'חריגה', en: 'Overdue' },
    ],
  },
  {
    key: 'examiner-tracking', he: 'מעקב בוחנים', en: 'Examiner Tracking',
    heDesc: 'מעקב אחר בוחנים פנימיים וחיצוניים וסטטוס חוות הדעת שלהם',
    enDesc: 'Tracks internal and external examiners and the status of their opinions',
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
    heDesc: 'מה חסר לכל סטודנט כדי לסגור את התואר',
    enDesc: 'What’s still missing for each student to close out their degree',
    fields: [
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'advisorName', he: 'מנחה', en: 'Advisor' },
      { key: 'missing', he: 'חסר', en: 'Missing' },
    ],
  },
  {
    key: 'stuck-students', he: 'סטודנטים תקועים', en: 'Stuck Students',
    heDesc: 'סטודנטים שחרגו מסף הזמן הסביר בשלב הנוכחי שלהם',
    enDesc: 'Students who’ve exceeded the normal time threshold at their current stage',
    fields: [
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'facultyNameHe', he: 'פקולטה', en: 'Faculty' },
      { key: 'currentMilestoneNameHe', he: 'אבן דרך', en: 'Milestone' },
      { key: 'daysInStage', he: 'ימים בשלב', en: 'Days in Stage' },
    ],
  },
  {
    key: 'statute-exceedance', he: 'חריגת שנות תקן', en: 'Statute-Year Exceedance',
    heDesc: 'סטודנטים שחרגו ממשך הלימודים התקני לתואר שלהם',
    enDesc: 'Students who’ve exceeded the statutory length of their program',
    fields: [
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'advisorName', he: 'מנחה', en: 'Advisor' },
      { key: 'expectedCompletionDate', he: 'תאריך סיום צפוי', en: 'Expected Completion' },
      { key: 'yearsOverdue', he: 'שנות חריגה', en: 'Years Overdue' },
    ],
  },
  {
    key: 'load', he: 'עומס הנחיה ובחינה', en: 'Advising/Examining Load',
    heDesc: 'עומס ההנחיה והבחינה הנוכחי של כל מנחה ובוחן',
    enDesc: 'Each advisor’s and examiner’s current advising/examining load',
    fields: [
      { key: 'personName', he: 'שם', en: 'Name' },
      { key: 'role', he: 'תפקיד', en: 'Role' },
      { key: 'activeCount', he: 'פעילים', en: 'Active' },
      { key: 'pendingReviewCount', he: 'ממתינים', en: 'Pending' },
    ],
  },
  {
    key: 'repository', he: 'מאגר עבודות', en: 'Repository',
    heDesc: 'עבודות שהושלמו והציונים הסופיים שלהן',
    enDesc: 'Completed works and their final grades',
    fields: [
      { key: 'projectTitleHe', he: 'כותרת', en: 'Title' },
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'advisorName', he: 'מנחה', en: 'Advisor' },
      { key: 'finalGrade', he: 'ציון סופי', en: 'Final Grade' },
    ],
  },
  {
    // PLACEHOLDER — name/description not yet supplied by the user (they said
    // they'll provide it separately). Fields mirror web/app/reports/types.ts's
    // grade-export entry exactly — keep the two in sync if either changes.
    key: 'grade-export', he: 'דוח חדש (שם בהמתנה)', en: 'New Report (name pending)',
    heDesc: 'התיאור יתעדכן בהמשך',
    enDesc: 'Description to be added',
    fields: [
      { key: 'studentName', he: 'שם מלא', en: 'Full Name' },
      { key: 'studentIdNumber', he: 'ת.ז.', en: 'ID' },
      { key: 'projectTitleHe', he: 'שם פרויקט/תזה', en: 'Project/Thesis Name' },
      { key: 'advisorName', he: 'שם המנחה', en: 'Supervisor’s Name' },
      { key: 'startYearHebrew', he: 'שנה', en: 'Year' },
      { key: 'projectStatus', he: 'סטטוס', en: 'Status' },
      { key: 'finalGrade', he: 'ציון', en: 'Grade' },
    ],
  },
];

function displayValue(v: any): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? '✓' : '—';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

// ─── Extra filters (backend already supports all of these — see
// services/reports.ts's ReportFilters — this screen just wasn't exposing
// them yet). Kept behind a "More filters" toggle so the default screen
// stays as compact as before. ──────────────────────────────────────────────
const DEGREE_TYPES = ['bachelors', 'masters'] as const;
const PROJECT_TYPES = ['project', 'thesis'] as const;
const MILESTONE_TYPES = ['research_proposal', 'progress_report', 'final_report', 'defense'] as const;
const PROCESS_STATUSES = ['active', 'in_progress', 'completed', 'withdrawn', 'admin_closed'] as const;

const DEGREE_TYPE_LABEL: Record<string, { he: string; en: string }> = {
  bachelors: { he: 'תואר ראשון', en: 'Bachelor’s' },
  masters: { he: 'תואר שני', en: 'Master’s' },
};
const PROJECT_TYPE_LABEL: Record<string, { he: string; en: string }> = {
  project: { he: 'פרויקט', en: 'Project' },
  thesis: { he: 'תזה', en: 'Thesis' },
};
const MILESTONE_TYPE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר', en: 'Proposal' },
  progress_report: { he: 'דו"ח התקדמות', en: 'Progress' },
  final_report: { he: 'דו"ח מסכם', en: 'Final Report' },
  defense: { he: 'הגנה', en: 'Defense' },
};
const PROCESS_STATUS_LABEL: Record<string, { he: string; en: string }> = {
  active: { he: 'פעיל', en: 'Active' },
  in_progress: { he: 'בתהליך', en: 'In Progress' },
  completed: { he: 'הושלם', en: 'Completed' },
  withdrawn: { he: 'פרש/ה', en: 'Withdrawn' },
  admin_closed: { he: 'נסגר מנהלתית', en: 'Admin Closed' },
};
const FACULTY_LABEL: Record<string, { he: string; en: string }> = {
  sciences: { he: 'מדעים', en: 'Sciences' },
  electrical: { he: 'הנדסת חשמל', en: 'Electrical Eng.' },
  industrial: { he: 'הנדסת תעשייה', en: 'Industrial Eng.' },
  learning_tech: { he: 'טכנולוגיות למידה', en: 'Learning Tech' },
  medical_tech: { he: 'טכנולוגיות רפואיות', en: 'Medical Tech' },
  design: { he: 'עיצוב', en: 'Design' },
  data_science: { he: 'מדעי הנתונים', en: 'Data Science' },
};

function FilterPillRow({
  options, value, onChange, labelFor,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  labelFor: (v: string) => string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 8 }}>
      {options.map((opt) => (
        <Pressable
          key={opt}
          onPress={() => onChange(value === opt ? '' : opt)}
          style={{
            borderWidth: 1.5, borderColor: value === opt ? '#2E86FF' : '#D0DEFF',
            backgroundColor: value === opt ? '#2E86FF' : '#fff',
            borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6,
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: value === opt }}
        >
          <Text style={{ color: value === opt ? '#fff' : '#2E86FF', fontWeight: '600', fontSize: 12 }}>
            {labelFor(opt)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Reports() {
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';

  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userFacultyId, setUserFacultyId] = useState<string | null>(null);
  const [userGradSchoolHeadFacultyIds, setUserGradSchoolHeadFacultyIds] = useState<string[]>([]);

  const [activeReport, setActiveReport] = useState<ReportType>('full-status');
  const [startYear, setStartYear] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [degreeType, setDegreeType] = useState('');
  const [projectType, setProjectType] = useState('');
  const [milestoneType, setMilestoneType] = useState('');
  const [processStatus, setProcessStatus] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [advisorId, setAdvisorId] = useState('');
  const [examinerId, setExaminerId] = useState('');
  const [examinerOptions, setExaminerOptions] = useState<Array<{ id: string; displayName: string }>>([]);

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<{ threshold?: number } | null>(null);

  const uid = auth.currentUser?.uid;
  const isSystemAdmin = userRole === 'system_admin';
  const isGradSchoolHead = userRole === 'grad_school_head';
  const isCrossFaculty = isSystemAdmin || isGradSchoolHead;

  // Mirrors the server's effectiveFacultyIds (scopeAuthorization.ts) —
  // grad_school_head is no longer automatically cross-faculty, so only offer
  // faculties the server will actually accept for them: their own faculty
  // plus any gradSchoolHeadFacultyIds extras, or every faculty if they're
  // explicitly kept/set to facultyId 'all'. system_admin stays unrestricted.
  const gradSchoolHeadFacultyOptions: string[] | 'all' = !isGradSchoolHead
    ? 'all'
    : userFacultyId === 'all'
    ? (userGradSchoolHeadFacultyIds.length > 0 ? userGradSchoolHeadFacultyIds : 'all')
    : [userFacultyId, ...userGradSchoolHeadFacultyIds].filter(Boolean) as string[];

  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const res = await apiClient.get('/api/users/profile');
        setUserName(res.data.displayName || '');
        setUserRole(res.data.role || null);
        setUserFacultyId(res.data.facultyId || null);
        setUserGradSchoolHeadFacultyIds(res.data.gradSchoolHeadFacultyIds || []);
      } catch (err) {
        console.error('Reports: failed to load profile', err);
      }
    })();
  }, [uid]);

  // Examiner dropdown source — internal examiners only (external examiners
  // have no uid to filter defense.examinerIds by, see services/reports.ts).
  useEffect(() => {
    if (!uid) return;
    apiClient.get('/api/examiner/get-list')
      .then(res => setExaminerOptions((res.data ?? []).map((u: any) => ({ id: u.id, displayName: u.displayName ?? u.id }))))
      .catch(() => setExaminerOptions([]));
  }, [uid]);

  const filters = {
    startYear: startYear ? Number(startYear) : undefined,
    overdueOnly: overdueOnly || undefined,
    degreeType: degreeType || undefined,
    projectType: projectType || undefined,
    milestoneType: milestoneType || undefined,
    processStatus: processStatus || undefined,
    facultyId: isCrossFaculty && facultyId ? facultyId : undefined,
    advisorId: advisorId || undefined,
    examinerId: examinerId || undefined,
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
  }, [uid, activeReport, startYear, overdueOnly, degreeType, projectType, milestoneType, processStatus, facultyId, advisorId, examinerId, isCrossFaculty, lang]);

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

      {/* Report type selector — one block per report, name + short description */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingTop: 12, gap: 10 }}>
        {REPORTS.map((r) => (
          <Pressable
            key={r.key}
            style={{
              width: '47%',
              borderWidth: 1.5, borderColor: activeReport === r.key ? '#2E86FF' : '#D0DEFF',
              backgroundColor: activeReport === r.key ? '#EAF2FF' : '#fff',
              borderRadius: 14, padding: 12,
            }}
            onPress={() => setActiveReport(r.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: activeReport === r.key }}
          >
            <Text style={{ color: activeReport === r.key ? '#2E86FF' : '#111', fontWeight: '700', fontSize: 13 }}>
              {lang === 'he' ? r.he : r.en}
            </Text>
            <Text style={{ color: '#8899BB', fontSize: 11, marginTop: 4 }}>
              {lang === 'he' ? r.heDesc : r.enDesc}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Filter bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
        <TextInput
          style={{ borderWidth: 1.5, borderColor: '#D0DEFF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, width: 110, backgroundColor: '#fff' }}
          value={startYear}
          onChangeText={setStartYear}
          keyboardType="numeric"
          placeholder={lang === 'he' ? 'שנת התחלה' : 'Start year'}
          accessibilityLabel={lang === 'he' ? 'שנת התחלה' : 'Start year'}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 13, color: '#445' }}>{lang === 'he' ? 'חריגה בלבד' : 'Overdue only'}</Text>
          <Switch value={overdueOnly} onValueChange={setOverdueOnly} trackColor={{ true: '#2E86FF' }} />
        </View>
      </View>

      <Pressable
        onPress={() => setShowMoreFilters(v => !v)}
        style={{ paddingHorizontal: 16, paddingTop: 8 }}
        accessibilityRole="button"
        accessibilityState={{ expanded: showMoreFilters }}
      >
        <Text style={{ fontSize: 12, fontWeight: '600', color: '#2E86FF' }}>
          {showMoreFilters ? (lang === 'he' ? '▲ פחות מסננים' : '▲ Fewer filters') : (lang === 'he' ? '▼ עוד מסננים' : '▼ More filters')}
        </Text>
      </Pressable>

      {showMoreFilters && (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          {isCrossFaculty && (
            <FilterPillRow
              options={gradSchoolHeadFacultyOptions === 'all' ? Object.keys(FACULTY_LABEL) : gradSchoolHeadFacultyOptions}
              value={facultyId}
              onChange={setFacultyId}
              labelFor={(v) => FACULTY_LABEL[v]?.[lang] ?? v}
            />
          )}
          <FilterPillRow options={DEGREE_TYPES} value={degreeType} onChange={setDegreeType} labelFor={(v) => DEGREE_TYPE_LABEL[v]?.[lang] ?? v} />
          <FilterPillRow options={PROJECT_TYPES} value={projectType} onChange={setProjectType} labelFor={(v) => PROJECT_TYPE_LABEL[v]?.[lang] ?? v} />
          <FilterPillRow options={MILESTONE_TYPES} value={milestoneType} onChange={setMilestoneType} labelFor={(v) => MILESTONE_TYPE_LABEL[v]?.[lang] ?? v} />
          <FilterPillRow options={PROCESS_STATUSES} value={processStatus} onChange={setProcessStatus} labelFor={(v) => PROCESS_STATUS_LABEL[v]?.[lang] ?? v} />
          {examinerOptions.length > 0 && (
            <FilterPillRow
              options={examinerOptions.map((e) => e.id)}
              value={examinerId}
              onChange={setExaminerId}
              labelFor={(id) => examinerOptions.find((e) => e.id === id)?.displayName ?? id}
            />
          )}
          <TextInput
            style={{ borderWidth: 1.5, borderColor: '#D0DEFF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, backgroundColor: '#fff' }}
            value={advisorId}
            onChangeText={setAdvisorId}
            placeholder={lang === 'he' ? 'מזהה מנחה' : 'Advisor ID'}
            accessibilityLabel={lang === 'he' ? 'מזהה מנחה' : 'Advisor ID'}
          />
        </View>
      )}

      {/* Export button */}
      <Pressable
        style={{ marginHorizontal: 16, marginTop: 12, backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 10, alignItems: 'center', opacity: exporting ? 0.6 : 1 }}
        onPress={handleExport}
        disabled={exporting}
        accessibilityRole="button"
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
