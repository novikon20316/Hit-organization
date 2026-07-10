// app/(auth)/verify2fa.tsx
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Modal, ScrollView, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiClient } from '../../src/api/apiClient';
import { signOut } from 'firebase/auth';
import { auth } from '@/src/firebase/firebase';
import { useMaintenanceCheck } from '@/hooks/useMaintenanceCheck'; // ← NEW
import { getHomeRoute } from '@/firebase/roles'; // ← single source of truth (covers all roles)

// ─── Lost-authenticator recovery modal ─────────────────────────────────────────
// 3 steps: request an emailed code -> confirm that code -> scan a fresh QR
// and activate it (reuses the existing /api/auth/2fa/verify endpoint).
type RecoveryStep = 'request' | 'emailCode' | 'qr';

interface RecoveryModalProps {
  visible: boolean;
  onClose: () => void;
  onActivated: () => void; // fresh 2FA confirmed — caller proceeds to dashboard
}

function RecoveryModal({ visible, onClose, onActivated }: RecoveryModalProps) {
  const [step,        setStep]        = useState<RecoveryStep>('request');
  const [emailCode,   setEmailCode]   = useState('');
  const [qrCode,      setQrCode]      = useState<string | null>(null);
  const [newToken,    setNewToken]    = useState('');
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState('');
  const [lang,        setLang]        = useState<'he' | 'en'>('he');
  const isRtl = lang === 'he';

  const reset = () => {
    setStep('request'); setEmailCode(''); setQrCode(null); setNewToken(''); setError('');
  };
  const handleClose = () => { reset(); onClose(); };

  const handleSendCode = async () => {
    setBusy(true);
    setError('');
    try {
      await apiClient.post('/api/auth/2fa/recovery/request');
      setStep('emailCode');
    } catch (err: any) {
      setError(err.response?.data?.error || (lang === 'he' ? 'שליחת קוד השחזור נכשלה.' : 'Failed to send recovery code.'));
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmEmailCode = async () => {
    if (emailCode.length !== 6) {
      setError(lang === 'he' ? 'יש להזין את הקוד בן 6 הספרות מהמייל.' : 'Please enter the full 6-digit code from your email.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await apiClient.post('/api/auth/2fa/recovery/verify', { code: emailCode });
      setQrCode(res.data.qrCode);
      setStep('qr');
    } catch (err: any) {
      setError(err.response?.data?.error || (lang === 'he' ? 'קוד שגוי או שפג תוקפו.' : 'Invalid or expired code.'));
    } finally {
      setBusy(false);
    }
  };

  const handleActivateNewAuthenticator = async () => {
    if (newToken.length !== 6) {
      setError(lang === 'he' ? 'יש להזין את הקוד בן 6 הספרות מאפליקציית האימות החדשה.' : 'Please enter the full 6-digit code from your new authenticator.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiClient.post('/api/auth/2fa/verify', { token: newToken });
      reset();
      onActivated();
    } catch (err: any) {
      setError(err.response?.data?.error || (lang === 'he' ? 'קוד שגוי. נסה שנית.' : 'Invalid code. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <ScrollView style={m.modal} contentContainerStyle={m.content}>
        <View style={[m.langRow, isRtl && m.rowReverse]}>
          <TouchableOpacity style={m.langBtn} onPress={() => setLang(lang === 'he' ? 'en' : 'he')}>
            <Text style={m.langBtnText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={m.title}>🔑 {lang === 'he' ? 'שחזור חשבון' : 'Account Recovery'}</Text>

        {step === 'request' && (
          <>
            <Text style={[m.body, isRtl && m.textRight]}>
              {lang === 'he'
                ? 'איבדת גישה לאפליקציית האימות שלך? נשלח קוד שחזור לכתובת המייל הרשומה בחשבון שלך. הזן אותו כאן כדי להגדיר אפליקציית אימות חדשה.'
                : "Lost access to your authenticator app? We'll email a recovery code to the address on your account. Enter it here to set up a new authenticator."}
            </Text>
            {error ? <Text style={m.error}>{error}</Text> : null}
            <TouchableOpacity style={[m.button, busy && m.buttonDisabled]} onPress={handleSendCode} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={m.buttonText}>{lang === 'he' ? 'שלח קוד שחזור' : 'Send Recovery Code'}</Text>}
            </TouchableOpacity>
          </>
        )}

        {step === 'emailCode' && (
          <>
            <Text style={[m.body, isRtl && m.textRight]}>
              {lang === 'he' ? 'הזן את הקוד בן 6 הספרות שנשלח למייל שלך.' : 'Enter the 6-digit code we emailed you.'}
            </Text>
            <TextInput
              style={m.input}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              value={emailCode}
              onChangeText={setEmailCode}
              autoFocus
            />
            {error ? <Text style={m.error}>{error}</Text> : null}
            <TouchableOpacity style={[m.button, busy && m.buttonDisabled]} onPress={handleConfirmEmailCode} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={m.buttonText}>{lang === 'he' ? 'אשר קוד' : 'Confirm Code'}</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSendCode} disabled={busy}>
              <Text style={m.link}>{lang === 'he' ? 'שלח קוד מחדש' : 'Resend code'}</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'qr' && (
          <>
            <Text style={[m.body, isRtl && m.textRight]}>
              {lang === 'he'
                ? 'סרוק את קוד ה-QR עם Google Authenticator או Authy, ולאחר מכן הזן את הקוד החדש למטה.'
                : 'Scan this QR code with Google Authenticator or Authy, then enter the new code below.'}
            </Text>
            {qrCode && <Image source={{ uri: qrCode }} style={m.qr} />}
            <TextInput
              style={m.input}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              value={newToken}
              onChangeText={setNewToken}
              autoFocus
            />
            {error ? <Text style={m.error}>{error}</Text> : null}
            <TouchableOpacity style={[m.button, busy && m.buttonDisabled]} onPress={handleActivateNewAuthenticator} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={m.buttonText}>{lang === 'he' ? 'הפעל והמשך' : 'Activate & Continue'}</Text>}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={handleClose} disabled={busy}>
          <Text style={m.cancelLink}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </Modal>
  );
}

export default function Verify2FA() {
  const router = useRouter();
  const [token,   setToken]   = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);

  const checkMaintenance = useMaintenanceCheck(); // ← NEW

  // Shared "2FA is now confirmed" continuation — used by both the normal
  // code-entry path and the recovery flow's final activation step.
  const completeLoginAfter2FA = async () => {
    const userRes = await apiClient.get('/api/users/me');
    const role    = userRes.data.role;

    const maintenance = await checkMaintenance(role);
    if (maintenance.blocked) {
      router.replace({
        pathname: '/maintenance',
        params: {
          title:  maintenance.title,
          endsAt: maintenance.endsAt ?? '',
        },
      } as any);
      return;
    }

    router.replace(getHomeRoute(role) as any);
  };

  const handleVerify = async () => {
    if (token.length !== 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await apiClient.post('/api/auth/2fa/validate', { token });
      await completeLoginAfter2FA();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Two-Factor Authentication</Text>
      <Text style={styles.subtitle}>
        Open your authenticator app and enter the 6-digit code
      </Text>

      <TextInput
        style={styles.input}
        placeholder="000000"
        keyboardType="number-pad"
        maxLength={6}
        value={token}
        onChangeText={setToken}
        autoFocus
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleVerify}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Verify</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setShowRecovery(true)}>
        <Text style={styles.recoveryLink}>Lost your authenticator app?</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={async () => {
        await signOut(auth);
        router.replace('/(auth)/login' as any);
      }}>
        <Text style={styles.backLink}>← Back to login</Text>
      </TouchableOpacity>

      <RecoveryModal
        visible={showRecovery}
        onClose={() => setShowRecovery(false)}
        onActivated={() => {
          setShowRecovery(false);
          completeLoginAfter2FA();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F0F4FF' },
  title:          { fontSize: 24, fontWeight: 'bold', marginBottom: 8, color: '#1a1a2e' },
  subtitle:       { textAlign: 'center', color: '#666', marginBottom: 32, lineHeight: 22 },
  input:          { borderWidth: 2, borderColor: '#2E86FF', borderRadius: 12, padding: 16, width: '100%', fontSize: 32, textAlign: 'center', letterSpacing: 12, marginBottom: 12, backgroundColor: '#fff' },
  button:         { backgroundColor: '#2E86FF', padding: 16, borderRadius: 12, width: '100%', alignItems: 'center', marginTop: 8 },
  buttonDisabled: { backgroundColor: '#a0c4ff' },
  buttonText:     { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  error:          { color: '#e74c3c', marginBottom: 8, textAlign: 'center' },
  recoveryLink:   { marginTop: 20, color: '#2E86FF', fontSize: 14, fontWeight: '600' },
  backLink:       { marginTop: 16, color: '#666', fontSize: 14 },
});

const m = StyleSheet.create({
  modal:          { flex: 1, backgroundColor: '#F0F4FF' },
  content:        { padding: 24, paddingTop: 40, alignItems: 'center' },
  title:          { fontSize: 20, fontWeight: 'bold', marginBottom: 16, color: '#1a1a2e' },
  body:           { textAlign: 'center', color: '#555', marginBottom: 20, lineHeight: 22 },
  input:          { borderWidth: 2, borderColor: '#2E86FF', borderRadius: 12, padding: 16, width: '100%', fontSize: 28, textAlign: 'center', letterSpacing: 10, marginBottom: 16, backgroundColor: '#fff' },
  qr:             { width: 200, height: 200, marginBottom: 20, alignSelf: 'center' },
  button:         { backgroundColor: '#2E86FF', padding: 16, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 8 },
  buttonDisabled: { backgroundColor: '#a0c4ff' },
  buttonText:     { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  error:          { color: '#e74c3c', marginBottom: 12, textAlign: 'center' },
  link:           { color: '#2E86FF', fontSize: 14, textAlign: 'center', marginTop: 8 },
  cancelLink:     { color: '#999', fontSize: 14, textAlign: 'center', marginTop: 24 },
  rowReverse:     { flexDirection: 'row-reverse' },
  textRight:      { textAlign: 'right' },
  langRow:        { flexDirection: 'row', justifyContent: 'flex-end', width: '100%', marginBottom: 12 },
  langBtn:        { backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#D0DEFF' },
  langBtnText:    { fontSize: 12, fontWeight: '700', color: '#2E86FF' },
});
