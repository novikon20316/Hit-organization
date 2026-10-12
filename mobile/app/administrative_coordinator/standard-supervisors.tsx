// app/administrative_coordinator/standard-supervisors.tsx
// "מנחה סטנדרטי" for administrative_secretary and system_admin — mirrors
// web's app/administrative_coordinator/standard-supervisors/page.tsx. Per
// supervisor, whether they're qualified to open a bachelor final project /
// masters final project / masters thesis alone, without a co-supervisor.
// GET /api/admin/standard-supervisors (scoped server-side to her own
// coordinatorScopes) + POST /api/admin/users/:id/standard-supervisor per flag.
//
// Excel import: the template (שם מנחה + one checkbox column per category)
// is read server-side (POST /api/admin/standard-supervisors/import-preview)
// and only FILLS the list — changed values are highlighted and nothing is
// written until "Save changes", which applies each change through the same
// per-flag endpoint as a manual tap.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { apiClient } from '@/src/api/apiClient';
import { facultyLabel, type FacultyId, type Lang } from '@/components/i18n';
import { majorsForFaculty } from '@/constants/permissions';
import { ap } from '@/constants/theme';

type Category = 'bachelor_project' | 'masters_project' | 'masters_thesis';
type Flags = Record<Category, boolean>;
const CATEGORIES: Category[] = ['bachelor_project', 'masters_project', 'masters_thesis'];
const CATEGORY_LABELS: Record<Category, { he: string; en: string }> = {
  bachelor_project: { he: 'פרויקט גמר תואר ראשון', en: "Bachelor's final project" },
  masters_project: { he: 'פרויקט גמר תואר שני', en: "Master's final project" },
  masters_thesis: { he: 'תזה', en: 'Thesis' },
};

interface Supervisor {
  id: string;
  displayName: string;
  email: string;
  facultyId: string;
  assignedMajors: string[];
  standardSupervisorEligibility: Flags;
}
interface UnmatchedRow { rowNumber: number; name: string; reason: 'not_found' | 'ambiguous' | 'duplicate' }

const UNMATCHED_REASON: Record<UnmatchedRow['reason'], { he: string; en: string }> = {
  not_found: { he: 'לא נמצא מנחה בשם זה', en: 'No supervisor with this name' },
  ambiguous: { he: 'נמצא יותר ממנחה אחד בשם זה', en: 'More than one supervisor has this name' },
  duplicate: { he: 'המנחה מופיע/ה יותר מפעם אחת בקובץ', en: 'This supervisor appears more than once in the file' },
};

const EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

function majorLabels(facultyId: string, majors: string[], lang: Lang): string {
  if (!majors.length) return lang === 'he' ? 'כל המגמות' : 'All majors';
  const all = majorsForFaculty(facultyId);
  return majors.map((slug) => all.find((m) => m.slug === slug)?.label[lang] ?? slug).join(', ');
}

