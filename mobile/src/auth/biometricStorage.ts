// src/auth/biometricStorage.ts
//
// Device-local state for biometric (Face ID / fingerprint) login: whether
// it's enabled, and how many consecutive local failures have happened since
// the last success. Deliberately a plain expo-secure-store key per value,
// NOT the chunked secureStorage.ts adapter used for Firebase's own auth
// persistence blob — that chunking exists to work around SecureStore's
// ~2KB value cap for a large token, which a boolean/small int never
// approaches, so reusing it here would just be unnecessary indirection.
//
// Every key is scoped by uid so switching accounts on a shared device can
// never read one account's biometric state as another's.

import * as SecureStore from 'expo-secure-store';

const FAIL_THRESHOLD = 3;

function enabledKey(uid: string): string {
  return `biometric_enabled_${uid}`;
}
function failCountKey(uid: string): string {
  return `biometric_fail_count_${uid}`;
}

export async function isBiometricEnabled(uid: string): Promise<boolean> {
  const value = await SecureStore.getItemAsync(enabledKey(uid));
  return value === '1';
}

export async function setBiometricEnabled(uid: string, enabled: boolean): Promise<void> {
  if (enabled) {
    await SecureStore.setItemAsync(enabledKey(uid), '1');
  } else {
    await SecureStore.deleteItemAsync(enabledKey(uid));
  }
  // Enabling or disabling always starts from a clean slate.
  await SecureStore.deleteItemAsync(failCountKey(uid));
}

/** Returns the new fail count after incrementing, and whether it just hit
 *  FAIL_THRESHOLD (the caller is responsible for disabling biometric and
 *  reporting the exhaustion to the server when `exhausted` is true). */
export async function recordBiometricFailure(uid: string): Promise<{ count: number; exhausted: boolean }> {
  const current = await SecureStore.getItemAsync(failCountKey(uid));
  const count = (current ? parseInt(current, 10) : 0) + 1;
  await SecureStore.setItemAsync(failCountKey(uid), String(count));
  return { count, exhausted: count >= FAIL_THRESHOLD };
}

export async function resetBiometricFailures(uid: string): Promise<void> {
  await SecureStore.deleteItemAsync(failCountKey(uid));
}
