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

type SignoffType = 'examiners' | 'final_grade';
type Urgency = 'low' | 'medium' | 'high';

interface PendingSignoffItem {
  id: string;
  type: SignoffType;
  studentName: string;
  facultyId: string;
  title: string;
  submittedAt: string;
  urgency: Urgency;
}

const TYPE_LABEL: Record<SignoffType, { he: string; en: string }> = {
  examiners: { he: 'אישור בוחנים', en: 'Examiner Approval' },
  final_grade: { he: 'אישור ציון סופי', en: 'Final Grade' },
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
    setBusyId(item.id);
    try {
      if (item.type === 'examiners') await apiClient.post(`/api/grad-school-head/examiner-recommendations/${item.id}/approve`);
      else await apiClient.post(`/api/grad-school-head/milestones/${item.id}/approve-grade`);
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
        ✍️ {lang === 'he' ? 'ממתין לאישור ציונים ובוחנים' : 'Awaiting grade/examiner approval'}
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
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {rejectTargetId === item.id ? (
              <>
                <Pressable
                  style={[{ flex: 1, backgroundColor: rejectReason.trim() ? '#EF4444' : '#FCA5A5', borderRadius: 8, padding: 10, alignItems: 'center' }]}
                  onPress={() => handleReject(item)}
                  disabled={!rejectReason.trim() || busyId === item.id}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{lang === 'he' ? 'שלח דחייה' : 'Submit rejection'}</Text>
                </Pressable>
                <Pressable
                  style={{ flex: 1, backgroundColor: '#FEF3C7', borderRadius: 8, padding: 10, alignItems: 'center' }}
                  onPress={() => { setRejectTargetId(null); setRejectReason(''); }}
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
                >
                  <Text style={{ color: '#92400E', fontWeight: '700', fontSize: 13 }}>{lang === 'he' ? 'דחה' : 'Reject'}</Text>
                </Pressable>
                <Pressable
                  style={[{ flex: 1, backgroundColor: '#D1FAE5', borderRadius: 8, padding: 10, alignItems: 'center' }, busyId === item.id && { opacity: 0.6 }]}
                  onPress={() => handleApprove(item)}
                  disabled={busyId === item.id}
                >
                  {busyId === item.id ? <ActivityIndicator color="#065F46" /> : (
                    <Text style={{ color: '#065F46', fontWeight: '700', fontSize: 13 }}>✅ {lang === 'he' ? 'אשר' : 'Approve'}</Text>
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
