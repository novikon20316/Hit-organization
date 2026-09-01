// app/chatbot.tsx
// Realizes the Stitch design "Academic Assistant: Mobile AI Chatbot" (project
// "Unified Academic Project Manager"): a full-screen chat, pushed from the
// ChatbotFab that sits on every role's home screen except system_admin's.
// There is still no AI backend (see server/) — replies come from simple local
// keyword matching, not a model — so the assistant only ever answers with
// pointers into the app itself and never claims to read a user's real project
// data. Mirrors the structure of app/message/[chatId].tsx (header, FlatList,
// KeyboardAvoidingView input bar) so this reads as the same kind of screen as
// the rest of the app.
//
// web/components/ChatbotFab.tsx carries the desktop counterpart of this same
// screen (an overlay panel instead of a full push) — kept as two separate
// implementations since the interaction shape differs, but the reply logic
// and quick actions below are intentionally the same three intents as web's.

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, Pressable,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Lang } from '@/components/i18n';
import { chatbotPalette as p, chatbotRadius as r, chatbotSpacing as sp } from '@/constants/chatbotTheme';

interface ChatMessage {
  id: string;
  from: 'assistant' | 'user';
  text: string;
  time: string;
}

const QUICK_ACTIONS: { en: string; he: string }[] = [
  { en: 'Check my next milestone', he: 'מהי אבן הדרך הבאה שלי?' },
  { en: 'Where do I submit files?', he: 'איפה מעלים קבצים?' },
  { en: 'How do I contact my supervisor?', he: 'איך יוצרים קשר עם המנחה?' },
];

function formatTime(date: Date, lang: Lang) {
  return date.toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-US', { hour: 'numeric', minute: '2-digit' });
}

// Keyword-matched canned replies — same three intents as the web overlay's,
// kept honest about there being no real backend behind this yet.
function replyTo(text: string, lang: Lang): string {
  const q = text.toLowerCase();
  if (/milestone|deadline|due|אבן|מועד/.test(q)) {
    return lang === 'he'
      ? 'ניתן לראות את אבני הדרך והמועדים הקרובים בעמוד הפרויקט שלך, תחת "אבני דרך".'
      : 'You can see your upcoming milestones and due dates on your project page, under "Milestones".';
  }
  if (/file|upload|submit|document|קובץ|קבצים|להעלות/.test(q)) {
    return lang === 'he'
      ? 'קבצים מועלים דרך עמוד הפרויקט שלך, בלשונית הקבצים של אבן הדרך הרלוונטית.'
      : 'Files are uploaded from your project page, in the file panel for the relevant milestone.';
  }
  if (/supervisor|mentor|contact|email|message|מנחה|קשר|הודעה/.test(q)) {
    return lang === 'he'
      ? 'אפשר ליצור קשר עם המנחה שלך דרך עמוד ההודעות באפליקציה.'
      : 'You can reach your supervisor through the Messages tab in the app.';
  }
  return lang === 'he'
    ? 'עדיין אני לומד לענות על שאלות כאלה. לעזרה ממוקדת יותר, נסו את עמוד ההודעות או פנו לרכז שלכם.'
    : "I'm still learning to answer questions like that. For more specific help, try the Messages tab or reach out to your coordinator.";
}

export default function ChatbotScreen() {
  const router = useRouter();
  const { lang: langParam } = useLocalSearchParams<{ lang?: string }>();
  const lang: Lang = langParam === 'en' ? 'en' : 'he';
  const isRtl = lang === 'he';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const flatRef = useRef<FlatList>(null);
  const nextId = useRef(0);

  useEffect(() => {
    setMessages([{
      id: String(nextId.current++),
      from: 'assistant',
      text: lang === 'he' ? 'שלום! אני העוזר האקדמי שלך. איך אפשר לעזור היום?' : "Hello! I'm your Academic Assistant. How can I help you today?",
      time: formatTime(new Date(), lang),
    }]);
  }, [lang]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { id: String(nextId.current++), from: 'user', text: trimmed, time: formatTime(new Date(), lang) }]);
    setDraft('');
    setIsTyping(true);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: String(nextId.current++), from: 'assistant', text: replyTo(trimmed, lang), time: formatTime(new Date(), lang) },
      ]);
      setIsTyping(false);
    }, 600);
  };

  const clearChat = () => {
    setMessages([{
      id: String(nextId.current++),
      from: 'assistant',
      text: lang === 'he' ? 'שלום! אני העוזר האקדמי שלך. איך אפשר לעזור היום?' : "Hello! I'm your Academic Assistant. How can I help you today?",
      time: formatTime(new Date(), lang),
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
          data={QUICK_ACTIONS}
          keyExtractor={(a) => a.en}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipsRow}
          inverted={isRtl}
          renderItem={({ item }) => (
            <Pressable style={s.chip} onPress={() => send(lang === 'he' ? item.he : item.en)}>
              <Text style={s.chipText}>{lang === 'he' ? item.he : item.en}</Text>
            </Pressable>
          )}
        />

        {/* Input bar */}
        <View style={[s.inputBar, isRtl && s.rowReverse]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={lang === 'he' ? 'שאלו על פרויקטים, ציונים...' : 'Ask about projects, grades...'}
            placeholderTextColor={p.onSurfaceVariant + '99'}
            style={[s.input, isRtl && s.textRight]}
            multiline
            maxLength={2000}
          />
          <Pressable
            style={[s.sendBtn, !draft.trim() && s.sendBtnDisabled]}
            onPress={() => send(draft)}
            disabled={!draft.trim()}
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
