// components/ClockPauseControl.tsx
// Pause/resume a project's deadline clock for leave, reserve duty,
// maternity/paternity, or illness (P1 backlog item #7). Self-contained —
// fetches its own state via apiClient.getProjectGradeHistory's sibling,
// getClockPauseState, independent of whatever dashboard payload the parent
// card came from. Mirrors web/components/ClockPauseControl.tsx.

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, ActivityIndicator } from 'react-native';
import { apiClient } from '@/src/api/apiClient';
import type { Lang } from './i18n';

export type ClockPauseReason = 'reserve_duty' | 'illness' | 'maternity_paternity' | 'other';

export interface ClockPause {
  id: string;
  reason: ClockPauseReason;
  note: string | null;
  pausedBy: string;
  pausedAt: string;
  resumedBy: string | null;
  resumedAt: string | null;
}

const REASON_LABEL: Record<ClockPauseReason, { he: string; en: string }> = {
  reserve_duty: { he: 'מילואים', en: 'Reserve duty' },
  illness: { he: 'מחלה', en: 'Illness' },
  maternity_paternity: { he: 'חופשת לידה', en: 'Maternity/paternity leave' },
  other: { he: 'אחר', en: 'Other' },
};

export function ClockPauseControl({ projectId, lang }: { projectId: string; lang: Lang }) {
  const [activePause, setActivePause] = useState<ClockPause | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState<ClockPauseReason>('reserve_duty');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    apiClient.get(`/api/projects/${projectId}/clock-pause`)
      .then((res: any) => setActivePause(res.data?.activeClockPause ?? null))
      .catch((err: unknown) => console.error('Failed to load clock-pause state:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (projectId) load();
  }, [projectId]);

  const handlePause = async () => {
    setSaving(true);
    setError('');
    try {
      await apiClient.post(`/api/projects/${projectId}/clock-pause`, { reason, note: note.trim() || undefined });
      setShowModal(false);
      setNote('');
      load();
    } catch (err) {
      setError(lang === 'he' ? 'השהיית השעון נכשלה' : 'Failed to pause the clock');
    } finally {
      setSaving(false);
    }
  };

  const handleResume = async () => {
    setSaving(true);
    setError('');
    try {
      await apiClient.post(`/api/projects/${projectId}/clock-resume`);
      load();
    } catch (err) {
      setError(lang === 'he' ? 'המשך השעון נכשל' : 'Failed to resume the clock');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <View style={{ marginTop: 8 }}>
      {activePause ? (
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: '#FBEAE8', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
        }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#A8433A', flex: 1 }}>
            ⏸ {lang === 'he' ? 'שעון מוקפא:' : 'Clock paused:'} {REASON_LABEL[activePause.reason]?.[lang] ?? activePause.reason}
          </Text>
          <Pressable
            onPress={handleResume}
            disabled={saving}
            style={{ borderWidth: 1, borderColor: '#A8433A', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
          >
            {saving ? <ActivityIndicator size="small" color="#A8433A" /> : (
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#A8433A' }}>{lang === 'he' ? 'המשך' : 'Resume'}</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setShowModal(true)} accessibilityRole="button">
          <Text style={{ fontSize: 11, fontWeight: '500', color: '#8899BB', textDecorationLine: 'underline' }}>
            ⏸ {lang === 'he' ? 'הקפא שעון (חופשה/מילואים/מחלה)' : 'Pause clock (leave/reserve/illness)'}
          </Text>
        </Pressable>
      )}

      {error ? <Text style={{ fontSize: 11, color: '#A8433A', marginTop: 2 }}>{error}</Text> : null}

      <Modal visible={showModal} animationType="fade" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <View style={{ width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 14, padding: 18 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#111' }}>
              {lang === 'he' ? 'הקפאת שעון היעדים' : 'Pause the deadline clock'}
            </Text>

            <Text style={{ fontSize: 12, fontWeight: '600', color: '#8899BB', marginTop: 12 }}>
              {lang === 'he' ? 'סיבה' : 'Reason'}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {(Object.keys(REASON_LABEL) as ClockPauseReason[]).map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setReason(r)}
                  style={{
                    borderWidth: 1, borderColor: reason === r ? '#2E86FF' : '#D0DEFF',
                    backgroundColor: reason === r ? '#2E86FF' : '#fff',
                    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: reason === r }}
                >
                  <Text style={{ fontSize: 12, color: reason === r ? '#fff' : '#445', fontWeight: '600' }}>
                    {REASON_LABEL[r][lang]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ fontSize: 12, fontWeight: '600', color: '#8899BB', marginTop: 12 }}>
              {lang === 'he' ? 'הערה (אופציונלי)' : 'Note (optional)'}
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              multiline
              style={{ borderWidth: 1, borderColor: '#D0DEFF', borderRadius: 8, padding: 8, marginTop: 6, minHeight: 44, fontSize: 13 }}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <Pressable onPress={() => setShowModal(false)} style={{ borderWidth: 1, borderColor: '#D0DEFF', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }} accessibilityRole="button">
                <Text style={{ fontSize: 13, color: '#445' }}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
              </Pressable>
              <Pressable
                onPress={handlePause}
                disabled={saving}
                style={{ backgroundColor: '#A8433A', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, opacity: saving ? 0.6 : 1 }}
                accessibilityRole="button"
                accessibilityState={{ disabled: saving }}
              >
                {saving ? <ActivityIndicator size="small" color="#fff" /> : (
                  <Text style={{ fontSize: 13, color: '#fff', fontWeight: '600' }}>{lang === 'he' ? 'הקפא' : 'Pause'}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
