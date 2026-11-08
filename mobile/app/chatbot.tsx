// app/chatbot.tsx
// Realizes the Stitch design "Academic Assistant: Mobile AI Chatbot" (project
// "Unified Academic Project Manager"): a full-screen help chat, pushed from
// the ChatbotFab that sits on every role's home screen except system_admin's.
// Answers come from POST /api/assistant/ask (server's assistantService.ts),
// which answers only from the user manual of the role the user is viewing as
// — it is never given the user's projects, grades or other data, and nothing
// is stored server-side; the conversation lives only in this screen. Mirrors
// the structure of app/message/[chatId].tsx (header, FlatList,
// KeyboardAvoidingView input bar) so this reads as the same kind of screen as
// the rest of the app.
//
// web/components/ChatbotFab.tsx carries the desktop counterpart of this same
// screen (an overlay panel instead of a full push) — kept as two separate
// implementations since the interaction shape differs, but the endpoint and
// quick actions are intentionally the same as web's.

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, Pressable,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Lang } from '@/components/i18n';
import type { AppRole } from '@/components/i18n';
import { apiClient } from '@/src/api/apiClient';
import { useActiveRole } from '@/contexts/ActiveRoleContext';
import { chatbotPalette as p, chatbotRadius as r, chatbotSpacing as sp } from '@/constants/chatbotTheme';

interface ChatMessage {
  id: string;
  from: 'assistant' | 'user';
  text: string;
  time: string;
  /** Shown here only, never sent to the server: the greeting, error notices,
   *  and a question whose request failed (so the history the server gets
   *  keeps alternating user/assistant turns). */
  local?: boolean;
}

type QuickAction = { en: string; he: string };

const QUICK_ACTIONS_BY_ROLE: Partial<Record<AppRole, QuickAction[]>> = {
  student: [
    { en: 'How do I submit a milestone?', he: 'איך מגישים אבן דרך?' },
    { en: 'How do I apply to a project?', he: 'איך מגישים מועמדות לפרויקט?' },
    { en: 'Where do I see my grades?', he: 'איפה רואים את הציונים?' },
  ],
  supervisor: [
    { en: 'How do I grade a submission?', he: 'איך נותנים ציון להגשה?' },
    { en: 'How do I approve an application?', he: 'איך מאשרים מועמדות?' },
    { en: 'How do I update a grade?', he: 'איך מעדכנים ציון?' },
  ],
};

const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  { en: 'What can I do in my role?', he: 'מה אפשר לעשות בתפקיד שלי?' },
  { en: 'Where do I approve requests?', he: 'איפה מאשרים בקשות?' },
  { en: 'Where are the reports?', he: 'איפה נמצאים הדוחות?' },
];

const MAX_QUESTION_CHARS = 1000;
/** Server cap is 12 turns; send the latest 11 so the history still starts
 *  (and ends) with a user question. */
const MAX_HISTORY_TURNS = 11;

function greetingText(lang: Lang): string {
  return lang === 'he'
    ? 'שלום! אפשר לשאול אותי איך עושים דברים במערכת — אני עונה לפי מדריך המשתמש של התפקיד שלך.'
    : 'Hello! Ask me how to do things in the system — I answer from the user manual for your role.';
}

