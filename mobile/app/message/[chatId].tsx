// app/message/[chatId].tsx

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TextInput, Pressable, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { auth } from '../../src/firebase/firebase';
import { roleColor } from './new';
import { apiClient } from '@/src/api/apiClient';

interface Message {
  id:        string;
  text:      string;
  senderId:  string;
  createdAt: string | null; // ISO string from backend, never a Firestore Timestamp
}

// ─── Role → readable label ────────────────────────────────────────────────────
function roleLabel(role: string): string {
  const map: Record<string, string> = {
    student:       'Student',
    supervisor:    'Supervisor',
    examiner:      'Examiner',
    coordinator:   'Coordinator',
    faculty_admin: 'Faculty Admin',
    system_admin:  'System Admin',
  };
  return map[role] ?? role;
}

// ─── Format timestamp ─────────────────────────────────────────────────────────
// createdAt is now always an ISO string (or null) — no Firestore Timestamp objects.
function formatTime(isoString: string | null): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Returns true if two ISO timestamps are more than 5 minutes apart
function isMoreThan5MinApart(a: string | null, b: string | null): boolean {
  if (!a || !b) return true;
  const diff = new Date(a).getTime() - new Date(b).getTime();
  return Math.abs(diff) > 5 * 60 * 1000;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const router                           = useRouter();
  const { chatId, otherName, otherRole } = useLocalSearchParams<{
    chatId:    string;
    otherName: string;
    otherRole: string;
  }>();

  const currentUser = auth.currentUser;
  const flatRef     = useRef<FlatList>(null);

  const [messages,   setMessages]   = useState<Message[]>([]);
  const [text,       setText]       = useState('');
  const [sending,    setSending]    = useState(false);
  const [headerName, setHeaderName] = useState(otherName ?? '');
  const [headerRole, setHeaderRole] = useState(otherRole ?? '');

  // ── Fetch messages (polls every 3s) ────────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    if (!chatId || !currentUser) return;
    try {
      const res = await apiClient.get(`/api/chats/${chatId}/messages`);
      setMessages(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  }, [chatId, currentUser]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // ── Look up header metadata if not passed as params ────────────────────────
  useEffect(() => {
    if (headerName || !currentUser || !chatId) return;

    const fetchChatMetadata = async () => {
      try {
        const response = await apiClient.get(`/api/chats/${chatId}/meta`);
        // meta returns all participants; find the other person
        const other = response.data.participants?.find(
          (p: any) => p.id !== currentUser.uid
        );
        if (other) {
          setHeaderName(other.name  ?? 'Unknown');
          setHeaderRole(other.role  ?? '');
        }
      } catch (err) {
        console.error('Failed to look up chat metadata:', err);
      }
    };

    fetchChatMetadata();
  }, [chatId, currentUser, headerName]);

  // ── Mark chat notifications as read when opening ───────────────────────────
  useEffect(() => {
    if (!chatId || !currentUser) return;
    apiClient.post(`/api/chats/${chatId}/read`).catch(() => {});
  }, [chatId, currentUser]);

  // ── Send ───────────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed || !currentUser || sending) return;
    setSending(true);
    setText('');
    try {
      await apiClient.post(`/api/chats/${chatId}/messages`, {
        text:     trimmed,
        senderId: currentUser.uid,
      });
      // Immediately fetch so the sent message appears without waiting for the interval
      await fetchMessages();
    } catch (err) {
      console.error('Send message error:', err);
      setText(trimmed); // restore on failure
    } finally {
      setSending(false);
    }
  };

  // ── Derived header values ──────────────────────────────────────────────────
  const initials    = headerName
    ? headerName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';
  const accentColor = roleColor(headerRole);

  return (
    <SafeAreaView style={s.root}>

      {/* ── Top header ── */}
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backArrow}>←</Text>
        </Pressable>

        <View style={[s.avatar, { backgroundColor: accentColor }]}>
          <Text style={s.avatarText}>{initials}</Text>
        </View>

        <View style={s.headerInfo}>
          <Text style={s.headerName} numberOfLines={1}>
            {headerName || '…'}
          </Text>
          {headerRole ? (
            <View style={[s.roleBadge, { backgroundColor: accentColor + '22' }]}>
              <Text style={[s.roleBadgeText, { color: accentColor }]}>
                {roleLabel(headerRole)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* ── Messages ── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.messagesList}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={s.emptyChat}>
              <Text style={s.emptyChatEmoji}>💬</Text>
              <Text style={s.emptyChatText}>No messages yet. Say hi!</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const mine    = item.senderId === currentUser?.uid;
            const prevMsg = messages[index - 1];

            // Both timestamps are now plain ISO strings — safe to compare
            const showTime = !prevMsg || isMoreThan5MinApart(
              item.createdAt,
              prevMsg.createdAt
            );

            return (
              <>
                {showTime && item.createdAt && (
                  <Text style={s.timeStamp}>{formatTime(item.createdAt)}</Text>
                )}
                <View style={[s.msgWrap, mine && s.msgWrapMine]}>
                  <View style={[s.bubble, mine && s.bubbleMine]}>
                    <Text style={[s.bubbleText, mine && s.bubbleTextMine]}>
                      {item.text}
                    </Text>
                  </View>
                </View>
              </>
            );
          }}
        />

        {/* ── Input bar ── */}
        <View style={s.inputBar}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Write a message…"
            placeholderTextColor="#9BA8C0"
            style={s.input}
            multiline
            maxLength={4000}
            onSubmitEditing={sendMessage}
            blurOnSubmit={false}
          />
          <Pressable
            style={[s.sendBtn, (!text.trim() || sending) && s.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!text.trim() || sending}
          >
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.sendIcon}>➤</Text>
            }
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EDF3FF' },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   12,
    backgroundColor:   '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E8FF',
    elevation:         3,
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: 1 },
    shadowOpacity:     0.06,
    shadowRadius:      4,
    gap:               12,
  },
  backBtn: {
    width:           36,
    height:          36,
    borderRadius:    18,
    backgroundColor: '#F0F4FF',
    justifyContent:  'center',
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     '#D0DEFF',
  },
  backArrow:    { fontSize: 18, color: '#2E86FF', fontWeight: '700' },
  avatar: {
    width:          44,
    height:         44,
    borderRadius:   22,
    justifyContent: 'center',
    alignItems:     'center',
  },
  avatarText:   { color: '#fff', fontWeight: '900', fontSize: 16 },
  headerInfo:   { flex: 1, justifyContent: 'center' },
  headerName: {
    fontSize:     16,
    fontWeight:   '800',
    color:        '#111827',
    marginBottom: 3,
  },
  roleBadge: {
    alignSelf:         'flex-start',
    paddingHorizontal: 8,
    paddingVertical:   2,
    borderRadius:      999,
  },
  roleBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },

  messagesList:  { padding: 14, paddingBottom: 20 },
  timeStamp: {
    textAlign:    'center',
    fontSize:     11,
    color:        '#9BA8C0',
    marginBottom: 8,
    marginTop:    4,
  },
  msgWrap:      { alignItems: 'flex-start', marginBottom: 6 },
  msgWrapMine:  { alignItems: 'flex-end' },
  bubble: {
    maxWidth:               '78%',
    backgroundColor:        '#fff',
    borderRadius:           18,
    borderBottomLeftRadius: 4,
    paddingHorizontal:      14,
    paddingVertical:        10,
    shadowColor:            '#000',
    shadowOpacity:          0.04,
    shadowRadius:           4,
    elevation:              1,
  },
  bubbleMine: {
    backgroundColor:         '#2E86FF',
    borderBottomLeftRadius:  18,
    borderBottomRightRadius: 4,
  },
  bubbleText:     { color: '#111', fontSize: 15, lineHeight: 21 },
  bubbleTextMine: { color: '#fff' },

  emptyChat: {
    alignItems:    'center',
    paddingTop:    80,
    paddingBottom: 40,
  },
  emptyChatEmoji: { fontSize: 48, marginBottom: 12 },
  emptyChatText:  { fontSize: 14, color: '#9BA8C0' },

  inputBar: {
    flexDirection:   'row',
    alignItems:      'flex-end',
    padding:         12,
    gap:             10,
    borderTopWidth:  1,
    borderTopColor:  '#DCE6FF',
    backgroundColor: '#fff',
  },
  input: {
    flex:              1,
    backgroundColor:   '#F3F6FD',
    borderRadius:      20,
    paddingHorizontal: 16,
    paddingVertical:   10,
    maxHeight:         120,
    fontSize:          15,
    color:             '#111',
  },
  sendBtn: {
    width:           46,
    height:          46,
    borderRadius:    23,
    backgroundColor: '#2E86FF',
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#2E86FF',
    shadowOpacity:   0.35,
    shadowRadius:    6,
    elevation:       3,
  },
  sendBtnDisabled: { backgroundColor: '#B0C8F0', shadowOpacity: 0 },
  sendIcon:        { color: '#fff', fontSize: 18, fontWeight: '700' },
});