// app/message/[chatId].tsx

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, Image, Modal,
  TextInput, Pressable, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../src/firebase/firebase';
import { roleColor } from './new';
import { apiClient } from '@/src/api/apiClient';
import { ChatScreenStyles } from '../../constants/styles';
import type { Lang } from '../../components/i18n';
import ReadTicks from '../../components/ReadTicks';

interface Message {
  id:        string;
  type:      'text' | 'image';
  text:      string;
  imageUrl:  string | null;
  senderId:  string;
  createdAt: string | null; // ISO string from backend, never a Firestore Timestamp
}

// Uploads through the server (authenticated) rather than straight to
// Cloudinary — the old path posted directly via a hardcoded unsigned preset
// anyone could extract from the client bundle and abuse; see
// AUDIT_CODE_QUALITY_BUTTONS_CLOUDINARY_2026_09_24.md finding #1. The server
// uploads to the same `image/upload` resource type this always used, so
// CHAT_IMAGE_URL_RE in chatController.ts still matches the result.
async function uploadChatImage(uri: string, chatId: string): Promise<string> {
  const formData = new FormData();
  // The server only accepts an image for a chat the sender is in.
  formData.append('chatId', chatId);
  formData.append('file', { uri, type: 'image/jpeg', name: 'chat-image.jpg' } as any);
  const response = await apiClient.post<{ url: string }>('/api/chats/upload-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    transformRequest: (data: any) => data,
  });
  return response.data.url;
}

// ─── Role → readable label ────────────────────────────────────────────────────
function roleLabel(role: string, lang: Lang): string {
  const map: Record<string, { he: string; en: string }> = {
    student:       { he: 'סטודנט',      en: 'Student' },
    supervisor:    { he: 'מנחה',         en: 'Supervisor' },
    examiner:      { he: 'בוחן',         en: 'Examiner' },
    coordinator:   { he: 'רכז',          en: 'Coordinator' },
    faculty_admin: { he: 'מנהל פקולטה', en: 'Faculty Admin' },
    system_admin:  { he: 'מנהל מערכת',  en: 'System Admin' },
  };
  const entry = map[role];
  if (!entry) return role;
  return lang === 'he' ? entry.he : entry.en;
}

