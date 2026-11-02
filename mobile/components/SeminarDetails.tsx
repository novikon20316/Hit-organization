// components/SeminarDetails.tsx
// Mirror of web's app/student/home/SeminarDetails.tsx: the booked seminar
// date (or that one is on its way), and a way to write to the administrative
// coordinator if it doesn't work — students have no chat with her.

import React, { useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, ActivityIndicator } from 'react-native';
import { apiClient } from '@/src/api/apiClient';
import { studentPalette } from '@/constants';
import { SEMINAR_COLOR, formatSeminarDay, type SeminarAttempt, type SeminarSlot } from '@/utils/seminar';

interface SeminarDetailsProps {
  milestoneId: string;
  status: string;
  schedule?: SeminarSlot | null;
  attempts?: SeminarAttempt[];
  lang: 'he' | 'en';
  isRtl: boolean;
}

export function SeminarDetails({ milestoneId, status, schedule, attempts, lang, isRtl }: SeminarDetailsProps) {
  const [contactOpen, setContactOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const slot = status === 'seminar_scheduled' ? schedule : null;
  const missed = (attempts ?? []).filter((a) => a.outcome === 'not_performed');
  const textAlign = isRtl ? 'right' : 'left';

  const send = async () => {
    if (!message.trim()) return;
    setSending(true);
    setError('');
    try {
      await apiClient.post(`/api/milestones/${milestoneId}/seminar-contact`, { message: message.trim() });
      setContactOpen(false);
      setSent(true);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? (lang === 'he' ? 'שליחת ההודעה נכשלה' : 'Failed to send your message'));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ marginTop: 8, borderWidth: 1, borderColor: `${SEMINAR_COLOR}55`, backgroundColor: `${SEMINAR_COLOR}0D`, borderRadius: 10, padding: 10 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: SEMINAR_COLOR, textAlign }}>🎤 {lang === 'he' ? 'מועד הסמינר' : 'Seminar date'}</Text>
      {slot ? (
        <>
          <Text style={{ fontSize: 12, color: studentPalette.onSurface, marginTop: 4, textAlign }}>📅 {formatSeminarDay(slot.date, lang)}</Text>
          <Text style={{ fontSize: 12, color: studentPalette.onSurface, marginTop: 2, textAlign }}>🕐 {slot.time}</Text>
          {!!slot.location && <Text style={{ fontSize: 12, color: studentPalette.onSurface, marginTop: 2, textAlign }}>🏫 {slot.location}</Text>}
          {!!slot.note && <Text style={{ fontSize: 12, color: studentPalette.onSurfaceVariant, marginTop: 2, textAlign }}>{slot.note}</Text>}
        </>
      ) : (
        <Text style={{ fontSize: 12, color: studentPalette.onSurfaceVariant, marginTop: 4, textAlign }}>
          {lang === 'he' ? 'המנחה אישר/ה. הרכזת האדמיניסטרטיבית תקבע מועד ותישלח אליך הודעה.' : 'Your supervisor approved. The administrative coordinator will set the date and notify you.'}
        </Text>
      )}
      {missed.length > 0 && (
        <Text style={{ fontSize: 12, color: studentPalette.error, marginTop: 4, textAlign }}>
          {lang === 'he' ? 'לא בוצע במועד:' : 'Not performed on:'} {missed.map((a) => formatSeminarDay(a.date, lang, { day: 'numeric', month: 'numeric', year: '2-digit' })).join(', ')}
        </Text>
      )}
      {sent ? (
        <Text style={{ fontSize: 12, fontWeight: '600', color: studentPalette.statusGraded, marginTop: 8, textAlign }}>
          ✅ {lang === 'he' ? 'ההודעה נשלחה לרכזת' : 'Your message was sent to the coordinator'}
        </Text>
      ) : (
        <Pressable onPress={() => setContactOpen(true)} accessibilityRole="button" style={{ marginTop: 8, borderWidth: 1, borderColor: studentPalette.outlineVariant, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: studentPalette.onSurface, textAlign: 'center' }}>
            ✉️ {lang === 'he' ? 'פנייה לרכזת האדמיניסטרטיבית' : 'Contact the administrative coordinator'}
          </Text>
        </Pressable>
      )}

      <Modal visible={contactOpen} transparent animationType="fade" onRequestClose={() => setContactOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: studentPalette.onSurface, textAlign }}>
              ✉️ {lang === 'he' ? 'פנייה לרכזת האדמיניסטרטיבית' : 'Contact the administrative coordinator'}
            </Text>
            <Text style={{ fontSize: 12, color: studentPalette.onSurfaceVariant, marginTop: 6, textAlign }}>
              {lang === 'he' ? 'למשל: המועד אינו מתאים, והצעה למועדים אחרים.' : "For example: the date doesn't work for you, and other dates that do."}
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={1000}
              accessibilityLabel={lang === 'he' ? 'הודעה' : 'Message'}
              style={{ borderWidth: 1, borderColor: studentPalette.outlineVariant, borderRadius: 10, padding: 10, minHeight: 90, marginTop: 10, textAlign, textAlignVertical: 'top', color: studentPalette.onSurface }}
            />
            {!!error && <Text style={{ fontSize: 12, color: studentPalette.error, marginTop: 6, textAlign }}>{error}</Text>}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Pressable onPress={() => setContactOpen(false)} accessibilityRole="button" style={{ flex: 1, borderWidth: 1, borderColor: studentPalette.outlineVariant, borderRadius: 10, paddingVertical: 10 }}>
                <Text style={{ textAlign: 'center', fontSize: 13, fontWeight: '600', color: studentPalette.onSurface }}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
              </Pressable>
              <Pressable onPress={send} disabled={sending || !message.trim()} accessibilityRole="button" style={{ flex: 1, backgroundColor: studentPalette.primary, borderRadius: 10, paddingVertical: 10, opacity: sending || !message.trim() ? 0.4 : 1 }}>
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={{ textAlign: 'center', fontSize: 13, fontWeight: '700', color: '#fff' }}>{lang === 'he' ? 'שליחה' : 'Send'}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
