// components/FeedbackChat.tsx
//
// Permanent feedback/bug-report/feature-request chat shown as a tab on the
// notifications screen (mobile/app/(tabs)/notifications.tsx), for every role
// except system_admin. Each message is AI-classified server-side
// (see server/src/services/feedbackService.ts) as soon as it's sent: "noise"
// is erased immediately (never shown here again), "real" feedback persists
// and surfaces to system_admin in the admin panel's Feedback tab. This is a
// one-way channel — system_admin does not reply in-thread.

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, Pressable,
  ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { apiClient } from '../src/api/apiClient';
import type { Lang } from './i18n';

interface FeedbackMessage {
  id: string;
  text: string;
  classification: 'pending' | 'real' | 'noise';
  status: 'open' | 'resolved' | null;
  createdAt: string | null;
}

export default function FeedbackChat({ lang }: { lang: Lang }) {
  const isRtl = lang === 'he';
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [loading, setLoading]   = useState(true);
  const [text, setText]         = useState('');
  const [sending, setSending]   = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = async () => {
    try {
      const res = await apiClient.get('/api/feedback');
      setMessages(res.data.messages ?? []);
    } catch (err) {
      console.error('Failed to load feedback messages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');
    try {
      await apiClient.post('/api/feedback', { text: trimmed });
      await fetchMessages();
    } catch (err) {
      console.error('Failed to send feedback:', err);
      setText(trimmed);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={[s.intro, isRtl && s.textRight]}>
        {lang === 'he'
          ? '💬 שתפו תקלות, בקשות לפיצ׳רים או כל משוב שיעזור לנו לשפר את האפליקציה. הודעות שאינן רלוונטיות יימחקו אוטומטית.'
          : '💬 Share bugs, feature requests, or any feedback that could improve the app. Irrelevant messages are erased automatically.'}
      </Text>

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color="#2E86FF" /></View>
      ) : messages.length === 0 ? (
        <View style={s.centered}>
          <Text style={s.emptyEmoji}>💬</Text>
          <Text style={s.emptyText}>
            {lang === 'he' ? 'אין הודעות עדיין' : 'No messages yet'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <View style={[s.bubble, isRtl && s.bubbleRtl]}>
              <Text style={[s.bubbleText, isRtl && s.textRight]}>{item.text}</Text>
              {item.classification === 'real' && (
                <Text style={s.statusTag}>
                  {item.status === 'resolved'
                    ? (lang === 'he' ? '✅ טופל' : '✅ Resolved')
                    : (lang === 'he' ? '📨 נשלח לצוות' : '📨 Sent to the team')}
                </Text>
              )}
            </View>
          )}
        />
      )}

      <View style={[s.composer, isRtl && s.composerRtl]}>
        <TextInput
          style={[s.input, isRtl && s.textRight]}
          value={text}
          onChangeText={setText}
          placeholder={lang === 'he' ? 'כתבו הודעה...' : 'Type a message...'}
          placeholderTextColor="#9CA3AF"
          multiline
        />
        <Pressable style={[s.sendBtn, sending && s.sendBtnDisabled]} onPress={handleSend} disabled={sending}>
          {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.sendBtnText}>➤</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:     { flex: 1 },
  textRight:{ textAlign: 'right' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  intro: {
    fontSize: 12, color: '#64748B', lineHeight: 17,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#F0F4FF',
  },

  emptyEmoji: { fontSize: 48, marginBottom: 10 },
  emptyText:  { fontSize: 14, color: '#8899BB' },

  list: { padding: 14, gap: 10 },
  bubble: {
    backgroundColor: '#fff', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#E0E8FF', alignSelf: 'flex-start', maxWidth: '90%',
  },
  bubbleRtl:  { alignSelf: 'flex-end' },
  bubbleText: { fontSize: 14, color: '#1E293B', lineHeight: 20 },
  statusTag:  { fontSize: 11, color: '#2E86FF', fontWeight: '600', marginTop: 6 },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 12, borderTopWidth: 1, borderTopColor: '#E0E8FF', backgroundColor: '#fff',
  },
  composerRtl: { flexDirection: 'row-reverse' },
  input: {
    flex: 1, borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: '#1E293B',
    maxHeight: 100, backgroundColor: '#F8FAFF',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#2E86FF',
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText:     { color: '#fff', fontSize: 18, fontWeight: '700' },
});
