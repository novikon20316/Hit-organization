// components/ExceptionalActionQueue.tsx
// P1 backlog item #12 — program_head/faculty_admin/grad_school_head/
// system_admin review deadline-override requests a coordinator/
// administrative coordinator filed instead of applying directly. Self-contained,
// like ClockPauseControl. Mirrors web/components/ExceptionalActionQueue.tsx.

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { apiClient } from '@/src/api/apiClient';
import type { Lang } from './i18n';

export interface ExceptionalActionRequest {
  id: string;
  type: 'deadline_override' | 'bulk_deadline_override';
  payload: { dueDate?: string; projectIds?: string[] };
  reason: string;
  requestedByRole: string;
  status: 'pending' | 'approved' | 'rejected';
}

export function ExceptionalActionQueue({ lang }: { lang: Lang }) {
  const [requests, setRequests] = useState<ExceptionalActionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [rejectReasonById, setRejectReasonById] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  // Distinct from "genuinely zero pending requests" (which also renders
  // nothing, by design) — a failed fetch used to look identical to that,
  // so an approver could silently never see a real pending queue exists.
  const [loadError, setLoadError] = useState('');

  const load = () => {
    setLoading(true);
    setLoadError('');
    apiClient.get('/api/exceptional-actions/pending')
      .then((res: any) => setRequests(res.data?.requests ?? []))
      .catch((err: unknown) => {
        console.error('Failed to load exceptional-action queue:', err);
        setLoadError(lang === 'he' ? 'טעינת הבקשות הממתינות נכשלה' : 'Failed to load pending requests');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    setError('');
    if (decision === 'rejected' && !rejectReasonById[id]?.trim()) {
      setError(lang === 'he' ? 'יש לציין סיבה לדחייה' : 'A reason is required to reject');
      return;
    }
    setDecidingId(id);
    try {
      await apiClient.post(`/api/exceptional-actions/${id}/decide`, {
        decision,
        reason: rejectReasonById[id]?.trim(),
      });
      load();
    } catch (err) {
      setError(lang === 'he' ? 'הפעולה נכשלה' : 'Action failed');
    } finally {
      setDecidingId(null);
    }
  };

  if (loading) return null;
  if (loadError) {
    return (
      <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, borderWidth: 1, borderColor: '#F2C7C2', padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 12, color: '#A8433A', flex: 1 }}>⚠️ {loadError}</Text>
        <Pressable onPress={load}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#A8433A', textDecorationLine: 'underline' }}>
            {lang === 'he' ? 'נסה שוב' : 'Retry'}
          </Text>
        </Pressable>
      </View>
    );
  }
  if (requests.length === 0) return null;

  return (
    <View style={{ marginBottom: 12 }}>
      {requests.map((r) => (
        <View key={r.id} style={{ backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#F2C7C2', padding: 12, marginBottom: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#A8433A' }}>
            ⚠️ {lang === 'he' ? 'בקשה חריגה ממתינה' : 'Pending exceptional action'}
          </Text>
          <Text style={{ fontSize: 12, color: '#8899BB', marginTop: 2 }}>
            {r.type === 'deadline_override'
              ? (lang === 'he' ? 'דחיית תאריך יעד' : 'Deadline override')
              : (lang === 'he' ? `דחיית תאריך יעד עבור ${r.payload.projectIds?.length ?? 0} פרויקטים` : `Bulk deadline override across ${r.payload.projectIds?.length ?? 0} project(s)`)}
          </Text>
          <Text style={{ fontSize: 12, color: '#111', marginTop: 4 }}>{r.reason}</Text>
          <Text style={{ fontSize: 11, color: '#8899BB', marginTop: 2 }}>
            {lang === 'he' ? 'מבקש:' : 'Requested by:'} {r.requestedByRole}
          </Text>

          <TextInput
            value={rejectReasonById[r.id] ?? ''}
            onChangeText={(text) => setRejectReasonById((prev) => ({ ...prev, [r.id]: text }))}
            placeholder={lang === 'he' ? 'סיבת דחייה (נדרש רק לדחייה)' : 'Rejection reason (required only to reject)'}
            placeholderTextColor="#9CA3AF"
            style={{ borderWidth: 1, borderColor: '#D0DEFF', borderRadius: 8, padding: 8, marginTop: 8, fontSize: 12 }}
          />

          {error ? <Text style={{ fontSize: 11, color: '#A8433A', marginTop: 4 }}>{error}</Text> : null}

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Pressable
              onPress={() => decide(r.id, 'rejected')}
              disabled={decidingId === r.id}
              style={{ borderWidth: 1, borderColor: '#A8433A', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, opacity: decidingId === r.id ? 0.6 : 1 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#A8433A' }}>{lang === 'he' ? 'דחה' : 'Reject'}</Text>
            </Pressable>
            <Pressable
              onPress={() => decide(r.id, 'approved')}
              disabled={decidingId === r.id}
              style={{ backgroundColor: '#2E86FF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, opacity: decidingId === r.id ? 0.6 : 1 }}
            >
              {decidingId === r.id
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{lang === 'he' ? 'אשר' : 'Approve'}</Text>}
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}
