// app/(auth)/login.tsx
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from "react-native";
import { PRIMARY, loginStyles } from '../../constants';
import { useState, useEffect } from "react";
import { useRouter } from 'expo-router';
import { doc, getDoc } from "firebase/firestore";
import {
  signInWithEmailAndPassword,
  signInWithCredential,
  linkWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
  type AuthCredential,
} from "firebase/auth";
import { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { auth, db } from "@/src/firebase/firebase";
import { useMaintenanceCheck } from '@/hooks/useMaintenanceCheck'; // ← NEW
import { getHomeRoute } from '@/firebase/roles'; // ← single source of truth (covers all roles)
import { apiClient } from '@/src/api/apiClient';

export default function LoginScreen() {
  const router = useRouter();
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // "Sign in with Google" — a Google account whose email already has an
  // existing password-based account throws auth/account-exists-with-
  // -different-credential instead of silently creating a second, orphaned
  // uid. This prompts for that account's password so we can link the Google
  // credential onto it (Firebase's own documented recipe), same as the web
  // login page's flow.
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [appleSubmitting, setAppleSubmitting] = useState(false);
  const [linkingPrompt, setLinkingPrompt] = useState<{ email: string; pendingCredential: AuthCredential } | null>(null);
  const [linkingPassword, setLinkingPassword] = useState('');
  const [linkingSubmitting, setLinkingSubmitting] = useState(false);
  const [linkingError, setLinkingError] = useState('');

  // "Sign in with Apple" only exists on iOS at all — the native module
  // resolves `isAvailableAsync()` to false on Android by design, but we
  // gate on Platform.OS too so the button never even mounts there. Apple
  // requires this specifically to satisfy App Store Guideline 4.8 (parity
  // with the Google sign-in option above); Play has no equivalent
  // requirement, so Android intentionally never sees this button.
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const checkMaintenance = useMaintenanceCheck(); // ← NEW

  // Native Google Sign-In (not a browser/WebView redirect flow — Google's
  // OAuth policy blocks that for installed apps, confirmed by an actual
  // "doesn't comply with OAuth 2.0 policy" error from the older
  // expo-auth-session-based approach this replaced). webClientId identifies
  // the token's audience so Firebase's GoogleAuthProvider.credential(idToken)
  // accepts it; the native module resolves the platform's own OAuth client
  // (Android/iOS) automatically via the app's package name + SHA-1 already
  // registered in Google Cloud Console. See app.json's `extra` block.
  useEffect(() => {
    const googleExtra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;
    GoogleSignin.configure({
      webClientId: googleExtra.googleWebClientId || undefined,
      iosClientId: googleExtra.googleIosClientId || undefined,
    });
  }, []);

  // Shared by both the direct Google sign-in path and the post-linking path
  // below, so they can never disagree on where a signed-in user should land.
  const proceedAfterOAuthSignIn = async (uid: string) => {
    const userDoc = await getDoc(doc(db, 'users', uid));
    const userData = userDoc.data();

    if (!userData) {
      // Brand-new Google identity, no matching Firestore doc — a genuinely
      // new account, not an existing one. Collect the same academic-info
      // fields self-signup's second half does, rather than silently
      // creating a bare account.
      router.replace('/(auth)/completeProfile');
      return;
    }

    apiClient.post('/api/users/log-login').catch(() => {});
    const role = userData?.role ?? '';

    if (userData?.mustChangePassword) {
      router.push('/(auth)/changePassword');
      return;
    }
    if (userData?.totp_enabled) {
      router.push('/(auth)/verify2fa');
      return;
    }
    const maintenance = await checkMaintenance(role);
    if (maintenance.blocked) {
      router.replace({
        pathname: '/maintenance',
        params: { title: maintenance.title, endsAt: maintenance.endsAt ?? '' },
      } as any);
      return;
    }
    router.replace(getHomeRoute(role as any) as any);
  };

  const handleGoogleSignIn = async () => {
    if (googleSubmitting) return;
    setGoogleSubmitting(true);
    setError('');
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return; // user cancelled — not an error worth surfacing

      const idToken = response.data.idToken;
      if (!idToken) throw new Error('No ID token returned from Google.');

      const credential = GoogleAuthProvider.credential(idToken);
      const cred = await signInWithCredential(auth, credential);
      await proceedAfterOAuthSignIn(cred.user.uid);
    } catch (err: any) {
      if (err.code === 'auth/account-exists-with-different-credential') {
        const pendingCredential = GoogleAuthProvider.credentialFromError(err);
        const linkEmail = err.customData?.email;
        if (pendingCredential && linkEmail) {
          setLinkingPrompt({ email: linkEmail, pendingCredential });
        } else {
          setError('Login failed. Please try again.');
        }
      } else if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled — not an error worth surfacing.
      } else {
        console.error('Google sign-in failed:', err.code, err.message);
        setError('Login failed. Please try again.');
      }
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleAppleSignIn = async () => {
    if (appleSubmitting) return;
    setAppleSubmitting(true);
    setError('');
    try {
      // Raw nonce stays on-device and is only ever handed to Firebase;
      // Apple only ever sees its SHA-256 hash. This round-trip (rather than
      // passing the same nonce to both) is Apple's own documented replay-
      // protection recipe for `signInAsync`.
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!appleCredential.identityToken) throw new Error('No identity token returned from Apple.');

      const credential = new OAuthProvider('apple.com').credential({
        idToken: appleCredential.identityToken,
        rawNonce,
      });
      const cred = await signInWithCredential(auth, credential);
      await proceedAfterOAuthSignIn(cred.user.uid);
    } catch (err: any) {
      if (err.code === 'auth/account-exists-with-different-credential') {
        const pendingCredential = OAuthProvider.credentialFromError(err);
        const linkEmail = err.customData?.email;
        if (pendingCredential && linkEmail) {
          setLinkingPrompt({ email: linkEmail, pendingCredential });
        } else {
          setError('Login failed. Please try again.');
        }
      } else if (err.code === 'ERR_REQUEST_CANCELED') {
        // User cancelled — not an error worth surfacing.
      } else {
        console.error('Apple sign-in failed:', err.code, err.message);
        setError('Login failed. Please try again.');
      }
    } finally {
      setAppleSubmitting(false);
    }
  };

  const handleLinkSubmit = async () => {
    if (!linkingPrompt || linkingSubmitting) return;
    setLinkingSubmitting(true);
    setLinkingError('');
    try {
      const cred = await signInWithEmailAndPassword(auth, linkingPrompt.email, linkingPassword);
      await linkWithCredential(cred.user, linkingPrompt.pendingCredential);
      setLinkingPrompt(null);
      setLinkingPassword('');
      await proceedAfterOAuthSignIn(cred.user.uid);
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        setLinkingError('Incorrect email or password.');
      } else {
        setLinkingError('Login failed. Please try again.');
      }
    } finally {
      setLinkingSubmitting(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError('');

    try {
      const firebaseUser = await signInWithEmailAndPassword(auth, email, password);

      // Fire-and-forget — feeds the system_admin "Live Transportation" audit
      // table. Only here (an actual credential submission), never in
      // _layout.tsx's own auth-state redirect logic, so reopening the app
      // with a still-live session doesn't log a fresh "login" every time.
      apiClient.post('/api/users/log-login').catch(() => {});

      // Force a fresh fetch of the account record instead of trusting
      // whatever emailVerified value came back with this sign-in. That value
      // can be a stale snapshot when verification status changed externally
      // (e.g. an admin flipping it via the Admin SDK) rather than through the
      // user completing the actual verification-link flow in this same
      // session — reload() is Firebase's documented fix for exactly that.
      await firebaseUser.user.reload();

      const userDoc  = await getDoc(doc(db, 'users', firebaseUser.user.uid));
      const userData = userDoc.data();

      // Only self-registered students go through email verification —
      // every other role is provisioned via admin import with emailVerified
      // already set true at account creation (see createImportedUserAccount
      // in server/src/services/userImportExport.ts), so this gate must not
      // apply to them. A student who hasn't verified yet has no Firestore
      // profile at all (signup.tsx doesn't write one until verification
      // completes), so `!userData` also means "still mid-verification" here.
      const isStudent = !userData || userData?.role === 'student';

      if (isStudent && !firebaseUser.user.emailVerified) {
        await auth.signOut();
        setError(
          'Please verify your email before logging in. Check your inbox (and spam folder) for the verification link we sent during signup.'
        );
        return;
      }

      if (!userData) {
        // Email verified, but the profile sync never completed (e.g. the app
        // closed at exactly the wrong moment). Signing up again with the same
        // email/password will detect the verified pending account and finish
        // the sync instead of creating a duplicate.
        await auth.signOut();
        setError('Your email is verified, but your profile setup didn\'t finish. Please sign up again to complete it.');
        return;
      }

      const role = userData?.role ?? '';

      // ── Forced password change (accounts created via Excel import) ────────
      // Takes priority over the 2FA check below — a temp password must be
      // replaced before anything else, including verifying 2FA.
      if (userData?.mustChangePassword) {
        router.push('/(auth)/changePassword');
        return;
      }

      // ── 2FA check (unchanged) ──────────────────────────────────────────────
      if (userData?.totp_enabled) {
        router.push('/(auth)/verify2fa');
        return;
      }

      // ── ✅ NEW: maintenance gate ───────────────────────────────────────────
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
      // ──────────────────────────────────────────────────────────────────────

      router.replace(getHomeRoute(role as any) as any);

      // ── 2FA not enabled — nudge the user, don't block them ────────────────
      const lang = userData?.language === 'en' ? 'en' : 'he';
      Alert.alert(
        lang === 'he' ? '🔐 מומלץ להפעיל אימות דו-שלבי' : '🔐 Enable Two-Factor Authentication',
        lang === 'he'
          ? 'לאבטחת החשבון שלך, קריטי להפעיל אימות דו-שלבי (2FA) בהקדם האפשרי.'
          : "For your account's security, it's crucial to enable two-factor authentication (2FA) as soon as possible.",
        [
          { text: lang === 'he' ? 'מאוחר יותר' : 'Later', style: 'cancel' },
          { text: lang === 'he' ? 'הפעל עכשיו' : 'Enable Now', onPress: () => router.push('/(auth)/setup2fa') },
        ]
      );

    } catch (err: any) {
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/wrong-password'
      ) {
        // Server independently re-verifies against Firebase itself before
        // counting this — see services/loginSecurity.ts. Only after 3
        // confirmed-wrong attempts does it disable the account and email a
        // "was this you?" link, which `locked` reflects here.
        try {
          const { locked } = await apiClient.reportFailedLogin(email, password);
          setError(
            locked
              ? 'Too many incorrect attempts. Check your email to verify this was you.'
              : 'Incorrect email or password.'
          );
        } catch {
          setError('Incorrect email or password.');
        }
      } else if (err.code === 'auth/user-disabled') {
        setError('This account is temporarily locked pending a security check. Check your email for next steps.');
      } else if (err.code === 'auth/user-not-found') {
        setError('No account found with this email.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>

        <View style={styles.logoContainer}>
          <Image
            source={require('../../assets/hit-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>HIT System</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            placeholder="Email"
            placeholderTextColor="#999"
            value={email}
            onChangeText={(t) => { setEmail(t); setError(''); }}
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
            accessibilityLabel="Email"
          />

          {/* ── Password row with show/hide toggle ── */}
          <View style={{ position: 'relative', justifyContent: 'center', marginBottom: 12 }}>
            <TextInput
              placeholder="Password"
              placeholderTextColor="#999"
              value={password}
              onChangeText={(t) => { setPassword(t); setError(''); }}
              secureTextEntry={!showPassword}
              style={[styles.input, { marginBottom: 0, paddingRight: 48 }]}
              accessibilityLabel="Password"
            />
            <Pressable
              onPress={() => setShowPassword(prev => !prev)}
              style={{ position: 'absolute', right: 14, padding: 4 }}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Text style={{ fontSize: 18 }}>{showPassword ? '🙈' : '👁️'}</Text>
            </Pressable>
          </View>

          {error ? (
            <Text style={{ color: 'red', marginBottom: 8, textAlign: 'center' }}>
              {error}
            </Text>
          ) : null}

          <TouchableOpacity
            style={styles.button}
            onPress={handleLogin}
            disabled={loading}
            accessibilityRole="button"
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Login</Text>
            }
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 14 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: '#e5e5e5' }} />
            <Text style={{ marginHorizontal: 8, color: '#999', fontSize: 12 }}>or</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: '#e5e5e5' }} />
          </View>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e5e5' }]}
            onPress={handleGoogleSignIn}
            disabled={googleSubmitting}
            accessibilityRole="button"
          >
            {googleSubmitting
              ? <ActivityIndicator color={PRIMARY} />
              : <Text style={[styles.buttonText, { color: '#333' }]}>Continue with Google</Text>
            }
          </TouchableOpacity>

          {Platform.OS === 'ios' && appleAvailable && (
            <View style={{ marginTop: 10 }}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={8}
                style={{ width: '100%', height: 48 }}
                onPress={handleAppleSignIn}
              />
              {appleSubmitting && (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
            </View>
          )}

          <Pressable onPress={() => router.push('/(auth)/signup')} accessibilityRole="link">
            <Text style={{ color: PRIMARY, textAlign: 'center', marginTop: 10 }}>
              Don&#39;t have an account? Sign Up.
            </Text>
          </Pressable>

          <Pressable onPress={() => router.push('/(auth)/resetPass')} accessibilityRole="link">
            <Text style={{ color: PRIMARY, textAlign: 'center', marginTop: 10 }}>
              Don&#39;t remember your password? Reset It.
            </Text>
          </Pressable>
        </View>
      </View>

      <Modal visible={!!linkingPrompt} transparent animationType="fade" onRequestClose={() => setLinkingPrompt(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 6 }}>
              An account with this email already exists
            </Text>
            <Text style={{ fontSize: 13, color: '#666', marginBottom: 14 }}>
              Enter the password for {linkingPrompt?.email} to link this sign-in to your existing account.
            </Text>
            <TextInput
              placeholder="Password"
              placeholderTextColor="#999"
              value={linkingPassword}
              onChangeText={(t) => { setLinkingPassword(t); setLinkingError(''); }}
              secureTextEntry
              style={styles.input}
              accessibilityLabel="Password"
            />
            {linkingError ? (
              <Text style={{ color: 'red', marginBottom: 8, fontSize: 13 }}>{linkingError}</Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              <TouchableOpacity
                style={[styles.button, { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e5e5' }]}
                onPress={() => { setLinkingPrompt(null); setLinkingPassword(''); setLinkingError(''); }}
                accessibilityRole="button"
              >
                <Text style={[styles.buttonText, { color: '#333' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { flex: 1 }]}
                onPress={handleLinkSubmit}
                disabled={linkingSubmitting}
                accessibilityRole="button"
              >
                {linkingSubmitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.buttonText}>Link account</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = loginStyles;