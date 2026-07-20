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
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { apiClient } from '../src/api/apiClient';
import type { Lang } from './i18n';
import { FeedbackChatStyles } from '../constants/styles';

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
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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

const s = FeedbackChatStyles;
