// app/message/[chatId].tsx

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, Image, Modal,
  TextInput, Pressable, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { auth } from '../../src/firebase/firebase';
import { roleColor } from './new';
import { apiClient } from '@/src/api/apiClient';
import { ChatScreenStyles } from '../../constants/styles';

interface Message {
  id:        string;
  type:      'text' | 'image';
  text:      string;
  imageUrl:  string | null;
  senderId:  string;
  createdAt: string | null; // ISO string from backend, never a Firestore Timestamp
}

// Uploads directly to the same Cloudinary cloud/preset the rest of the app
// already uses for CV/transcript/project-file uploads — the server
// independently re-validates the returned URL's host before accepting it as
// a chat message, so this client-side upload step is never trusted by
// itself. `/image/upload` (not `/raw/upload`) so Cloudinary applies its own
// image validation/transform pipeline rather than storing it as an opaque file.
async function uploadChatImage(uri: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', { uri, type: 'image/jpeg', name: 'chat-image.jpg' } as any);
  formData.append('upload_preset', 'student_uploads');
  const response = await fetch('https://api.cloudinary.com/v1_1/dp7stlfas/image/upload', {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) throw new Error(`Image upload failed — HTTP ${response.status}`);
  const data = await response.json();
  return data.secure_url;
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
  const [uploadingImage, setUploadingImage] = useState(false);
  const [viewerUrl,      setViewerUrl]       = useState<string | null>(null);
  // Before this flips false, a zero-length messages array is ambiguous
  // (real empty chat vs. still loading vs. a failed fetch) — without it,
  // ListEmptyComponent showed "No messages yet. Say hi!" in all three cases
  // (mirrors web's own fix for the same screen).
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [headerName, setHeaderName] = useState(otherName ?? '');
  const [headerRole, setHeaderRole] = useState(otherRole ?? '');
  // Tracks the newest message already held locally so subsequent polls can
  // ask for only what's new (mirrors web's own fix for this same screen —
  // this endpoint previously had no limit at all and was re-fetched in
  // full every 3s for as long as the screen was open).
  const lastMessageTimeRef = useRef<string | null>(null);

  // ── Fetch messages (polls every 3s) ────────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    if (!chatId || !currentUser) return;
    try {
      const since = lastMessageTimeRef.current;
      const res = await apiClient.get(`/api/chats/${chatId}/messages`, {
        params: since ? { since } : undefined,
      });
      const incoming = Array.isArray(res.data) ? res.data : [];
      if (incoming.length > 0) {
        lastMessageTimeRef.current = incoming[incoming.length - 1]?.createdAt ?? lastMessageTimeRef.current;
      }
      setMessages((prev) => {
        if (!since) return incoming; // initial load — replace outright
        if (incoming.length === 0) return prev; // steady-state poll, nothing new
        const seen = new Set(prev.map((m) => m.id));
        const deduped = incoming.filter((m: Message) => !seen.has(m.id));
        return deduped.length > 0 ? [...prev, ...deduped] : prev;
      });
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, [chatId, currentUser]);

  useEffect(() => {
    // Reset the incremental cursor + any previous chat's messages before
    // the first fetch for a (possibly) new chatId.
    lastMessageTimeRef.current = null;
    setMessages([]);
    setLoadingMessages(true);
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

  // ── Pick + send an image (WhatsApp-style attachment) ───────────────────────
  const pickAndSendImage = async () => {
    if (uploadingImage || !currentUser) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;

    setUploadingImage(true);
    try {
      const imageUrl = await uploadChatImage(result.assets[0].uri);
      await apiClient.post(`/api/chats/${chatId}/messages`, { imageUrl });
      await fetchMessages();
    } catch (err) {
      console.error('Send image error:', err);
    } finally {
      setUploadingImage(false);
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
        <Pressable style={s.backBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
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
            loadingMessages ? (
              <View style={s.emptyChat}>
                <ActivityIndicator size="large" color={accentColor} />
              </View>
            ) : (
              <View style={s.emptyChat}>
                <Text style={s.emptyChatEmoji}>💬</Text>
                <Text style={s.emptyChatText}>No messages yet. Say hi!</Text>
              </View>
            )
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
                  {item.type === 'image' && item.imageUrl ? (
                    <Pressable
                      style={[s.bubble, mine && s.bubbleMine, { padding: 4 }]}
                      onPress={() => setViewerUrl(item.imageUrl)}
                      accessibilityRole="button"
                      accessibilityLabel="View image"
                    >
                      <Image
                        source={{ uri: item.imageUrl }}
                        style={{ width: 200, height: 200, borderRadius: 10 }}
                        resizeMode="cover"
                      />
                      {item.text ? (
                        <Text style={[s.bubbleText, mine && s.bubbleTextMine, { marginTop: 6, paddingHorizontal: 6 }]}>
                          {item.text}
                        </Text>
                      ) : null}
                    </Pressable>
                  ) : (
                    <View style={[s.bubble, mine && s.bubbleMine]}>
                      <Text style={[s.bubbleText, mine && s.bubbleTextMine]}>
                        {item.text}
                      </Text>
                    </View>
                  )}
                </View>
              </>
            );
          }}
        />

        {/* ── Input bar ── */}
        <View style={s.inputBar}>
          <Pressable
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            onPress={pickAndSendImage}
            disabled={uploadingImage}
            accessibilityRole="button"
            accessibilityLabel="Attach image"
          >
            {uploadingImage
              ? <ActivityIndicator color={accentColor} size="small" />
              : <Text style={{ fontSize: 22 }}>📎</Text>
            }
          </Pressable>
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
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.sendIcon}>➤</Text>
            }
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* ── Full-screen image viewer ── */}
      <Modal visible={!!viewerUrl} transparent animationType="fade" onRequestClose={() => setViewerUrl(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' }}
          onPress={() => setViewerUrl(null)}
          accessibilityRole="button"
          accessibilityLabel="Close image"
        >
          {viewerUrl && (
            <Image source={{ uri: viewerUrl }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
          )}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = ChatScreenStyles;