function formatTime(date: Date, lang: Lang) {
  return date.toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function ChatbotScreen() {
  const router = useRouter();
  const { lang: langParam } = useLocalSearchParams<{ lang?: string }>();
  const lang: Lang = langParam === 'en' ? 'en' : 'he';
  const isRtl = lang === 'he';
  const { activeRole } = useActiveRole();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const flatRef = useRef<FlatList>(null);
  const nextId = useRef(0);

  useEffect(() => {
    setMessages([{
      id: String(nextId.current++),
      from: 'assistant',
      text: greetingText(lang),
      time: formatTime(new Date(), lang),
      local: true,
    }]);
  }, [lang]);

  const send = async (text: string) => {
    const trimmed = text.trim().slice(0, MAX_QUESTION_CHARS);
    if (!trimmed || isTyping) return;
    const userMessage: ChatMessage = { id: String(nextId.current++), from: 'user', text: trimmed, time: formatTime(new Date(), lang) };
    const history = [...messages.filter((m) => !m.local), userMessage]
      .slice(-MAX_HISTORY_TURNS)
      .map((m) => ({ role: m.from, content: m.text }));
    setMessages((prev) => [...prev, userMessage]);
    setDraft('');
    setIsTyping(true);
    try {
      if (!activeRole) throw new Error('no active role');
      const res = await apiClient.post('/api/assistant/ask', { role: activeRole, messages: history });
      const answer: string = res.data?.answer ?? '';
      setMessages((prev) => [...prev, { id: String(nextId.current++), from: 'assistant', text: answer, time: formatTime(new Date(), lang) }]);
    } catch (err: any) {
      const notice: string = err?.response?.data?.message
        || (lang === 'he' ? 'העוזר אינו זמין כרגע. נסו שוב מאוחר יותר.' : 'The assistant is unavailable right now. Please try again later.');
      setMessages((prev) => [
        ...prev.map((m) => (m.id === userMessage.id ? { ...m, local: true } : m)),
        { id: String(nextId.current++), from: 'assistant', text: notice, time: formatTime(new Date(), lang), local: true },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const quickActions = (activeRole && QUICK_ACTIONS_BY_ROLE[activeRole]) || DEFAULT_QUICK_ACTIONS;

  const clearChat = () => {
    setMessages([{
      id: String(nextId.current++),
      from: 'assistant',
      text: greetingText(lang),
      time: formatTime(new Date(), lang),
      local: true,
    }]);
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[s.header, isRtl && s.rowReverse]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={lang === 'he' ? 'חזרה' : 'Go back'}
          style={s.iconBtn}
        >
          <Text style={s.iconBtnText}>{isRtl ? '→' : '←'}</Text>
        </Pressable>

        <View style={[s.headerTitleWrap, isRtl && s.alignEnd]}>
          <Text style={[s.headerTitle, isRtl && s.textRight]}>{lang === 'he' ? 'עוזר אקדמי' : 'Academic Assistant'}</Text>
          <View style={[s.onlineRow, isRtl && s.rowReverse]}>
            <View style={s.onlineDot} />
            <Text style={s.onlineText}>{lang === 'he' ? 'מחובר' : 'Online'}</Text>
          </View>
        </View>

        <Pressable
          onPress={clearChat}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={lang === 'he' ? 'נקה שיחה' : 'Clear conversation'}
          style={s.iconBtn}
        >
          <Text style={s.iconBtnText}>🗑️</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        {/* Message history */}
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={s.messagesList}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View style={[s.msgRow, item.from === 'user' ? s.msgRowUser : s.msgRowAssistant]}>
              {item.from === 'assistant' && (
                <View style={s.avatar}>
                  <Text style={s.avatarEmoji}>🤖</Text>
                </View>
              )}
              <View style={{ maxWidth: '78%' }}>
                <View style={[s.bubble, item.from === 'user' ? s.bubbleUser : s.bubbleAssistant]}>
                  <Text style={[s.bubbleText, item.from === 'user' && s.bubbleTextUser, isRtl && s.textRight]}>{item.text}</Text>
                </View>
                <Text style={[s.msgTime, item.from === 'user' ? s.msgTimeUser : s.msgTimeAssistant]}>{item.time}</Text>
              </View>
            </View>
          )}
          ListFooterComponent={
            isTyping ? (
              <View style={[s.msgRow, s.msgRowAssistant]}>
                <View style={s.avatar}>
                  <Text style={s.avatarEmoji}>🤖</Text>
                </View>
                <View style={s.typingBubble}>
                  <Text style={s.typingDots}>• • •</Text>
                </View>
              </View>
            ) : null
          }
        />

        {/* Quick action chips */}
        <FlatList
          horizontal
          data={quickActions}
          keyExtractor={(a) => a.en}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipsRow}
          inverted={isRtl}
          renderItem={({ item }) => (
            <Pressable
              style={[s.chip, isTyping && s.sendBtnDisabled]}
              onPress={() => send(lang === 'he' ? item.he : item.en)}
              disabled={isTyping}
              accessibilityRole="button"
            >
              <Text style={s.chipText}>{lang === 'he' ? item.he : item.en}</Text>
            </Pressable>
          )}
        />

        <Text style={[s.notice, isRtl && s.textRight]}>
          {lang === 'he'
            ? 'התשובות נוצרות בבינה מלאכותית (Anthropic) לפי מדריך המשתמש, וייתכנו טעויות. העוזר אינו רואה את הנתונים שלך — אל תכתבו פרטים אישיים.'
            : "Answers are AI-generated (Anthropic) from the user manual and may contain mistakes. The assistant can't see your data — don't type personal details."}
        </Text>

        {/* Input bar */}
        <View style={[s.inputBar, isRtl && s.rowReverse]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={lang === 'he' ? 'איך עושים...?' : 'How do I...?'}
            accessibilityLabel={lang === 'he' ? 'שאלה לעוזר' : 'Question for the assistant'}
            placeholderTextColor={p.onSurfaceVariant + '99'}
            style={[s.input, isRtl && s.textRight]}
            multiline
            maxLength={MAX_QUESTION_CHARS}
          />
          <Pressable
            style={[s.sendBtn, (!draft.trim() || isTyping) && s.sendBtnDisabled]}
            onPress={() => send(draft)}
            disabled={!draft.trim() || isTyping}
            accessibilityRole="button"
            accessibilityLabel={lang === 'he' ? 'שלח' : 'Send'}
          >
            <Text style={s.sendIcon}>➤</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: p.surface },
  rowReverse: { flexDirection: 'row-reverse' },
  alignEnd: { alignItems: 'flex-end' },
  textRight: { textAlign: 'right' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: sp.md,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: p.outlineVariant,
    backgroundColor: p.surface,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  iconBtnText: { fontSize: 20 },
  headerTitleWrap: { flex: 1, marginHorizontal: sp.sm },
  headerTitle: { fontSize: 17, fontWeight: '700', color: p.primary },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: p.online },
  onlineText: { fontSize: 11, color: p.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.4 },

  messagesList: { padding: sp.md, gap: sp.md, flexGrow: 1 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: sp.sm },
  msgRowAssistant: { alignSelf: 'flex-start' },
  msgRowUser: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },

  avatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: p.primaryContainer,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 15 },

  bubble: { borderRadius: r.xl, padding: sp.sm + 4 },
  bubbleAssistant: {
    backgroundColor: p.surfaceContainerLow,
    borderWidth: 1,
    borderColor: p.outlineVariant,
    borderTopLeftRadius: r.sm,
  },
  bubbleUser: {
    backgroundColor: p.primary,
    borderTopRightRadius: r.sm,
  },
  bubbleText: { fontSize: 14, lineHeight: 20, color: p.onSurface },
  bubbleTextUser: { color: p.onPrimary },

  msgTime: { fontSize: 10, color: p.onSurfaceVariant, marginTop: 2, marginHorizontal: 4 },
  msgTimeAssistant: { textAlign: 'left' },
  msgTimeUser: { textAlign: 'right' },

  typingBubble: {
    backgroundColor: p.surfaceContainerLow,
    borderWidth: 1,
    borderColor: p.outlineVariant,
    borderRadius: r.xl,
    borderTopLeftRadius: r.sm,
    paddingHorizontal: sp.sm + 4,
    paddingVertical: sp.sm,
  },
  typingDots: { fontSize: 14, color: p.onSurfaceVariant, letterSpacing: 2 },

  chipsRow: { paddingHorizontal: sp.md, paddingVertical: sp.sm, gap: sp.sm },
  chip: {
    borderWidth: 1,
    borderColor: p.primary + '4D',
    backgroundColor: p.surface,
    borderRadius: 999,
    paddingHorizontal: sp.md,
    paddingVertical: sp.sm,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: p.primary },

  notice: { fontSize: 11, lineHeight: 15, color: p.onSurfaceVariant, paddingHorizontal: sp.md, paddingBottom: sp.xs },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: sp.sm,
    padding: sp.md,
    paddingTop: sp.sm,
    borderTopWidth: 1,
    borderTopColor: p.outlineVariant,
    backgroundColor: p.surface,
  },
  input: {
    flex: 1,
    backgroundColor: p.surfaceContainerLow,
    borderWidth: 1,
    borderColor: p.outlineVariant,
    borderRadius: r.xl,
    paddingHorizontal: sp.md,
    paddingVertical: sp.sm + 4,
    fontSize: 14,
    color: p.onSurface,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: r.xl,
    backgroundColor: p.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendIcon: { color: p.onPrimary, fontSize: 18 },
});
