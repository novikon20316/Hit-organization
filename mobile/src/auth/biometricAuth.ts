// src/auth/biometricAuth.ts
//
// Thin wrapper around expo-local-authentication (Face ID / Touch ID on iOS,
// fingerprint/biometric on Android) plus the one piece of cross-screen state
// this feature needs: whether the current app session has already been
// unlocked, so the gate in _layout.tsx only fires once per cold start —
// not again immediately after a fresh interactive login (the user just
// proved who they are by typing their password or completing Google/Apple
// sign-in) or after the biometric/password unlock screen itself succeeds.
// Deliberately in-memory (not persisted) — a fresh value every app launch
// is exactly the point, since a cold start is when the gate needs to fire.

import * as LocalAuthentication from 'expo-local-authentication';

let unlockedThisSession = false;

export function markSessionUnlocked(): void {
  unlockedThisSession = true;
}
export function isSessionUnlocked(): boolean {
  return unlockedThisSession;
}

export async function isBiometricHardwareReady(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return false;
  return LocalAuthentication.isEnrolledAsync();
}

export interface BiometricPromptResult {
  success: boolean;
  /** True for an actual failed match / native lockout — the kind that
   *  should count toward the 3-attempt local counter. False for the user
   *  backing out on purpose (cancel) or the OS reporting no biometric is
   *  available right now — neither is "they tried and failed". */
  countsAsFailure: boolean;
}

export async function promptBiometricAuth(lang: 'he' | 'en'): Promise<BiometricPromptResult> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: lang === 'he' ? 'אמת את זהותך' : 'Verify your identity',
    cancelLabel: lang === 'he' ? 'השתמש בסיסמה' : 'Use password',
  });

  if (result.success) return { success: true, countsAsFailure: false };

  const nonFailureErrors = new Set([
    'user_cancel', 'app_cancel', 'system_cancel', 'not_enrolled', 'not_available',
  ]);
  const errorCode = 'error' in result ? result.error : undefined;
  return { success: false, countsAsFailure: !nonFailureErrors.has(errorCode ?? '') };
}
