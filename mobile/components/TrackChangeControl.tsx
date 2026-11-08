// components/TrackChangeControl.tsx
// Coordinator/program-head action to switch a project between the thesis
// and non-thesis project tracks. Ports web's components/TrackChangeControl.tsx
// onto the same endpoint (trackChangeController.ts — TRACK_CHANGE_ROLES +
// scope checks live there). The server closes the current project with a
// terminal status (preserving its full milestone/grade/audit history) and
// creates a fresh project + milestone set on the new track — see
// services/trackChange.ts. Styled like ClockPauseControl.tsx, which it sits
// next to on the same cards.

import React, { useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, ActivityIndicator } from 'react-native';
import { apiClient } from '@/src/api/apiClient';
import type { Lang } from './i18n';

type Track = 'thesis' | 'project';

export function TrackChangeControl({ projectId, lang, onChanged }: { projectId: string; lang: Lang; onChanged?: (newProjectId: string) => void }) {
  const he = lang === 'he';
  const [showModal, setShowModal] = useState(false);
  const [newTrack, setNewTrack] = useState<Track>('project');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const close = () => {
    if (saving) return;
    setShowModal(false);
    setDone(false);
    setError('');
    setReason('');
  };

  const handleConfirm = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await apiClient.post(`/api/projects/${projectId}/track-change`, { newTrack, reason: reason.trim() || undefined });
      setDone(true);
      onChanged?.(res.data?.newProjectId);
    } catch (err: any) {
      // Prefer the server's per-language variant (trackChange.ts's
      // TrackChangeError) when it sent one — same as web.
      const body = err.response?.data;
      setError(body?.[he ? 'messageHe' : 'messageEn'] ?? body?.message ?? (he ? 'שינוי המסלול נכשל' : 'Failed to change track'));
    } finally {
      setSaving(false);
    }
  };

  const trackButton = (track: Track, label: string) => (
    <Pressable
      key={track}
      onPress={() => setNewTrack(track)}
      style={{
        flex: 1, borderWidth: 1, borderColor: newTrack === track ? '#2E86FF' : '#D0DEFF',
        backgroundColor: newTrack === track ? '#2E86FF' : '#fff',
        borderRadius: 8, paddingVertical: 8, alignItems: 'center',
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: newTrack === track }}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: newTrack === track ? '#fff' : '#445' }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ marginTop: 6 }}>
      <Pressable onPress={() => setShowModal(true)} accessibilityRole="button">
        <Text style={{ fontSize: 11, fontWeight: '500', color: '#8899BB', textDecorationLine: 'underline' }}>
          🔀 {he ? 'שנה מסלול (תזה/פרויקט)' : 'Change track (thesis/project)'}
        </Text>
      </Pressable>

      <Modal visible={showModal} animationType="fade" transparent onRequestClose={close}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <View style={{ width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 14, padding: 18 }}>
            {done ? (
              <>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#111' }}>✅ {he ? 'המסלול הוחלף' : 'Track changed'}</Text>
                <Text style={{ fontSize: 12, color: '#667', marginTop: 8 }}>
                  {he
                    ? 'הרשומה הישנה נסגרה (ההיסטוריה נשמרה) ונפתחה רשומה חדשה במסלול שנבחר.'
                    : 'The old record was closed (its history is preserved) and a new one was opened on the selected track.'}
                </Text>
                <Pressable onPress={close} style={{ marginTop: 16, borderWidth: 1, borderColor: '#D0DEFF', borderRadius: 8, paddingVertical: 8, alignItems: 'center' }} accessibilityRole="button">
                  <Text style={{ fontSize: 13, color: '#445' }}>{he ? 'סגור' : 'Close'}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#111' }}>{he ? 'שינוי מסלול' : 'Change track'}</Text>
                <Text style={{ fontSize: 12, color: '#667', marginTop: 8 }}>
                  {he
                    ? 'פעולה זו תסגור את רשומת הפרויקט הנוכחית (כל ההיסטוריה שלה תישמר לצפייה) ותפתח רשומה חדשה במסלול שתבחר, עם אבני דרך חדשות בהתאם.'
                    : 'This will close the current project record (its full history stays visible) and open a fresh record on the track you pick, with new milestones for that track.'}
                </Text>

                <Text style={{ fontSize: 12, fontWeight: '600', color: '#8899BB', marginTop: 12 }}>{he ? 'מסלול חדש' : 'New track'}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  {trackButton('thesis', he ? 'תזה' : 'Thesis')}
                  {trackButton('project', he ? 'פרויקט' : 'Project')}
                </View>

                <Text style={{ fontSize: 12, fontWeight: '600', color: '#8899BB', marginTop: 12 }}>{he ? 'סיבה (אופציונלי)' : 'Reason (optional)'}</Text>
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  textAlign={he ? 'right' : 'left'}
                  style={{ borderWidth: 1, borderColor: '#D0DEFF', borderRadius: 8, padding: 8, marginTop: 6, minHeight: 44, fontSize: 13 }}
                />

                {error ? <Text style={{ fontSize: 12, color: '#A8433A', marginTop: 8 }} accessibilityRole="alert">{error}</Text> : null}

                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                  <Pressable onPress={close} disabled={saving} style={{ borderWidth: 1, borderColor: '#D0DEFF', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, opacity: saving ? 0.5 : 1 }} accessibilityRole="button">
                    <Text style={{ fontSize: 13, color: '#445' }}>{he ? 'ביטול' : 'Cancel'}</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleConfirm}
                    disabled={saving}
                    style={{ backgroundColor: '#2E86FF', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, opacity: saving ? 0.6 : 1 }}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: saving }}
                  >
                    {saving ? <ActivityIndicator size="small" color="#fff" /> : (
                      <Text style={{ fontSize: 13, color: '#fff', fontWeight: '600' }}>{he ? 'אשר שינוי' : 'Confirm change'}</Text>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
