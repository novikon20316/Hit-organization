/**
 * NewChatSheet.tsx
 * Changes from previous version:
 *   - Props.onChatCreated now receives (chatId, otherName, otherRole)
 *     so the caller can pass them as route params to ChatScreen.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, TextInput, FlatList,
  ActivityIndicator, Modal,
  Animated, Dimensions, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { auth } from '../../src/firebase/firebase';
import { palette, spacing, fontSize, fontWeight, radius } from '../../constants/theme';
import { apiClient } from '@/src/api/apiClient';
import { NewMessageStyles } from '../../constants/styles';


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
  }, [visible, slideAnim]);

  // ── Load candidates ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible || !uid) return;
    loadCandidates();
  }, [visible, uid]);

  const loadCandidates = async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const response = await apiClient.get('/api/chats/candidates');
      const { myRole: serverRole, candidates: serverCandidates } = response.data;

      setMyRole(serverRole ?? '');
      setCandidates(serverCandidates ?? []);
      setFiltered(serverCandidates ?? []);
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
  // 🚀 Let the server find an existing direct chat token or spin up a new structural collection row
  const handleSelectUser = useCallback(async (other: UserRow) => {
    if (!uid || creating) return;
    setCreating(true);
    try {
      const response = await apiClient.post('/api/chats', {
        recipientId: other.id
      });
      
      // Navigate using parameters sent back safely from the backend engine
      onChatCreated(response.data.chatId, other.name, other.role);
    } catch (e) {
      console.error('handleSelectUser endpoint failure:', e);
      Alert.alert('Error', 'Could not resolve chat link context parameters.');
    } finally {
      setCreating(false);
    }
  }, [uid, creating, onChatCreated]);

  // ── Broadcast ──────────────────────────────────────────────────────────────
  // 🚀 Offload thousands of potential client network writes down to a single rapid batch execution on the server
  const handleBroadcast = async () => {
    if (!broadcastTitle.trim() || !broadcastMsg.trim()) {
      Alert.alert('Missing fields', 'Please fill in both title and message.');
      return;
    }
    if (!uid) return;
    setCreating(true);
    try {
      await apiClient.post('/api/chats/broadcast', {
        title: broadcastTitle.trim(),
        message: broadcastMsg.trim()
      });

      Alert.alert('✅ Broadcast sent', 'Message delivered to target recipients successfully.');
      onClose();
    } catch (e) {
      console.error('handleBroadcast endpoint failure:', e);
      Alert.alert('Error', 'Broadcast compilation execution failed.');
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

const ss = NewMessageStyles;