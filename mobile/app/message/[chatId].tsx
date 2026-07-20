// app/message/[chatId].tsx

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, FlatList,
  TextInput, Pressable, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { auth } from '../../src/firebase/firebase';
import { roleColor } from './new';
import { apiClient } from '@/src/api/apiClient';
import { ChatScreenStyles } from '../../constants/styles';

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
const s = ChatScreenStyles;