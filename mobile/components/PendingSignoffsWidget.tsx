// components/PendingSignoffsWidget.tsx
// Generic "what's waiting on you to sign off" widget — mirrors
// web/components/dashboard/PendingSignoffsWidget.tsx. Self-contained (own
// styles, not reliant on any host screen's local StyleSheet, since each
// mobile dashboard keeps its own separate style object). Surfaces whatever
// examiner-invitation / final-grade sign-offs the calling user is currently
// authorized to act on (GET /api/staff/pending-signoffs), regardless of
// role — see server/src/services/pendingSignoffs.ts. Renders nothing at all
// when there's nothing pending, unless `showEmptyState` is passed (for
// callers giving this its own dedicated tab, where a blank tab reads as
// broken).

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { apiClient } from '@/src/api/apiClient';
import type { Lang } from './i18n';

type SignoffType = 'examiners' | 'final_grade' | 'chain_stage';
type Urgency = 'low' | 'medium' | 'high';

interface StageFormField {
  key: string;
  labelHe: string;
  labelEn: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'table' | 'yesno';
  required: boolean;
}

interface PendingSignoffItem {
  id: string;
  type: SignoffType;
  studentName: string;
  facultyId: string;
  title: string;
  submittedAt: string;
  urgency: Urgency;
  /** Only present for type === 'chain_stage' — mirrors
   *  web/components/dashboard/PendingSignoffsWidget.tsx. */
  stageId?: string;
  stageFormFields?: StageFormField[];
}

const TYPE_LABEL: Record<SignoffType, { he: string; en: string }> = {
  examiners: { he: 'אישור בוחנים', en: 'Examiner Approval' },
  final_grade: { he: 'אישור ציון סופי', en: 'Final Grade' },
  chain_stage: { he: 'אישור אבן דרך', en: 'Milestone Approval' },
};

const URGENCY_COLOR: Record<Urgency, string> = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#10B981',
};