export default function StandardSupervisorsScreen() {
  const router = useRouter();
  const { lang: langParam } = useLocalSearchParams<{ lang?: string }>();
  const lang: Lang = langParam === 'en' ? 'en' : 'he';
  const isRtl = lang === 'he';
  const textAlign = isRtl ? 'right' : 'left';

  const [supervisors, setSupervisors] = useState<Supervisor[] | null>(null);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Values loaded from an Excel file but not saved yet, keyed by supervisor
  // id. Present = the list shows these instead of the saved values, and a
  // manual tap edits them too until Save/Discard.
  const [pending, setPending] = useState<Record<string, Flags> | null>(null);
  const [importInfo, setImportInfo] = useState<{ fileName: string; matched: number; unmatched: UnmatchedRow[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [savingImport, setSavingImport] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    apiClient.get('/api/admin/standard-supervisors')
      .then((res) => setSupervisors(res.data.supervisors ?? []))
      .catch(() => setError(lang === 'he' ? 'טעינת רשימת המנחים נכשלה' : 'Failed to load supervisors'));
  }, [lang]);

  const shownFlags = (s: Supervisor): Flags => pending?.[s.id] ?? s.standardSupervisorEligibility;
  const changedCells = (supervisors ?? []).flatMap((s) =>
    pending?.[s.id] ? CATEGORIES.filter((c) => pending[s.id]![c] !== s.standardSupervisorEligibility[c]).map((c) => ({ s, c })) : [],
  );

  const setSavedFlag = (id: string, category: Category, value: boolean) =>
    setSupervisors((prev) => prev?.map((x) => (x.id === id ? { ...x, standardSupervisorEligibility: { ...x.standardSupervisorEligibility, [category]: value } } : x)) ?? null);

  const handleToggle = async (supervisor: Supervisor, category: Category) => {
    if (pending) {
      const current = shownFlags(supervisor);
      setPending((prev) => ({ ...(prev ?? {}), [supervisor.id]: { ...current, [category]: !current[category] } }));
      return;
    }
    const nextValue = !supervisor.standardSupervisorEligibility[category];
    setSavingKey(`${supervisor.id}:${category}`);
    setSavedFlag(supervisor.id, category, nextValue);
    try {
      await apiClient.post(`/api/admin/users/${supervisor.id}/standard-supervisor`, { category, value: nextValue });
    } catch (err: any) {
      setSavedFlag(supervisor.id, category, !nextValue); // revert
      setError(err?.response?.data?.message || (lang === 'he' ? 'העדכון נכשל' : 'Update failed'));
    } finally {
      setSavingKey(null);
    }
  };

  const pickExcel = async () => {
    if (!supervisors) return;
    const result = await DocumentPicker.getDocumentAsync({ type: EXCEL_MIME_TYPES, multiple: false, copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0]!;
    setImporting(true);
    setError('');
    setNotice('');
    try {
      const formData = new FormData();
      // Web (expo web) hands back a real File; native hands back a uri.
      if ((asset as any).file) {
        formData.append('file', (asset as any).file);
      } else {
        formData.append('file', { uri: asset.uri, name: asset.name, type: asset.mimeType ?? EXCEL_MIME_TYPES[0] } as any);
      }
      const res = await apiClient.post('/api/admin/standard-supervisors/import-preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        transformRequest: (data: any) => data,
      });
      const matches: { supervisorId: string; flags: Partial<Flags> }[] = res.data.matches ?? [];
      const next: Record<string, Flags> = {};
      matches.forEach((m) => {
        const s = supervisors.find((x) => x.id === m.supervisorId);
        // A category column missing from the file leaves that value as is.
        if (s) next[s.id] = { ...s.standardSupervisorEligibility, ...m.flags };
      });
      setPending(next);
      setImportInfo({ fileName: asset.name, matched: matches.length, unmatched: res.data.unmatched ?? [] });
    } catch (err: any) {
      setError(err?.response?.data?.message || (lang === 'he' ? 'קריאת הקובץ נכשלה' : 'Failed to read the file'));
    } finally {
      setImporting(false);
    }
  };

  const discardImport = () => {
    setPending(null);
    setImportInfo(null);
  };

  const saveImport = async () => {
    setSavingImport(true);
    setError('');
    const failures: string[] = [];
    let saved = 0;
    for (const { s, c } of changedCells) {
      const value = pending![s.id]![c];
      try {
        await apiClient.post(`/api/admin/users/${s.id}/standard-supervisor`, { category: c, value });
        saved += 1;
        setSavedFlag(s.id, c, value);
      } catch {
        failures.push(`${s.displayName} — ${CATEGORY_LABELS[c][lang]}`);
      }
    }
    setSavingImport(false);
    if (failures.length > 0) {
      // Keep the import open so the failed values stay highlighted for a retry.
      setError(lang === 'he' ? `נשמרו ${saved} שינויים. נכשלו: ${failures.join('; ')}` : `Saved ${saved} changes. Failed: ${failures.join('; ')}`);
      return;
    }
    setPending(null);
    setImportInfo(null);
    setNotice(lang === 'he' ? `נשמרו ${saved} שינויים מהקובץ.` : `Saved ${saved} changes from the file.`);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ap.surface }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/administrative_coordinator/administrative_coordinator_dashboard' as any))}
          style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: 12 }}
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: ap.primary }}>
            {isRtl ? '→' : '←'} {lang === 'he' ? 'חזרה' : 'Back'}
          </Text>
        </Pressable>

        <Text style={{ fontSize: 20, fontWeight: '700', color: ap.onSurface, textAlign }}>
          🎖️ {lang === 'he' ? 'מנחה סטנדרטי' : 'Standard Supervisor'}
        </Text>
        <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, marginTop: 4, textAlign }}>
          {lang === 'he'
            ? 'מנחה סטנדרטי כשיר לפתוח פרויקט גמר/תזה בעצמו, ללא צורך במנחה נוסף. סמן/י בהתאם לכל קטגוריה.'
            : 'A standard supervisor is qualified to open a final project/thesis on their own, without needing a co-supervisor. Check the categories that apply.'}
        </Text>

        <Pressable
          onPress={pickExcel}
          disabled={importing || savingImport || supervisors === null}
          style={{ marginTop: 12, borderWidth: 1, borderColor: ap.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center', opacity: importing || savingImport || supervisors === null ? 0.6 : 1 }}
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: ap.primary }}>
            {importing ? (lang === 'he' ? 'קורא את הקובץ…' : 'Reading file…') : `📥 ${lang === 'he' ? 'העלאת קובץ אקסל' : 'Upload Excel file'}`}
          </Text>
        </Pressable>

        {importInfo && (
          <View style={{ marginTop: 12, borderWidth: 1, borderColor: ap.primary, backgroundColor: ap.surfaceContainerLow, borderRadius: 12, padding: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: ap.onSurface, textAlign }}>
              {lang === 'he'
                ? `נטען מהקובץ "${importInfo.fileName}": ${importInfo.matched} מנחים זוהו, ${changedCells.length} שינויים — טרם נשמרו.`
                : `Loaded from "${importInfo.fileName}": ${importInfo.matched} supervisors matched, ${changedCells.length} changes — not saved yet.`}
            </Text>
            <Text style={{ fontSize: 11, color: ap.onSurfaceVariant, marginTop: 2, textAlign }}>
              {lang === 'he' ? 'הערכים שהשתנו מסומנים ברשימה. ניתן לתקן ידנית לפני השמירה.' : 'Changed values are highlighted below. You can still adjust them before saving.'}
            </Text>
            {importInfo.unmatched.length > 0 && (
              <View style={{ marginTop: 8, backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#A8433A', textAlign }}>
                  {lang === 'he' ? `${importInfo.unmatched.length} שורות לא יובאו:` : `${importInfo.unmatched.length} rows were not imported:`}
                </Text>
                {importInfo.unmatched.map((u) => (
                  <Text key={`${u.rowNumber}-${u.name}`} style={{ fontSize: 12, color: '#A8433A', marginTop: 2, textAlign }}>
                    {lang === 'he' ? `שורה ${u.rowNumber}` : `Row ${u.rowNumber}`}: {u.name} — {UNMATCHED_REASON[u.reason][lang]}
                  </Text>
                ))}
              </View>
            )}
            <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', gap: 8, marginTop: 10 }}>
              <Pressable
                onPress={saveImport}
                disabled={savingImport || changedCells.length === 0}
                style={{ flex: 1, backgroundColor: ap.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center', opacity: savingImport || changedCells.length === 0 ? 0.6 : 1 }}
                accessibilityRole="button"
              >
                {savingImport
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{lang === 'he' ? 'שמירת השינויים' : 'Save changes'}</Text>}
              </Pressable>
              <Pressable
                onPress={discardImport}
                disabled={savingImport}
                style={{ flex: 1, borderWidth: 1, borderColor: ap.outlineVariant, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                accessibilityRole="button"
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: ap.onSurfaceVariant }}>{lang === 'he' ? 'ביטול' : 'Discard'}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {!!notice && (
          <View style={{ marginTop: 12, backgroundColor: '#ECFDF5', borderRadius: 10, padding: 12 }}>
            <Text style={{ color: '#047857', fontSize: 13, textAlign }}>{notice}</Text>
          </View>
        )}
        {!!error && (
          <View style={{ marginTop: 12, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12 }}>
            <Text style={{ color: '#A8433A', fontSize: 13, textAlign }}>{error}</Text>
          </View>
        )}

        {supervisors === null && !error && <ActivityIndicator size="large" color={ap.primary} style={{ marginTop: 30 }} />}
        {supervisors !== null && supervisors.length === 0 && (
          <Text style={{ marginTop: 20, fontSize: 13, color: ap.onSurfaceVariant, textAlign }}>
            {lang === 'he' ? 'אין מנחים להצגה.' : 'No supervisors to show.'}
          </Text>
        )}

        {(supervisors ?? []).map((s) => {
          const flags = shownFlags(s);
          return (
            <View key={s.id} style={{ marginTop: 12, backgroundColor: ap.surfaceContainerLowest, borderRadius: 12, borderWidth: 1, borderColor: ap.outlineVariant, padding: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: ap.onSurface, textAlign }}>{s.displayName}</Text>
              <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, textAlign }}>{s.email}</Text>
              <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, marginTop: 2, textAlign }}>
                {facultyLabel(s.facultyId as FacultyId, lang)} · {majorLabels(s.facultyId, s.assignedMajors, lang)}
              </Text>
              <View style={{ marginTop: 8, gap: 6 }}>
                {CATEGORIES.map((cat) => {
                  const checked = !!flags[cat];
                  const changed = !!pending?.[s.id] && flags[cat] !== s.standardSupervisorEligibility[cat];
                  const busy = savingKey === `${s.id}:${cat}` || savingImport;
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => handleToggle(s, cat)}
                      disabled={busy}
                      style={{
                        flexDirection: isRtl ? 'row-reverse' : 'row',
                        alignItems: 'center',
                        gap: 10,
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                        borderRadius: 8,
                        backgroundColor: changed ? '#E8EEFF' : ap.surfaceContainerLow,
                        borderWidth: changed ? 1 : 0,
                        borderColor: ap.primary,
                        opacity: busy ? 0.6 : 1,
                      }}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked, disabled: busy }}
                      accessibilityLabel={`${s.displayName} — ${CATEGORY_LABELS[cat][lang]}${changed ? (lang === 'he' ? ' (שונה, טרם נשמר)' : ' (changed, not saved)') : ''}`}
                    >
                      <View style={{
                        width: 20, height: 20, borderRadius: 4, borderWidth: 2,
                        borderColor: checked ? ap.primary : ap.outline,
                        backgroundColor: checked ? ap.primary : 'transparent',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        {checked && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>✓</Text>}
                      </View>
                      <Text style={{ flex: 1, fontSize: 13, color: ap.onSurface, textAlign }}>{CATEGORY_LABELS[cat][lang]}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
