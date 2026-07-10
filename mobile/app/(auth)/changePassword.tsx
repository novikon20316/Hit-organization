// app/(auth)/changePassword.tsx
//
// Forced first-login password change for accounts created via Excel import
// (users or staff) — see mustChangePassword flag set by
// createImportedUserAccount in server/src/services/userImportExport.ts.
// Also reachable for a voluntary password change later if needed.

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { apiClient } from '../../src/api/apiClient';
import { auth, db } from '@/src/firebase/firebase';
import { useMaintenanceCheck } from '@/hooks/useMaintenanceCheck';
import { getHomeRoute } from '@/firebase/roles'; // ← single source of truth (covers all roles)

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const checkMaintenance = useMaintenanceCheck();

  const handleSubmit = async () => {
    setError('');
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/api/users/change-password', { newPassword });

      const uid     = auth.currentUser?.uid;
      const userDoc = uid ? await getDoc(doc(db, 'users', uid)) : null;
      const role    = userDoc?.data()?.role ?? '';

      const maintenance = await checkMaintenance(role);
      if (maintenance.blocked) {
        router.replace({
          pathname: '/maintenance',
          params: { title: maintenance.title, endsAt: maintenance.endsAt ?? '' },
        } as any);
        return;
      }

      router.replace(getHomeRoute(role as any) as any);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Set a New Password</Text>
      <Text style={styles.subtitle}>
        Your account was created with a temporary password. Choose a new
        password to continue.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="New password"
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
        autoFocus
      />

      <TextInput
        style={styles.input}
        placeholder="Confirm new password"
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Save & Continue</Text>
        }
      </TouchableOpacity>

      <Pressable onPress={async () => {
        await signOut(auth);
        router.replace('/(auth)/login' as any);
      }}>
        <Text style={styles.backLink}>Sign out instead</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F0F4FF' },
  title:          { fontSize: 24, fontWeight: 'bold', marginBottom: 8, color: '#1a1a2e' },
  subtitle:       { textAlign: 'center', color: '#666', marginBottom: 32, lineHeight: 22 },
  input:          { borderWidth: 2, borderColor: '#2E86FF', borderRadius: 12, padding: 14, width: '100%', fontSize: 16, marginBottom: 12, backgroundColor: '#fff' },
  button:         { backgroundColor: '#2E86FF', padding: 16, borderRadius: 12, width: '100%', alignItems: 'center', marginTop: 8 },
  buttonDisabled: { backgroundColor: '#a0c4ff' },
  buttonText:     { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  error:          { color: '#e74c3c', marginBottom: 8, textAlign: 'center' },
  backLink:       { marginTop: 24, color: '#2E86FF', fontSize: 14 },
});
