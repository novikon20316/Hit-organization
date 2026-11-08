import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image } from 'react-native';
import { apiClient } from '../../src/api/apiClient';
import { router } from 'expo-router';
import { auth } from '@/src/firebase/firebase';
import { Setup2faStyles } from '../../constants/styles';

export default function Setup2FA() {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadQrCode = async () => {
    try {
      setError('');
      const res = await apiClient.post('/api/auth/2fa/setup');
      setQrCode(res.data.qrCode);
    } catch (err) {
      setError('Failed to load the QR code. Please try again.');
    }
  };

  useEffect(() => {
    loadQrCode();
  }, []);

  // `code` is passed explicitly by the auto-submit in onChangeText, since
  // the token state hasn't updated yet at that point.
  const handleVerify = async (code: string = token) => {
    if (busy) return;
    setBusy(true);
    try {
        await apiClient.post('/api/auth/2fa/verify', { token: code });
        setDone(true);
        const userRes = await apiClient.get('/api/users/me');
        const role = userRes.data.role;

        setTimeout(() => {
            router.replace(
            role === 'system_admin'         ? '/admin/overview'
            : role === 'faculty_admin'        ? '/faculty_admin/dashboard'
            : role === 'coordinator'          ? '/coordinator/home'
            : role === 'program_head'         ? '/program_head/program_head_dashboard'
            : role === 'administrative_secretary'  ? '/administrative_coordinator/administrative_coordinator_dashboard'
            : role === 'grad_school_head'     ? '/grad_school_head/grad_school_head_dashboard'
            : (role === 'supervisor' || role === 'secondary_supervisor') ? '/supervisor/dashboard'
            : role === 'student'              ? '/student/home'
            : role === 'internal_examiner'     ? '/examinor/home'
            : '/(auth)/login'
            );
        }, 1500);
    } catch {
        setError('Invalid code. Please try again.');
    } finally {
        setBusy(false);
    }
    };

  if (done) return (
    <View style={styles.container}>
      <Text style={styles.success}>✅ 2FA activated! Redirecting...</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Set Up 2FA</Text>
      <Text style={styles.subtitle}>Scan this QR code with Google Authenticator or Authy</Text>
      {qrCode && <Image source={{ uri: qrCode }} style={styles.qr} />}
      {!qrCode && error ? (
        <TouchableOpacity style={styles.button} onPress={loadQrCode} accessibilityRole="button">
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
      <TextInput
        style={styles.input}
        placeholder="Enter 6-digit code"
        keyboardType="number-pad"
        maxLength={6}
        value={token}
        onChangeText={(t) => {
          const digits = t.replace(/\D/g, '');
          setToken(digits);
          setError('');
          // Auto-submit on the 6th digit (typed, pasted or autofilled).
          if (digits.length === 6) handleVerify(digits);
        }}
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        accessibilityLabel="Enter 6-digit code"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity style={styles.button} onPress={() => handleVerify()} disabled={busy} accessibilityRole="button">
        <Text style={styles.buttonText}>Activate 2FA</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = Setup2faStyles;