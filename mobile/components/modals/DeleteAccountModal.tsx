// components/modals/DeleteAccountModal.tsx
// Self-contained account-deletion modal — mirrors SecurityModal's own-state-
// machine style in components/shared.tsx. Requires the user to re-enter
// their current password (Firebase reauthenticateWithCredential) before the
// request can succeed — this is irreversible-adjacent and no other action in
// this app requires re-auth today, so it's built fresh here.

import React, { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal, TextInput, ActivityIndicator,
} from 'react-native';
import {
  EmailAuthProvider, reauthenticateWithCredential,
} from 'firebase/auth';
import { auth } from '../../src/firebase/firebase';
import { apiClient } from '../../src/api/apiClient';
import type { Lang } from '../i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
  lang: Lang;
  // Called after a successful deletion request — parent handles sign-out/navigation.
  onRequested: () => void;
}

export default function DeleteAccountModal({ visible, onClose, lang, onRequested }: Props) {
  const [password, setPassword] = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');
  const isRtl = lang === 'he';

  const reset = () => {
    setPassword('');
    setError('');
    setBusy(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleConfirm = async () => {
    const user = auth.currentUser;
    if (!user?.email) {
      setError(lang === 'he' ? 'לא ניתן לזהות את המשתמש הנוכחי.' : 'Could not identify the current user.');
      return;
    }
    if (!password) {
      setError(lang === 'he' ? 'יש להזין סיסמה.' : 'Please enter your password.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      // Refreshes the ID token's auth_time claim — the server rejects this
      // request if auth_time is more than 5 minutes old, so this step is
      // required, not just a UX nicety.
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      await user.getIdToken(true);

      await apiClient.post('/api/users/delete-account/request');
      reset();
      onRequested();
    } catch (err: any) {
      const code = err?.code;
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError(lang === 'he' ? 'סיסמה שגויה.' : 'Incorrect password.');
      } else if (err?.response?.status === 409) {
        setError(err.response?.data?.error || (lang === 'he' ? 'לא ניתן למחוק את החשבון כרגע.' : 'Your account cannot be deleted right now.'));
      } else {
        setError(lang === 'he' ? 'שגיאה. נסה שוב.' : 'Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={handleClose}>
      <View style={s.root}>
        <View style={s.header}>
          <Text style={s.title}>
            {lang === 'he' ? '🗑️ מחיקת חשבון' : '🗑️ Delete Account'}
          </Text>
          <Pressable onPress={handleClose} style={s.closeBtn}>
            <Text style={s.closeText}>✕</Text>
          </Pressable>
        </View>

        <View style={s.body}>
          <Text style={[s.warning, isRtl && s.textRight]}>
            {lang === 'he'
              ? 'בקשת המחיקה תתחיל תקופת המתנה של 14 יום, בזמנה תוכל לבטל. לאחר מכן, החשבון והנתונים שלך יימחקו לצמיתות ולא ניתן יהיה לשחזר אותם.'
              : 'This starts a 14-day cancellable window. After that, your account and its data will be permanently deleted and cannot be recovered.'}
          </Text>

          <Text style={[s.label, isRtl && s.textRight]}>
            {lang === 'he' ? 'הזן את הסיסמה הנוכחית לאישור' : 'Enter your current password to confirm'}
          </Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={(t) => { setPassword(t); setError(''); }}
            secureTextEntry
            placeholder={lang === 'he' ? 'סיסמה' : 'Password'}
            placeholderTextColor="#9BA8C0"
            textAlign={isRtl ? 'right' : 'left'}
            autoFocus
          />

          {error ? <Text style={[s.error, isRtl && s.textRight]}>{error}</Text> : null}

          <Pressable
            style={[s.confirmBtn, (busy || !password) && s.btnDisabled]}
            onPress={handleConfirm}
            disabled={busy || !password}
          >
            {busy
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.confirmBtnText}>
                  {lang === 'he' ? 'מחק את החשבון שלי' : 'Delete My Account'}
                </Text>
            }
          </Pressable>

          <Pressable style={s.cancelBtn} onPress={handleClose} disabled={busy}>
            <Text style={s.cancelBtnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: '#fff' },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
               padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  title:     { fontSize: 18, fontWeight: '800', color: '#1E293B' },
  closeBtn:  { padding: 4 },
  closeText: { fontSize: 20, color: '#64748B' },
  body:      { padding: 20 },
  textRight: { textAlign: 'right' },
  warning:   { fontSize: 14, color: '#991B1B', backgroundColor: '#FEE2E2', borderRadius: 10,
               padding: 14, marginBottom: 20, lineHeight: 20 },
  label:     { fontSize: 13, fontWeight: '600', color: '#445', marginBottom: 6 },
  input:     { backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0',
               padding: 14, fontSize: 16, color: '#111', marginBottom: 8 },
  error:     { color: '#EF4444', fontSize: 13, marginBottom: 8 },
  confirmBtn:{ backgroundColor: '#EF4444', borderRadius: 12, paddingVertical: 14,
               alignItems: 'center', marginTop: 12 },
  btnDisabled:{ opacity: 0.5 },
  confirmBtnText:{ color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  cancelBtnText:{ color: '#64748B', fontWeight: '600', fontSize: 14 },
});
