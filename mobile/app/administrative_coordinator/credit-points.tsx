// app/administrative_coordinator/credit-points.tsx
// "נקודות זכות למנחים" as its own screen for administrative_secretary and
// system_admin, mirroring web's SupervisorCreditPointsPanel.tsx — moved out
// of the (web-only) Statistics tab. Reuses the same
// GET /api/project-coordinator/statistics response
// (apiClient.getSupervisorCreditPointsData) that already carries
// supervisorPaymentRates + supervisorCreditPoints for every faculty in the
// caller's scope — no backend change needed.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiClient } from '@/src/api/apiClient';
import { facultyLabel, type FacultyId, type Lang } from '@/components/i18n';
import { ap } from '@/constants/theme';

type PaymentCategory = 'msc_thesis' | 'msc_project' | 'bsc_project';
type RateRow = Record<PaymentCategory, number | null>;
type Rates = Record<string, RateRow>;

const CATEGORIES: PaymentCategory[] = ['msc_thesis', 'msc_project', 'bsc_project'];
const CATEGORY_LABELS: Record<PaymentCategory, { he: string; en: string }> = {
  msc_thesis: { he: 'תזה', en: 'Thesis' },
  msc_project: { he: 'פרויקט תואר שני', en: "Master's project" },
  bsc_project: { he: 'פרויקט תואר ראשון', en: "Bachelor's project" },
};
const EMPTY_ROW: RateRow = { msc_thesis: null, msc_project: null, bsc_project: null };

