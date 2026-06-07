import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { apiClient } from '../../src/api/apiClient';
import { signOut } from 'firebase/auth';
import { auth } from '@/src/firebase/firebase';

export default function Verify2FA() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (token.length !== 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Validate the TOTP code against the server
      await apiClient.post('/api/auth/2fa/validate', { token });

      // Fetch role to redirect correctly
      const userRes = await apiClient.get('/api/users/me');
      const role = userRes.data.role;

      router.replace(
        role === 'system_admin'   ? '/admin/panel'
        : role === 'faculty_admin'  ? '/faculty_admin/dashboard'
        : role === 'coordinator'    ? '/coordinator/home'
        : role === 'supervisor'     ? '/supervisor/dashboard'
        : role === 'student'        ? '/student/home'
        : role === 'examiner'       ? '/examinor/home'
        : '/(auth)/login'
      );

    } catch (err: any) {
      setError('Invalid code. Please try again.');
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

      <TouchableOpacity onPress={async () => {
        await signOut(auth);
        router.replace('/(auth)/login' as any);
      }}>
        <Text style={styles.backLink}>← Back to login</Text>
      </TouchableOpacity>
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
  backLink:       { marginTop: 24, color: '#2E86FF', fontSize: 14 },
});