// ─── Format timestamp ─────────────────────────────────────────────────────────
// createdAt is now always an ISO string (or null) — no Firestore Timestamp objects.
// See the chat-doc listener in ChatScreen.
const SAFETY_POLL_MS = 30_000;
const FALLBACK_POLL_MS = 3000;

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
  const router                                    = useRouter();
  const { chatId, otherName, otherRole, lang: langParam } = useLocalSearchParams<{
    chatId:    string;
    otherName: string;
    otherRole: string;
    lang?:     string;
  }>();
  // Not every entry point into this screen can pass `lang` (a push-
  // notification tap has no route context to draw it from) — default to 'he'
  // like the rest of the app's own standalone screens do (e.g.
  // notifications.tsx, records/[projectId].tsx) rather than leaving this
  // screen with no RTL treatment at all.
  const lang: Lang = langParam === 'en' ? 'en' : 'he';
  const isRtl = lang === 'he';

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
  // The other participant's read position (ISO) — my messages with
  // createdAt <= this get the blue double tick.
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null);
  // Newest createdAt already reported via /read, so a steady-state poll
  // doesn't re-POST the same read position every 3s.
  const reportedReadRef = useRef<string | null>(null);

  // Reports "seen" only while the app is in the foreground — a chat left
  // open behind a backgrounded app shouldn't give the sender a blue tick.
  const reportRead = useCallback(() => {
    const upTo = lastMessageTimeRef.current;
    if (!chatId || !upTo || upTo === reportedReadRef.current) return;
    if (AppState.currentState !== 'active') return;
    reportedReadRef.current = upTo;
    apiClient.post(`/api/chats/${chatId}/read`, { upTo }).catch(() => { reportedReadRef.current = null; });
  }, [chatId]);

  // ── Fetch messages (polls every 3s) ────────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    if (!chatId || !currentUser) return;
    try {
      const since = lastMessageTimeRef.current;
      const res = await apiClient.get(`/api/chats/${chatId}/messages`, {
        params: since ? { since, withReadState: '1' } : { withReadState: '1' },
      });
      const incoming = Array.isArray(res.data?.messages) ? res.data.messages : [];
      setOtherReadAt(res.data?.otherReadAt ?? null);
      if (incoming.length > 0) {
        lastMessageTimeRef.current = incoming[incoming.length - 1]?.createdAt ?? lastMessageTimeRef.current;
      }
      reportRead();
      setMessages((prev) => {
        if (!since) return incoming; // initial load — replace outright
        if (incoming.length === 0) return prev; // steady-state poll, nothing new
        const seen = new Set(prev.map((m) => m.id));
        const deduped = incoming.filter((m: Message) => !seen.has(m.id));
        return deduped.length > 0 ? [...prev, ...deduped] : prev;
      });
    } catch {} finally {
      setLoadingMessages(false);
    }
  }, [chatId, currentUser, reportRead]);

  useEffect(() => {
    // Reset the incremental cursor + any previous chat's messages before
    // the first fetch for a (possibly) new chatId.
    lastMessageTimeRef.current = null;
    reportedReadRef.current = null;
    setMessages([]);
    setOtherReadAt(null);
    setLoadingMessages(true);
    fetchMessages();
    // The server bumps the chat doc on every new message (lastMessageAt) and
    // read receipt (readAt.<uid>), so listening to it is an instant "fetch
    // now" signal — the fetch itself stays the access-checked REST call. A
    // slow poll stays as a safety net, and a listener error (no Firebase
    // session yet, a rules denial) falls back to the old 3s poll.
    if (!chatId) return;
    let interval = setInterval(fetchMessages, SAFETY_POLL_MS);
    let first = true;
    const unsub = onSnapshot(
      doc(db, 'chats', chatId),
      () => {
        if (first) { first = false; return; } // current state — the fetch above covers it
        fetchMessages();
      },
      () => {
        clearInterval(interval);
        interval = setInterval(fetchMessages, FALLBACK_POLL_MS);
      }
    );
    return () => { unsub(); clearInterval(interval); };
  }, [fetchMessages, chatId]);

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
      } catch {}
    };

    fetchChatMetadata();
  }, [chatId, currentUser, headerName]);

  // Separate from the name lookup above (which skips the fetch when
  // headerName already arrived via route params) — block status always
  // needs a fresh read, so the safety menu can offer "Unblock" instead of
  // "Block" once the other participant is already blocked.
  const [isBlocked, setIsBlocked] = useState(false);
  useEffect(() => {
    if (!currentUser || !chatId) return;
    apiClient.get(`/api/chats/${chatId}/meta`)
      .then((response) => setIsBlocked(!!response.data.isBlockedByMe))
      .catch(() => {});
  }, [chatId, currentUser]);

  // ── Mark chat notifications as read when opening ───────────────────────────
  // Also reports "seen" as soon as the app returns to the foreground.
  useEffect(() => {
    if (!chatId || !currentUser) return;
    apiClient.post(`/api/chats/${chatId}/read`, lastMessageTimeRef.current ? { upTo: lastMessageTimeRef.current } : {}).catch(() => {});
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') reportRead(); });
    return () => sub.remove();
  }, [chatId, currentUser, reportRead]);

  const otherReadMs = otherReadAt ? new Date(otherReadAt).getTime() : null;

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
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;

    setUploadingImage(true);
    try {
      const imageUrl = await uploadChatImage(result.assets[0].uri, String(chatId));
      await apiClient.post(`/api/chats/${chatId}/messages`, { imageUrl });
      await fetchMessages();
    } catch {} finally {
      setUploadingImage(false);
    }
  };

  // ── Safety: report / block ──────────────────────────────────────────────────
  // Baseline moderation tooling for this otherwise-unmoderated 1:1 chat —
  // block is chat-scoped server-side (resolves the other participant from
  // the chat doc, enforced both directions in sendDirectMessage), report is
  // persisted + notifies every system_admin.
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReason,       setReportReason]       = useState('');
  const [reportSubmitting,   setReportSubmitting]   = useState(false);
  const [blocking,           setBlocking]           = useState(false);

  const handleBlock = () => {
    Alert.alert(
      isRtl ? 'חסימת משתמש' : 'Block user',
      isRtl
        ? `לאחר החסימה לא תוכל/י לשלוח או לקבל הודעות מ${headerName ? `-${headerName}` : 'משתמש זה'}.`
        : `After blocking, you won't be able to send or receive messages from ${headerName || 'this user'}.`,
      [
        { text: isRtl ? 'ביטול' : 'Cancel', style: 'cancel' },
        {
          text: isRtl ? 'חסום' : 'Block',
          style: 'destructive',
          onPress: async () => {
            setBlocking(true);
            try {
              await apiClient.post(`/api/chats/${chatId}/block`);
              router.back();
            } catch (err) {
              Alert.alert(
                isRtl ? 'שגיאה' : 'Error',
                isRtl ? 'החסימה נכשלה. נסה/י שוב.' : 'Failed to block. Please try again.',
              );
            } finally {
              setBlocking(false);
            }
          },
        },
      ],
    );
  };

  const handleUnblock = () => {
    Alert.alert(
      isRtl ? 'ביטול חסימה' : 'Unblock user',
      isRtl
        ? `לאחר ביטול החסימה תוכל/י שוב לשלוח ולקבל הודעות מ${headerName ? `-${headerName}` : 'משתמש זה'}.`
        : `After unblocking, you'll be able to send and receive messages from ${headerName || 'this user'} again.`,
      [
        { text: isRtl ? 'ביטול' : 'Cancel', style: 'cancel' },
        {
          text: isRtl ? 'בטל חסימה' : 'Unblock',
          onPress: async () => {
            setBlocking(true);
            try {
              await apiClient.post(`/api/chats/${chatId}/unblock`);
              setIsBlocked(false);
            } catch (err) {
              Alert.alert(
                isRtl ? 'שגיאה' : 'Error',
                isRtl ? 'ביטול החסימה נכשל. נסה/י שוב.' : 'Failed to unblock. Please try again.',
              );
            } finally {
              setBlocking(false);
            }
          },
        },
      ],
    );
  };

  const handleSubmitReport = async () => {
    setReportSubmitting(true);
    try {
      await apiClient.post(`/api/chats/${chatId}/report`, { reason: reportReason.trim() || undefined });
      setReportModalVisible(false);
      setReportReason('');
      Alert.alert(
        isRtl ? 'תודה' : 'Thank you',
        isRtl ? 'הדיווח נשלח לבדיקה.' : 'Your report has been submitted for review.',
      );
    } catch (err) {
      Alert.alert(
        isRtl ? 'שגיאה' : 'Error',
        isRtl ? 'שליחת הדיווח נכשלה. נסה/י שוב.' : 'Failed to submit report. Please try again.',
      );
    } finally {
      setReportSubmitting(false);
    }
  };

  const openSafetyMenu = () => {
    Alert.alert(
      isRtl ? 'אפשרויות' : 'Options',
      undefined,
      [
        { text: isRtl ? 'דווח על משתמש' : 'Report user', onPress: () => setReportModalVisible(true) },
        isBlocked
          ? { text: isRtl ? 'בטל חסימת משתמש' : 'Unblock user', onPress: handleUnblock }
          : { text: isRtl ? 'חסום משתמש' : 'Block user', style: 'destructive', onPress: handleBlock },
        { text: isRtl ? 'ביטול' : 'Cancel', style: 'cancel' },
      ],
    );
  };

  // ── Derived header values ──────────────────────────────────────────────────
  const initials    = headerName
    ? headerName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';
  const accentColor = roleColor(headerRole);

  return (
    <SafeAreaView style={s.root}>

      {/* ── Top header ── */}
      <View style={[s.header, isRtl && s.rowReverse]}>
        <Pressable style={s.backBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={isRtl ? 'חזרה' : 'Back'}>
          <Text style={s.backArrow}>{isRtl ? '→' : '←'}</Text>
        </Pressable>

        <View style={[s.avatar, { backgroundColor: accentColor }]}>
          <Text style={s.avatarText}>{initials}</Text>
        </View>

        <View style={[s.headerInfo, isRtl && { alignItems: 'flex-end' }]}>
          <Text style={[s.headerName, isRtl && s.textRight]} numberOfLines={1}>
            {headerName || '…'}
          </Text>
          {headerRole ? (
            <View style={[s.roleBadge, { backgroundColor: accentColor + '22' }]}>
              <Text style={[s.roleBadgeText, { color: accentColor }]}>
                {roleLabel(headerRole, lang)}
              </Text>
            </View>
          ) : null}
        </View>

        <Pressable
          onPress={openSafetyMenu}
          disabled={blocking}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
          accessibilityRole="button"
          accessibilityLabel={isRtl ? 'אפשרויות נוספות' : 'More options'}
        >
          {blocking
            ? <ActivityIndicator size="small" color={accentColor} />
            : <Text style={{ fontSize: 20, color: '#6B7280' }}>⋮</Text>
          }
        </Pressable>
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
                <Text style={s.emptyChatText}>
                  {isRtl ? 'אין עדיין הודעות. תגידו שלום!' : 'No messages yet. Say hi!'}
                </Text>
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
                      accessibilityLabel={isRtl ? 'הצג תמונה' : 'View image'}
                    >
                      <Image
                        source={{ uri: item.imageUrl }}
                        style={{ width: 200, height: 200, borderRadius: 10 }}
                        resizeMode="cover"
                      />
                      {item.text ? (
                        <Text style={[s.bubbleText, mine && s.bubbleTextMine, isRtl && s.textRight, { marginTop: 6, paddingHorizontal: 6 }]}>
                          {item.text}
                        </Text>
                      ) : null}
                    </Pressable>
                  ) : (
                    <View style={[s.bubble, mine && s.bubbleMine]}>
                      <Text style={[s.bubbleText, mine && s.bubbleTextMine, isRtl && s.textRight]}>
                        {item.text}
                      </Text>
                    </View>
                  )}
                  {mine && (
                    <ReadTicks
                      lang={lang}
                      seen={otherReadMs !== null && !!item.createdAt && new Date(item.createdAt).getTime() <= otherReadMs}
                      style={{ marginTop: 2, marginHorizontal: 4 }}
                    />
                  )}
                </View>
              </>
            );
          }}
        />

        {/* ── Input bar ── */}
        <View style={[s.inputBar, isRtl && s.rowReverse]}>
          <Pressable
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            onPress={pickAndSendImage}
            disabled={uploadingImage}
            accessibilityRole="button"
            accessibilityLabel={isRtl ? 'צרף תמונה' : 'Attach image'}
          >
            {uploadingImage
              ? <ActivityIndicator color={accentColor} size="small" />
              : <Text style={{ fontSize: 22 }}>📎</Text>
            }
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={isRtl ? 'כתבו הודעה…' : 'Write a message…'}
            placeholderTextColor="#9BA8C0"
            style={[s.input, isRtl && s.textRight]}
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
            accessibilityLabel={isRtl ? 'שלח הודעה' : 'Send message'}
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
          accessibilityLabel={isRtl ? 'סגור תמונה' : 'Close image'}
        >
          {viewerUrl && (
            <Image source={{ uri: viewerUrl }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
          )}
        </Pressable>
      </Modal>

      {/* ── Report user ── */}
      <Modal
        visible={reportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
            <Text style={[{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 }, isRtl && s.textRight]}>
              {isRtl ? 'דיווח על משתמש' : 'Report user'}
            </Text>
            <Text style={[{ fontSize: 13, color: '#6B7280', marginBottom: 12 }, isRtl && s.textRight]}>
              {isRtl
                ? 'ספר/י לנו מה קרה (לא חובה). הדיווח יישלח לבדיקת מנהל המערכת.'
                : "Tell us what happened (optional). This is sent to a system admin for review."}
            </Text>
            <TextInput
              value={reportReason}
              onChangeText={setReportReason}
              placeholder={isRtl ? 'תיאור (לא חובה)' : 'Description (optional)'}
              placeholderTextColor="#9BA8C0"
              multiline
              maxLength={1000}
              style={[
                { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 10, minHeight: 80, fontSize: 14, color: '#111', textAlignVertical: 'top' },
                isRtl && s.textRight,
              ]}
            />
            <View style={[{ flexDirection: 'row', gap: 10, marginTop: 16 }, isRtl && s.rowReverse]}>
              <Pressable
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#F3F4F6' }}
                onPress={() => { setReportModalVisible(false); setReportReason(''); }}
                disabled={reportSubmitting}
                accessibilityRole="button"
              >
                <Text style={{ fontWeight: '600', color: '#374151' }}>{isRtl ? 'ביטול' : 'Cancel'}</Text>
              </Pressable>
              <Pressable
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#EF4444', opacity: reportSubmitting ? 0.6 : 1 }}
                onPress={handleSubmitReport}
                disabled={reportSubmitting}
                accessibilityRole="button"
              >
                {reportSubmitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ fontWeight: '600', color: '#fff' }}>{isRtl ? 'שלח דיווח' : 'Submit report'}</Text>
                }
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = ChatScreenStyles;