export function PendingSignoffsWidget({ lang, showEmptyState = false }: { lang: Lang; showEmptyState?: boolean }) {
  const [items, setItems] = useState<PendingSignoffItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  // Only used for type === 'chain_stage' items whose stage has its own form
  // fields — Approve opens this instead of approving immediately.
  const [formTargetId, setFormTargetId] = useState<string | null>(null);
  const [stageFormValues, setStageFormValues] = useState<Record<string, string>>({});

  const fetchItems = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/staff/pending-signoffs');
      setItems(res.data?.items ?? []);
      setError('');
    } catch (err) {
      console.error('PendingSignoffsWidget: failed to load', err);
      setError(lang === 'he' ? 'טעינת האישורים הממתינים נכשלה' : 'Failed to load pending sign-offs');
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleApprove = async (item: PendingSignoffItem) => {
    if (item.type === 'chain_stage' && (item.stageFormFields ?? []).length > 0 && formTargetId !== item.id) {
      setFormTargetId(item.id);
      setStageFormValues({});
      return;
    }
    setBusyId(item.id);
    try {
      if (item.type === 'examiners') await apiClient.post(`/api/grad-school-head/examiner-recommendations/${item.id}/approve`);
      else if (item.type === 'chain_stage') await apiClient.post(`/api/coordinator/${item.id}/approve`, { stageFormData: stageFormValues });
      else await apiClient.post(`/api/grad-school-head/milestones/${item.id}/approve-grade`);
      setFormTargetId(null);
      setStageFormValues({});
      await fetchItems();
    } catch (err) {
      console.error('PendingSignoffsWidget: approve failed', err);
      setError(lang === 'he' ? 'האישור נכשל' : 'Approval failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (item: PendingSignoffItem) => {
    if (!rejectReason.trim()) return;
    setBusyId(item.id);
    try {
      if (item.type === 'examiners') await apiClient.post(`/api/grad-school-head/examiner-recommendations/${item.id}/reject`, { reason: rejectReason.trim() });
      else if (item.type === 'chain_stage') await apiClient.post(`/api/coordinator/${item.id}/reject`, { reason: rejectReason.trim() });
      else await apiClient.post(`/api/grad-school-head/milestones/${item.id}/reject-grade`, { reason: rejectReason.trim() });
      setRejectTargetId(null);
      setRejectReason('');
      await fetchItems();
    } catch (err) {
      console.error('PendingSignoffsWidget: reject failed', err);
      setError(lang === 'he' ? 'הדחייה נכשלה' : 'Rejection failed');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return null;
  if (items.length === 0 && !error) {
    if (!showEmptyState) return null;
    return (
      <View style={{ alignItems: 'center', paddingVertical: 24 }}>
        <Text style={{ fontSize: 13, color: '#8899BB' }}>✅ {lang === 'he' ? 'אין פריטים הממתינים לאישורך' : 'Nothing awaiting your sign-off'}</Text>
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: '#1F1235', marginBottom: 8 }}>
        ✍️ {lang === 'he' ? 'ממתין לאישורך' : 'Awaiting your approval'}
      </Text>
      {!!error && (
        <View style={{ backgroundColor: '#FEE2E2', borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <Text style={{ color: '#991B1B', fontSize: 13 }}>{error}</Text>
        </View>
      )}
      {items.map((item) => (
        <View
          key={item.id}
          style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: URGENCY_COLOR[item.urgency] ?? '#8899BB', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: URGENCY_COLOR[item.urgency] ?? '#8899BB' }}>{TYPE_LABEL[item.type]?.[lang] ?? item.type}</Text>
            {!!item.submittedAt && (
              <Text style={{ fontSize: 11, color: '#94A3B8' }}>{new Date(item.submittedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}</Text>
            )}
          </View>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#1E293B', marginTop: 6 }}>{item.studentName}</Text>
          <Text style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>{item.title}</Text>

          {rejectTargetId === item.id && (
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder={lang === 'he' ? 'סיבת הדחייה (חובה)' : 'Rejection reason (required)'}
              multiline
              style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 8, minHeight: 50, fontSize: 13, textAlignVertical: 'top', marginTop: 10 }}
            />
          )}
          {formTargetId === item.id && (item.stageFormFields ?? []).map((f) => (
            <View key={f.key} style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>
                {lang === 'he' ? f.labelHe : f.labelEn}{f.required ? ' *' : ''}
              </Text>
              {f.type === 'yesno' ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['yes', 'no'] as const).map((opt) => (
                    <Pressable
                      key={opt}
                      onPress={() => setStageFormValues((v) => ({ ...v, [f.key]: opt }))}
                      style={{ flex: 1, borderRadius: 8, padding: 8, alignItems: 'center', backgroundColor: stageFormValues[f.key] === opt ? '#D1FAE5' : '#F1F5F9' }}
                      accessibilityRole="button"
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#1E293B' }}>
                        {opt === 'yes' ? (lang === 'he' ? 'כן' : 'Yes') : (lang === 'he' ? 'לא' : 'No')}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <TextInput
                  value={stageFormValues[f.key] ?? ''}
                  onChangeText={(t) => setStageFormValues((v) => ({ ...v, [f.key]: t }))}
                  multiline={f.type === 'textarea'}
                  style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 8, minHeight: f.type === 'textarea' ? 50 : undefined, fontSize: 13, textAlignVertical: f.type === 'textarea' ? 'top' : 'auto' }}
                />
              )}
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {rejectTargetId === item.id ? (
              <>
                <Pressable
                  style={[{ flex: 1, backgroundColor: rejectReason.trim() ? '#EF4444' : '#FCA5A5', borderRadius: 8, padding: 10, alignItems: 'center' }]}
                  onPress={() => handleReject(item)}
                  disabled={!rejectReason.trim() || busyId === item.id}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !rejectReason.trim() || busyId === item.id }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{lang === 'he' ? 'שלח דחייה' : 'Submit rejection'}</Text>
                </Pressable>
                <Pressable
                  style={{ flex: 1, backgroundColor: '#FEF3C7', borderRadius: 8, padding: 10, alignItems: 'center' }}
                  onPress={() => { setRejectTargetId(null); setRejectReason(''); }}
                  accessibilityRole="button"
                >
                  <Text style={{ color: '#92400E', fontWeight: '700', fontSize: 13 }}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  style={{ flex: 1, backgroundColor: '#FEF3C7', borderRadius: 8, padding: 10, alignItems: 'center' }}
                  onPress={() => setRejectTargetId(item.id)}
                  disabled={busyId === item.id}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busyId === item.id }}
                >
                  <Text style={{ color: '#92400E', fontWeight: '700', fontSize: 13 }}>{lang === 'he' ? 'דחה' : 'Reject'}</Text>
                </Pressable>
                <Pressable
                  style={[{ flex: 1, backgroundColor: '#D1FAE5', borderRadius: 8, padding: 10, alignItems: 'center' }, busyId === item.id && { opacity: 0.6 }]}
                  onPress={() => handleApprove(item)}
                  disabled={busyId === item.id}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busyId === item.id }}
                >
                  {busyId === item.id ? <ActivityIndicator color="#065F46" /> : (
                    <Text style={{ color: '#065F46', fontWeight: '700', fontSize: 13 }}>
                      ✅ {formTargetId === item.id ? (lang === 'he' ? 'שלח אישור' : 'Submit approval') : (lang === 'he' ? 'אשר' : 'Approve')}
                    </Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}
