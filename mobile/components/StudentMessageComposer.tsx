// components/StudentMessageComposer.tsx
// Mobile counterpart of web/app/notifications/StudentMessageComposer.tsx —
// second half of the administrative coordinator's "message selected
// students" flow. She ticks students on the Students Report
// (administrative_coordinator_dashboard.tsx), taps "Send message", and lands
// on the Notifications screen with ?compose=students; the selection itself
// comes through utils/studentMessageDraft.ts. She can drop anyone picked by
// mistake, write the message and send it — the server
// (projectCoordinatorController.ts's sendStudentsMessage) fans it out over
// in-app + email + push + SMS + WhatsApp.

import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { apiClient } from '@/src/api/apiClient';
import { ap } from '@/constants/theme';
import type { Lang } from './i18n';
import {
  clearStudentMessageRecipients,
  saveStudentMessageRecipients,
  type StudentMessageRecipient,
} from '@/utils/studentMessageDraft';

const MAX_TITLE = 150;
const MAX_MESSAGE = 2000;

export default function StudentMessageComposer({
  initialRecipients,
  lang,
  onDone,
}: {
  initialRecipients: StudentMessageRecipient[];
  lang: Lang;
  /** Called after a successful send or when she discards the draft. */
  onDone: () => void;
}) {
  const isRtl = lang === 'he';
  const [recipients, setRecipients] = useState(initialRecipients);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const removeRecipient = (id: string) => {
    setRecipients((prev) => {
      const next = prev.filter((r) => r.id !== id);
      saveStudentMessageRecipients(next);
      return next;
    });
  };

  const discard = () => {
    clearStudentMessageRecipients();
    onDone();
  };

  const canSend = recipients.length > 0 && title.trim().length > 0 && message.trim().length > 0 && !sending;

  const send = async () => {
    setSending(true);
    setError('');
    try {
      const res = await apiClient.post('/api/project-coordinator/students/message', {
        studentIds: recipients.map((r) => r.id),
        title: title.trim(),
        message: message.trim(),
      });
      const sent: number = res.data?.sent ?? 0;
      const failed: number = res.data?.failed ?? 0;
      clearStudentMessageRecipients();
      Alert.alert(
        '✅',
        (lang === 'he' ? `ההודעה נשלחה ל־${sent} סטודנטים` : `Message sent to ${sent} student${sent === 1 ? '' : 's'}`) +
          (failed > 0 ? (lang === 'he' ? `\nשליחה ל־${failed} נכשלה.` : `\nSending failed for ${failed}.`) : ''),
      );
      onDone();
    } catch (err: any) {
      setError(err?.response?.data?.message || (lang === 'he' ? 'שליחת ההודעה נכשלה' : 'Failed to send the message'));
    } finally {
      setSending(false);
    }
  };

  // A real confirm step — this goes out by SMS/WhatsApp too and can't be
  // pulled back once sent.
  const confirmSend = () => {
    Alert.alert(
      lang === 'he' ? 'שליחת הודעה' : 'Send message',
      lang === 'he'
        ? `ההודעה תישלח ל־${recipients.length} סטודנטים במייל, באפליקציה, ב־SMS ובוואטסאפ. לא ניתן לבטל לאחר השליחה. להמשיך?`
        : `This will send the message to ${recipients.length} student${recipients.length === 1 ? '' : 's'} by email, in-app, SMS and WhatsApp. It can't be undone. Continue?`,
      [
        { text: lang === 'he' ? 'ביטול' : 'Cancel', style: 'cancel' },
        { text: lang === 'he' ? 'שליחה' : 'Send', onPress: send },
      ],
    );
  };

  const inputStyle = {
    borderWidth: 1,
    borderColor: ap.outlineVariant,
    borderRadius: 10,
    backgroundColor: ap.surfaceContainerLowest,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: ap.onSurface,
  } as const;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: ap.onSurface, textAlign: isRtl ? 'right' : 'left' }}>
            ✉️ {lang === 'he' ? 'הודעה לסטודנטים שנבחרו' : 'Message to selected students'}
          </Text>
          <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, marginTop: 2, textAlign: isRtl ? 'right' : 'left' }}>
            {lang === 'he' ? 'תישלח באפליקציה, במייל, בהתראת פוש, ב־SMS ובוואטסאפ.' : 'Goes out in-app, by email, push, SMS and WhatsApp.'}
          </Text>
        </View>
        <Pressable onPress={discard} accessibilityRole="button" hitSlop={8}>
          <Text style={{ fontSize: 13, color: ap.onSurfaceVariant }}>{lang === 'he' ? 'ביטול' : 'Discard'}</Text>
        </Pressable>
      </View>

      <Text style={{ fontSize: 12, fontWeight: '600', color: ap.onSurfaceVariant, marginBottom: 6, textAlign: isRtl ? 'right' : 'left' }}>
        {lang === 'he' ? `נמענים (${recipients.length})` : `Recipients (${recipients.length})`}
      </Text>
      {recipients.length === 0 ? (
        <Text style={{ fontSize: 12, color: ap.error, marginBottom: 12, textAlign: isRtl ? 'right' : 'left' }}>
          {lang === 'he' ? 'לא נותרו נמענים — חזרו לדוח הסטודנטים כדי לבחור מחדש.' : 'No recipients left — go back to the Students Report to pick again.'}
        </Text>
      ) : (
        <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {recipients.map((r) => (
            <View
              key={r.id}
              style={{
                flexDirection: isRtl ? 'row-reverse' : 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: ap.outlineVariant,
                backgroundColor: ap.surfaceContainerLow,
                borderRadius: 999,
                paddingVertical: 3,
                paddingHorizontal: 10,
                gap: 6,
              }}
            >
              <Text style={{ fontSize: 12, color: ap.onSurface }}>{r.name || '—'}</Text>
              <Pressable
                onPress={() => removeRecipient(r.id)}
                accessibilityRole="button"
                accessibilityLabel={lang === 'he' ? `הסרת ${r.name}` : `Remove ${r.name}`}
                hitSlop={8}
              >
                <Text style={{ fontSize: 12, color: ap.onSurfaceVariant }}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Text style={{ fontSize: 12, fontWeight: '600', color: ap.onSurfaceVariant, marginBottom: 4, textAlign: isRtl ? 'right' : 'left' }}>
        {lang === 'he' ? 'כותרת' : 'Title'}
      </Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        maxLength={MAX_TITLE}
        style={[inputStyle, { marginBottom: 12 }]}
        textAlign={isRtl ? 'right' : 'left'}
        accessibilityLabel={lang === 'he' ? 'כותרת' : 'Title'}
      />
      <Text style={{ fontSize: 12, fontWeight: '600', color: ap.onSurfaceVariant, marginBottom: 4, textAlign: isRtl ? 'right' : 'left' }}>
        {lang === 'he' ? 'תוכן ההודעה' : 'Message'}
      </Text>
      <TextInput
        value={message}
        onChangeText={setMessage}
        maxLength={MAX_MESSAGE}
        multiline
        style={[inputStyle, { minHeight: 120, textAlignVertical: 'top' }]}
        textAlign={isRtl ? 'right' : 'left'}
        accessibilityLabel={lang === 'he' ? 'תוכן ההודעה' : 'Message'}
      />
      <Text style={{ fontSize: 11, color: ap.onSurfaceVariant, marginTop: 4, marginBottom: 12, textAlign: isRtl ? 'left' : 'right' }}>
        {message.length}/{MAX_MESSAGE}
      </Text>

      {!!error && (
        <Text style={{ fontSize: 13, color: ap.onErrorContainer, backgroundColor: ap.errorContainer, padding: 10, borderRadius: 8, marginBottom: 12 }}>
          ⚠️ {error}
        </Text>
      )}

      <Pressable
        onPress={confirmSend}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSend }}
        style={{
          backgroundColor: ap.primary,
          borderRadius: 10,
          paddingVertical: 12,
          alignItems: 'center',
          opacity: canSend ? 1 : 0.4,
        }}
      >
        {sending ? (
          <ActivityIndicator color={ap.onPrimary} />
        ) : (
          <Text style={{ color: ap.onPrimary, fontWeight: '700', fontSize: 14 }}>📤 {lang === 'he' ? 'שליחה' : 'Send'}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}