export default function SupervisorCreditPointsScreen() {
  const router = useRouter();
  const { lang: langParam } = useLocalSearchParams<{ lang?: string }>();
  const lang: Lang = langParam === 'en' ? 'en' : 'he';
  const isRtl = lang === 'he';

  const [allowedFacultyIds, setAllowedFacultyIds] = useState<string[]>([]);
  const [creditPoints, setCreditPoints] = useState<Awaited<ReturnType<typeof apiClient.getSupervisorCreditPointsData>>['supervisorCreditPoints']>([]);
  const [rateEdits, setRateEdits] = useState<Rates>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [noScopeAssigned, setNoScopeAssigned] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    apiClient.getSupervisorCreditPointsData()
      .then((res) => {
        setAllowedFacultyIds(res.allowedFacultyIds ?? []);
        setCreditPoints(res.supervisorCreditPoints ?? []);
        setRateEdits(res.supervisorPaymentRates ?? {});
        setNoScopeAssigned(!!res.noScopeAssigned);
      })
      .catch((err) => {
        console.error('Failed to load supervisor credit points:', err);
        setError(lang === 'he' ? 'טעינת הנתונים נכשלה' : 'Failed to load data');
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [lang]);

  const updateRate = (facultyId: string, category: PaymentCategory, text: string) => {
    const value = text.trim() === '' ? null : Number(text);
    setRateEdits((prev) => ({ ...prev, [facultyId]: { ...EMPTY_ROW, ...prev[facultyId], [category]: Number.isNaN(value) ? null : value } }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await apiClient.updateSupervisorPaymentRates(rateEdits);
      load();
    } catch (err) {
      console.error('Failed to save supervisor payment rates:', err);
      setSaveError(lang === 'he' ? 'השמירה נכשלה' : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const facultiesWithPoints = [...new Set(creditPoints.map((r) => r.facultyId))];

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

        <Text style={{ fontSize: 20, fontWeight: '700', color: ap.onSurface }}>
          💰 {lang === 'he' ? 'נקודות זכות למנחים' : 'Supervisor Credit Points'}
        </Text>
        <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, marginTop: 4, textAlign: isRtl ? 'right' : 'left' }}>
          {lang === 'he'
            ? 'מפתח נקודות לכל פקולטה וסוג פרויקט, וסך הנקודות שצבר כל מנחה.'
            : "The per-faculty/category payment-point key, and each supervisor's accrued points."}
        </Text>

        {loading && <ActivityIndicator size="large" color={ap.primary} style={{ marginTop: 30 }} />}

        {!loading && !!error && (
          <View style={{ marginTop: 20, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 14 }}>
            <Text style={{ color: '#A8433A', fontSize: 13 }}>{error}</Text>
          </View>
        )}

        {!loading && !error && noScopeAssigned && (
          <View style={{ marginTop: 20, backgroundColor: '#FBF3E3', borderRadius: 10, padding: 14 }}>
            <Text style={{ color: '#8A6D1E', fontSize: 13 }}>
              {lang === 'he'
                ? 'לא הוקצה לך עדיין תחום אחריות (פקולטה/תואר).'
                : 'No degree has been assigned to your account yet.'}
            </Text>
          </View>
        )}

        {!loading && !error && !noScopeAssigned && (
          <>
            <View style={{ marginTop: 16, backgroundColor: ap.surfaceContainerLowest, borderRadius: 12, borderWidth: 1, borderColor: ap.outlineVariant, padding: 12 }}>
              {allowedFacultyIds.length === 0 && (
                <Text style={{ fontSize: 12, color: ap.onSurfaceVariant }}>{lang === 'he' ? 'אין נתונים' : 'No data'}</Text>
              )}
              {allowedFacultyIds.map((fid) => {
                const row = rateEdits[fid] ?? EMPTY_ROW;
                return (
                  <View key={fid} style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: ap.onSurface, textAlign: isRtl ? 'right' : 'left' }}>
                      {facultyLabel(fid as FacultyId, lang)}
                    </Text>
                    {CATEGORIES.map((cat) => (
                      <View key={cat} style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                        <Text style={{ fontSize: 12, color: ap.onSurfaceVariant }}>{CATEGORY_LABELS[cat][lang]}</Text>
                        <TextInput
                          keyboardType="numeric"
                          value={row[cat] === null || row[cat] === undefined ? '' : String(row[cat])}
                          onChangeText={(t) => updateRate(fid, cat, t)}
                          placeholder="—"
                          style={{ width: 70, borderWidth: 1, borderColor: ap.outlineVariant, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, fontSize: 13, color: ap.onSurface, textAlign: 'center' }}
                        />
                      </View>
                    ))}
                  </View>
                );
              })}
              <Pressable
                onPress={handleSave}
                disabled={saving || allowedFacultyIds.length === 0}
                style={{ marginTop: 4, alignSelf: isRtl ? 'flex-end' : 'flex-start', borderWidth: 1, borderColor: ap.primary, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14, opacity: saving ? 0.6 : 1 }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: ap.primary }}>
                  {saving ? '…' : lang === 'he' ? 'שמירת המפתח' : 'Save key'}
                </Text>
              </Pressable>
              {!!saveError && <Text style={{ marginTop: 6, fontSize: 12, color: '#A8433A' }}>{saveError}</Text>}
            </View>

            {creditPoints.length === 0 && (
              <Text style={{ marginTop: 16, fontSize: 12, color: ap.onSurfaceVariant }}>{lang === 'he' ? 'אין נתונים' : 'No data'}</Text>
            )}
            {facultiesWithPoints.map((fid) => (
              <View key={fid} style={{ marginTop: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: ap.onSurfaceVariant, textAlign: isRtl ? 'right' : 'left' }}>
                  {facultyLabel(fid as FacultyId, lang)}
                </Text>
                {creditPoints.filter((r) => r.facultyId === fid).map((r) => (
                  <View key={r.supervisorId} style={{ backgroundColor: ap.surfaceContainerLowest, borderRadius: 10, padding: 12, marginTop: 8, borderWidth: 1, borderColor: ap.outlineVariant }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: ap.onSurface, textAlign: isRtl ? 'right' : 'left' }}>{r.supervisorName}</Text>
                    <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, marginTop: 4, textAlign: isRtl ? 'right' : 'left' }}>
                      {CATEGORIES.map((cat) => `${CATEGORY_LABELS[cat][lang]}: ${r.counts[cat]}`).join(' · ')}
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: ap.onSurface, marginTop: 4, textAlign: isRtl ? 'right' : 'left' }}>
                      {lang === 'he' ? 'סה"כ נקודות' : 'Total points'}: {r.totalPoints}{r.incompleteRates ? ' ⚠️' : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
