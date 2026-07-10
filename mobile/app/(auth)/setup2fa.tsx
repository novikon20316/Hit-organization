import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { apiClient } from '../../src/api/apiClient'; 
import { router } from 'expo-router';
import { auth } from '@/src/firebase/firebase';

export default function Setup2FA() {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const loadQrCode = async () => {
    try {
      setError('');
      const res = await apiClient.post('/api/auth/2fa/setup');
      setQrCode(res.data.qrCode);
    } catch (err) {
      console.error('Failed to load 2FA QR code:', err);
      setError('Failed to load the QR code. Please try again.');
    }
  };

  useEffect(() => {
    loadQrCode();
  }, []);

  const handleVerify = async () => {
    try {
        await apiClient.post('/api/auth/2fa/verify', { token });
        setDone(true);
        const userRes = await apiClient.get('/api/users/me');
        const role = userRes.data.role;

        setTimeout(() => {
            router.replace(
            role === 'system_admin'   ? '/admin/panel'
            : role === 'faculty_admin'  ? '/faculty_admin/dashboard'
            : role === 'coordinator'    ? '/coordinator/home'
            : role === 'supervisor'     ? '/supervisor/dashboard'
            : role === 'student'        ? '/student/home'
            : role === 'examiner'       ? '/examinor/home'
            : '/(auth)/login'
            );
        }, 1500);
    } catch {
        setError('Invalid code. Please try again.');
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
        <TouchableOpacity style={styles.button} onPress={loadQrCode}>
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
      <TextInput
        style={styles.input}
        placeholder="Enter 6-digit code"
        keyboardType="number-pad"
        maxLength={6}
        value={token}
        onChangeText={setToken}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity style={styles.button} onPress={handleVerify}>
        <Text style={styles.buttonText}>Activate 2FA</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { textAlign: 'center', color: '#666', marginBottom: 20 },
  qr: { width: 200, height: 200, marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, width: '100%', fontSize: 18, textAlign: 'center', marginBottom: 12 },
  button: { backgroundColor: '#4F46E5', padding: 14, borderRadius: 8, width: '100%', alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  error: { color: 'red', marginBottom: 8 },
  success: { fontSize: 18, color: 'green' },
});