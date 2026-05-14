/**
 * NewChatSheet.tsx
 * Changes from previous version:
 *   - Props.onChatCreated now receives (chatId, otherName, otherRole)
 *     so the caller can pass them as route params to ChatScreen.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, TextInput, FlatList,
  StyleSheet, ActivityIndicator, Modal,
  Animated, Dimensions, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import {
  collection, query, where, getDocs, addDoc,
  serverTimestamp, getDoc, doc,
} from 'firebase/firestore';
import { db, auth } from '../../src/firebase/firebase';
import { palette, spacing, fontSize, fontWeight, radius } from '../../constants/theme';

const { height: SCREEN_H } = Dimensions.get('window');

interface UserRow {
  id:        string;
  name:      string;
  email:     string;
  role:      string;
  facultyId: string;
}

interface Props {
  visible:       boolean;
  onClose:       () => void;
  /** chatId, display name of the other user, their role */
  existingChatIds: Set<string>; // to prevent duplicate chats in UI
  onChatCreated: (chatId: string, otherName: string, otherRole: string) => void;
}

export default function NewChatSheet({ visible, onClose, onChatCreated, existingChatIds }: Props) {
  const uid       = auth.currentUser?.uid;
  const slideAnim = React.useRef(new Animated.Value(SCREEN_H)).current;

  const [myRole,         setMyRole]         = useState('');
  const [myFaculty,      setMyFaculty]      = useState('');
  const [candidates,     setCandidates]     = useState<UserRow[]>([]);
  const [filtered,       setFiltered]       = useState<UserRow[]>([]);
  const [search,         setSearch]         = useState('');
  const [loading,        setLoading]        = useState(true);
  const [creating,       setCreating]       = useState(false);
  const [mode,           setMode]           = useState<'chat' | 'broadcast'>('chat');
  const [broadcastMsg,   setBroadcastMsg]   = useState('');
  const [broadcastTitle, setBroadcastTitle] = useState('');

  // ── Slide animation ────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue:         visible ? 0 : SCREEN_H,
      useNativeDriver: true,
      tension:         60,
      friction:        12,
    }).start();
    if (visible) {
      setSearch('');
      setMode('chat');
      setBroadcastMsg('');
      setBroadcastTitle('');
    }
  }, [visible]);

  // ── Load candidates ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible || !uid) return;
    loadCandidates();
  }, [visible, uid]);

  const loadCandidates = async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const meSnap = await getDoc(doc(db, 'users', uid));
      if (!meSnap.exists()) return;
      const me = meSnap.data();
      setMyRole(me.role ?? '');
      setMyFaculty(me.facultyId ?? '');

      const rows: UserRow[] = [];

      if (me.role === 'system_admin') {
        const snap = await getDocs(collection(db, 'users'));
        snap.forEach((d) => { if (d.id !== uid) rows.push(toRow(d)); });

      } else if (me.role === 'faculty_admin') {
        const snap = await getDocs(
          query(collection(db, 'users'), where('facultyId', '==', me.facultyId))
        );
        snap.forEach((d) => { if (d.id !== uid) rows.push(toRow(d)); });

      } else if (me.role === 'supervisor') {
        const appsSnap = await getDocs(
          query(collection(db, 'applications'), where('supervisorId', '==', uid))
        );
        const studentIds = [...new Set(appsSnap.docs.map((d) => d.data().studentId as string))];
        for (const sid of studentIds) {
          const sSnap = await getDoc(doc(db, 'users', sid));
          if (sSnap.exists()) rows.push(toRow(sSnap));
        }

      } else if (me.role === 'student') {
        if (me.activeProjectId) {
          const projSnap = await getDoc(doc(db, 'projects', me.activeProjectId));
          if (projSnap.exists()) {
            const supId = projSnap.data().supervisorId;
            if (supId) {
              const supSnap = await getDoc(doc(db, 'users', supId));
              if (supSnap.exists()) rows.push(toRow(supSnap));
            }
          }
        } else {
          const appsSnap = await getDocs(
            query(collection(db, 'applications'), where('studentId', '==', uid))
          );
          const supIds = [...new Set(appsSnap.docs.map((d) => d.data().supervisorId as string))];
          for (const sid of supIds) {
            const sSnap = await getDoc(doc(db, 'users', sid));
            if (sSnap.exists()) rows.push(toRow(sSnap));
          }
        }
      }

      setCandidates(rows);
      setFiltered(rows);
    } catch (e) {
      console.error('NewChatSheet loadCandidates:', e);
    } finally {
      setLoading(false);
    }
  };

  // ── Search ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      q ? candidates.filter((u) =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      ) : candidates
    );
  }, [search, candidates]);

  // ── Open / find 1-to-1 chat ────────────────────────────────────────────────
  const handleSelectUser = useCallback(async (other: UserRow) => {
    if (!uid || creating) return;
    setCreating(true);
    try {
      const existingSnap = await getDocs(
        query(collection(db, 'chats'), where('participants', 'array-contains', uid))
      );
      const existing = existingSnap.docs.find((d) => {
        const p: string[] = d.data().participants ?? [];
        return p.includes(other.id) && p.length === 2;
      });

      if (existing) {
        onChatCreated(existing.id, other.name, other.role);
      } else {
        const ref = await addDoc(collection(db, 'chats'), {
          participants: [uid, other.id],
          type:         'direct',
          createdAt:    serverTimestamp(),
          updatedAt:    serverTimestamp(),
          lastMessage:  '',
        });
        onChatCreated(ref.id, other.name, other.role);
      }
    } catch (e) {
      console.error('handleSelectUser:', e);
      Alert.alert('Error', 'Could not open chat. Please try again.');
    } finally {
      setCreating(false);
    }
  }, [uid, creating, onChatCreated]);

  // ── Broadcast ──────────────────────────────────────────────────────────────
  const handleBroadcast = async () => {
    if (!broadcastTitle.trim() || !broadcastMsg.trim()) {
      Alert.alert('Missing fields', 'Please fill in both title and message.');
      return;
    }
    if (!uid) return;
    setCreating(true);
    try {
      let recipientIds: string[] = [];
      if (myRole === 'system_admin') {
        const snap = await getDocs(collection(db, 'users'));
        recipientIds = snap.docs.map((d) => d.id).filter((id) => id !== uid);
      } else if (myRole === 'faculty_admin') {
        const snap = await getDocs(
          query(collection(db, 'users'), where('facultyId', '==', myFaculty))
        );
        recipientIds = snap.docs.map((d) => d.id).filter((id) => id !== uid);
      }

      await Promise.all(recipientIds.map((recipientId) =>
        addDoc(collection(db, 'notifications'), {
          recipientId,
          type:               'broadcast',
          titleHe:            broadcastTitle.trim(),
          titleEn:            broadcastTitle.trim(),
          bodyHe:             broadcastMsg.trim(),
          bodyEn:             broadcastMsg.trim(),
          isRead:             false,
          createdAt:          serverTimestamp(),
          relatedProjectId:   null,
          relatedMilestoneId: null,
          senderId:           uid,
        })
      ));

      Alert.alert(
        '✅ Broadcast sent',
        `Message delivered to ${recipientIds.length} recipient${recipientIds.length !== 1 ? 's' : ''}.`
      );
      onClose();
    } catch (e) {
      console.error('handleBroadcast:', e);
      Alert.alert('Error', 'Broadcast failed. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const canBroadcast = myRole === 'system_admin' || myRole === 'faculty_admin';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={ss.backdrop} onPress={onClose} />

      <Animated.View style={[ss.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View style={ss.handle} />

          <View style={ss.header}>
            <Text style={ss.headerTitle}>New Message</Text>
            <Pressable onPress={onClose} style={ss.closeBtn}>
              <Text style={ss.closeText}>✕</Text>
            </Pressable>
          </View>

          {canBroadcast && (
            <View style={ss.modeRow}>
              <Pressable
                style={[ss.modeBtn, mode === 'chat' && ss.modeBtnActive]}
                onPress={() => setMode('chat')}
              >
                <Text style={[ss.modeBtnText, mode === 'chat' && ss.modeBtnTextActive]}>
                  💬 Direct
                </Text>
              </Pressable>
              <Pressable
                style={[ss.modeBtn, mode === 'broadcast' && ss.modeBtnActive]}
                onPress={() => setMode('broadcast')}
              >
                <Text style={[ss.modeBtnText, mode === 'broadcast' && ss.modeBtnTextActive]}>
                  📢 Broadcast
                </Text>
              </Pressable>
            </View>
          )}

          {mode === 'broadcast' ? (
            <View style={ss.broadcastForm}>
              <Text style={ss.broadcastSubtitle}>
                {myRole === 'system_admin'
                  ? 'Send to all users in the system'
                  : 'Send to all users in your faculty'}
              </Text>
              <Text style={ss.fieldLabel}>Title</Text>
              <TextInput
                style={ss.input}
                value={broadcastTitle}
                onChangeText={setBroadcastTitle}
                placeholder="e.g. System Maintenance"
                placeholderTextColor={palette.textMuted}
              />
              <Text style={ss.fieldLabel}>Message</Text>
              <TextInput
                style={[ss.input, ss.textarea]}
                value={broadcastMsg}
                onChangeText={setBroadcastMsg}
                placeholder="Write your broadcast message here..."
                placeholderTextColor={palette.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              <Pressable
                style={[ss.sendBroadcastBtn, creating && { opacity: 0.6 }]}
                onPress={handleBroadcast}
                disabled={creating}
              >
                {creating
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={ss.sendBroadcastText}>📢 Send Broadcast</Text>
                }
              </Pressable>
            </View>
          ) : (
            <>
              <View style={ss.searchWrap}>
                <Text style={ss.searchIcon}>🔍</Text>
                <TextInput
                  style={ss.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search by name or email…"
                  placeholderTextColor={palette.textMuted}
                />
                {search.length > 0 && (
                  <Pressable onPress={() => setSearch('')}>
                    <Text style={ss.clearSearch}>✕</Text>
                  </Pressable>
                )}
              </View>

              {loading ? (
                <View style={ss.centered}>
                  <ActivityIndicator size="large" color={palette.primary} />
                </View>
              ) : filtered.length === 0 ? (
                <View style={ss.centered}>
                  <Text style={ss.emptyEmoji}>{candidates.length === 0 ? '📭' : '🔍'}</Text>
                  <Text style={ss.emptyText}>
                    {candidates.length === 0 ? noContactsText(myRole) : 'No users match your search'}
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={filtered}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={ss.list}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <Pressable
                      style={ss.userRow}
                      onPress={() => handleSelectUser(item)}
                      disabled={creating}
                    >
                      <View style={[ss.avatar, { backgroundColor: roleColor(item.role) }]}>
                        <Text style={ss.avatarText}>
                          {item.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={ss.userName}>{item.name}</Text>
                        <Text style={ss.userEmail}>{item.email}</Text>
                      </View>
                      <View style={[ss.rolePill, { backgroundColor: roleColor(item.role) + '22' }]}>
                        <Text style={[ss.rolePillText, { color: roleColor(item.role) }]}>
                          {item.role.replace('_', ' ')}
                        </Text>
                      </View>
                    </Pressable>
                  )}
                />
              )}
            </>
          )}
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toRow(snap: any): UserRow {
  const d = snap.data();
  return {
    id:        snap.id,
    name:      d.displayName ?? d.fullName ?? 'Unknown',
    email:     d.email ?? '',
    role:      d.role ?? '',
    facultyId: d.facultyId ?? '',
  };
}

function noContactsText(role: string): string {
  switch (role) {
    case 'student':    return 'Apply to a project first to chat with a supervisor.';
    case 'supervisor': return 'No students have applied to your projects yet.';
    default:           return 'No contacts found.';
  }
}

export function roleColor(role: string): string {
  const map: Record<string, string> = {
    student:       '#2E86FF',
    supervisor:    '#10B981',
    examiner:      '#8B5CF6',
    coordinator:   '#F59E0B',
    faculty_admin: '#EF4444',
    system_admin:  '#111827',
  };
  return map[role] ?? '#9BA8C0';
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position:             'absolute',
    bottom: 0, left: 0, right: 0,
    height:               SCREEN_H * 0.82,
    backgroundColor:      palette.bgMain,
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    overflow:             'hidden',
    shadowColor:          '#000',
    shadowOffset:         { width: 0, height: -4 },
    shadowOpacity:        0.15,
    shadowRadius:         20,
    elevation:            20,
  },
  handle: {
    width: 40, height: 4,
    backgroundColor: palette.borderLight,
    borderRadius:    2,
    alignSelf:       'center',
    marginTop:       spacing.md,
    marginBottom:    spacing.sm,
  },
  header: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingHorizontal: spacing.xl,
    paddingVertical:   spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderLight,
    backgroundColor:   palette.bgWhite,
  },
  headerTitle: { fontSize: fontSize.xxl, fontWeight: fontWeight.heavy, color: palette.textPrimary },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: palette.bgMain,
    justifyContent:  'center',
    alignItems:      'center',
  },
  closeText: { fontSize: fontSize.md, color: palette.textSecondary },

  modeRow: {
    flexDirection:     'row',
    margin:            spacing.lg,
    backgroundColor:   palette.bgWhite,
    borderRadius:      radius.xl,
    borderWidth:       1,
    borderColor:       palette.borderLight,
    padding:           spacing.xxs,
    gap:               spacing.xxs,
  },
  modeBtn:           { flex: 1, paddingVertical: spacing.sm + 2, alignItems: 'center', borderRadius: radius.lg },
  modeBtnActive:     { backgroundColor: palette.primary },
  modeBtnText:       { fontSize: fontSize.md, fontWeight: fontWeight.semi,  color: palette.textSecondary },
  modeBtnTextActive: { color: palette.bgWhite, fontWeight: fontWeight.bold },

  searchWrap: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   palette.bgWhite,
    margin:            spacing.lg,
    borderRadius:      radius.xl,
    paddingHorizontal: spacing.base,
    borderWidth:       1,
    borderColor:       palette.borderLight,
    height:            48,
  },
  searchIcon:  { fontSize: 16, marginRight: spacing.sm },
  searchInput: { flex: 1, fontSize: fontSize.base, color: palette.textPrimary },
  clearSearch: { fontSize: fontSize.md, color: palette.textMuted, paddingHorizontal: spacing.sm },

  list:    { paddingHorizontal: spacing.lg, paddingBottom: 60 },
  userRow: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: palette.bgWhite,
    borderRadius:    radius.xl,
    padding:         spacing.base,
    marginBottom:    spacing.sm,
    borderWidth:     1,
    borderColor:     palette.borderLight,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarText: { color: '#fff', fontWeight: fontWeight.black, fontSize: fontSize.xl },
  userName:   { fontSize: fontSize.base, fontWeight: fontWeight.bold,  color: palette.textPrimary },
  userEmail:  { fontSize: fontSize.sm,   color: palette.textSecondary, marginTop: 2 },
  rolePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
    borderRadius:      radius.full,
    marginLeft:        spacing.sm,
  },
  rolePillText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, textTransform: 'capitalize' },

  centered:   { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 44, marginBottom: spacing.md },
  emptyText:  { fontSize: fontSize.md, color: palette.textSecondary, textAlign: 'center', maxWidth: 260 },

  broadcastForm:     { padding: spacing.lg, flex: 1 },
  broadcastSubtitle: { fontSize: fontSize.md, color: palette.textSecondary, marginBottom: spacing.lg },
  fieldLabel: {
    fontSize:     fontSize.md,
    fontWeight:   fontWeight.semi,
    color:        palette.textBody,
    marginBottom: spacing.xxs,
    marginTop:    spacing.md,
  },
  input: {
    backgroundColor:   palette.bgWhite,
    borderRadius:      radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical:   spacing.md,
    fontSize:          fontSize.base,
    color:             palette.textPrimary,
    borderWidth:       1,
    borderColor:       palette.borderLight,
  },
  textarea:          { minHeight: 110, textAlignVertical: 'top' },
  sendBroadcastBtn: {
    backgroundColor: palette.primary,
    borderRadius:    radius.xl,
    paddingVertical: spacing.base,
    alignItems:      'center',
    marginTop:       spacing.xl,
    shadowColor:     palette.primary,
    shadowOpacity:   0.3,
    shadowRadius:    8,
    elevation:       3,
  },
  sendBroadcastText: { color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.lg },
});