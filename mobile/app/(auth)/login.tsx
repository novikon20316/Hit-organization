// app/(auth)/login.tsx
// Restyled to match web's app/(auth)/login/page.tsx design (same paper/
// surface/ink palette, card with a primary-colored role-rail, labeled
// inputs, bordered secondary buttons) — auth logic below is unchanged.
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Pressable,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Alert,
  Modal,
  StyleSheet,
} from "react-native";
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
import type { Lang } from '@/components/i18n';

// Same tokens as web's app/globals.css (--paper/--surface/--ink/--muted/
// --line/--primary/--danger*) — kept local to this screen since mobile's
// dashboards draw from a separate palette (constants/theme.ts's `ap`/
// `palette`), and this login screen exists purely to visually match web's.
const colors = {
  paper: '#f7f6f2',
  surface: '#ffffff',
  ink: '#1c2333',
  muted: '#6b7280',
  line: '#e4e1d8',
  primary: '#1e3a5f',
  primaryInk: '#ffffff',
  dangerText: '#a8433a',
  dangerBg: '#f7e9e7',
};

export default function LoginScreen() {
  const router = useRouter();
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused,    setEmailFocused]    = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  // Same pre-login toggle as signup.tsx/completeProfile.tsx — no Firestore
  // userData.language to read yet at this point, so it's local UI-only
  // state (defaults to 'he', matching those screens and web's own default).
  const [lang,         setLang]         = useState<Lang>('he');
  const isRtl = lang === 'he';

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
          setError(lang === 'he' ? 'ההתחברות נכשלה. נסה שוב.' : 'Login failed. Please try again.');
        }
      } else if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled — not an error worth surfacing.
      } else {
        console.error('Google sign-in failed:', err.code, err.message);
        setError(lang === 'he' ? 'ההתחברות נכשלה. נסה שוב.' : 'Login failed. Please try again.');
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
          setError(lang === 'he' ? 'ההתחברות נכשלה. נסה שוב.' : 'Login failed. Please try again.');
        }
      } else if (err.code === 'ERR_REQUEST_CANCELED') {
        // User cancelled — not an error worth surfacing.
      } else {
        console.error('Apple sign-in failed:', err.code, err.message);
        setError(lang === 'he' ? 'ההתחברות נכשלה. נסה שוב.' : 'Login failed. Please try again.');
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
        setLinkingError(lang === 'he' ? 'דוא"ל או סיסמה שגויים.' : 'Incorrect email or password.');
      } else {
        setLinkingError(lang === 'he' ? 'ההתחברות נכשלה. נסה שוב.' : 'Login failed. Please try again.');
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
          lang === 'he'
            ? 'יש לאמת את כתובת הדוא"ל לפני ההתחברות. בדוק את תיבת הדואר (וגם את הספאם) בעבור קישור האימות שנשלח בהרשמה.'
            : 'Please verify your email before logging in. Check your inbox (and spam folder) for the verification link we sent during signup.'
        );
        return;
      }

      if (!userData) {
        // Email verified, but the profile sync never completed (e.g. the app
        // closed at exactly the wrong moment). Signing up again with the same
        // email/password will detect the verified pending account and finish
        // the sync instead of creating a duplicate.
        await auth.signOut();
        setError(
          lang === 'he'
            ? 'הדוא"ל אומת, אך הגדרת הפרופיל לא הושלמה. הירשם שוב כדי להשלים אותה.'
            : 'Your email is verified, but your profile setup didn\'t finish. Please sign up again to complete it.'
        );
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
      // Uses the ACCOUNT's stored language preference, not this screen's
      // pre-login UI toggle above — by this point userData is authoritative.
      const accountLang = userData?.language === 'en' ? 'en' : 'he';
      Alert.alert(
        accountLang === 'he' ? '🔐 מומלץ להפעיל אימות דו-שלבי' : '🔐 Enable Two-Factor Authentication',
        accountLang === 'he'
          ? 'לאבטחת החשבון שלך, קריטי להפעיל אימות דו-שלבי (2FA) בהקדם האפשרי.'
          : "For your account's security, it's crucial to enable two-factor authentication (2FA) as soon as possible.",
        [
          { text: accountLang === 'he' ? 'מאוחר יותר' : 'Later', style: 'cancel' },
          { text: accountLang === 'he' ? 'הפעל עכשיו' : 'Enable Now', onPress: () => router.push('/(auth)/setup2fa') },
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
              ? lang === 'he'
                ? 'יותר מדי ניסיונות שגויים. בדוק את הדוא"ל כדי לאמת שזה אתה.'
                : 'Too many incorrect attempts. Check your email to verify this was you.'
              : lang === 'he'
                ? 'דוא"ל או סיסמה שגויים.'
                : 'Incorrect email or password.'
          );
        } catch {
          setError(lang === 'he' ? 'דוא"ל או סיסמה שגויים.' : 'Incorrect email or password.');
        }
      } else if (err.code === 'auth/user-disabled') {
        setError(
          lang === 'he'
            ? 'חשבון זה נעול זמנית לבדיקת אבטחה. בדוק את הדוא"ל להמשך.'
            : 'This account is temporarily locked pending a security check. Check your email for next steps.'
        );
      } else if (err.code === 'auth/user-not-found') {
        setError(lang === 'he' ? 'לא נמצא חשבון עם דוא"ל זה.' : 'No account found with this email.');
      } else {
        setError(lang === 'he' ? 'ההתחברות נכשלה. נסה שוב.' : 'Login failed. Please try again.');
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
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.langRow, isRtl && styles.rowReverse]}>
          <Pressable
            style={styles.langBtn}
            onPress={() => setLang(lang === 'he' ? 'en' : 'he')}
            accessibilityRole="button"
            accessibilityLabel={lang === 'he' ? 'החלף שפה לאנגלית' : 'Switch language to Hebrew'}
          >
            <Text style={styles.langText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
          </Pressable>
        </View>

        <View style={styles.headerBlock}>
          <Image
            source={require('../../assets/hit-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>{lang === 'he' ? 'ברוך שובך' : 'Welcome Back'}</Text>
          <Text style={styles.subtitle}>{lang === 'he' ? 'הזן את פרטי ההתחברות שלך' : 'Enter your credentials'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={[styles.label, isRtl && styles.textRight]}>{lang === 'he' ? 'כתובת דוא"ל' : 'Email Address'}</Text>
          <TextInput
            placeholder="you@hit.ac.il"
            placeholderTextColor={colors.muted}
            value={email}
            onChangeText={(t) => { setEmail(t); setError(''); }}
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
            style={[styles.input, styles.ltrInput, emailFocused && styles.inputFocused]}
            keyboardType="email-address"
            autoCapitalize="none"
            accessibilityLabel={lang === 'he' ? 'דוא"ל' : 'Email'}
          />

          <Text style={[styles.label, styles.labelSpaced, isRtl && styles.textRight]}>{lang === 'he' ? 'סיסמה' : 'Password'}</Text>
          <View style={styles.passwordRow}>
            <TextInput
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
              value={password}
              onChangeText={(t) => { setPassword(t); setError(''); }}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              secureTextEntry={!showPassword}
              style={[styles.input, styles.ltrInput, styles.passwordInput, passwordFocused && styles.inputFocused]}
              accessibilityLabel={lang === 'he' ? 'סיסמה' : 'Password'}
            />
            <Pressable
              onPress={() => setShowPassword(prev => !prev)}
              style={styles.eyeButton}
              accessibilityRole="button"
              accessibilityLabel={
                showPassword
                  ? (lang === 'he' ? 'הסתר סיסמה' : 'Hide password')
                  : (lang === 'he' ? 'הצג סיסמה' : 'Show password')
              }
            >
              <Text style={{ fontSize: 18 }}>{showPassword ? '🙈' : '👁️'}</Text>
            </Pressable>
          </View>

          {error ? (
            <Text style={styles.errorText} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[styles.button, styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            accessibilityRole="button"
          >
            {loading
              ? <ActivityIndicator color={colors.primaryInk} />
              : <Text style={styles.primaryButtonText}>{lang === 'he' ? 'התחבר' : 'Sign In'}</Text>
            }
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{lang === 'he' ? 'או' : 'or'}</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton, googleSubmitting && styles.buttonDisabled]}
            onPress={handleGoogleSignIn}
            disabled={googleSubmitting}
            accessibilityRole="button"
          >
            {googleSubmitting
              ? <ActivityIndicator color={colors.primary} />
              : <Text style={styles.secondaryButtonText}>{lang === 'he' ? 'המשך עם Google' : 'Continue with Google'}</Text>
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
                <View style={styles.appleOverlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
            </View>
          )}

          <View style={styles.linksBlock}>
            <Pressable onPress={() => router.push('/(auth)/signup')} accessibilityRole="link">
              <Text style={styles.linkText}>{lang === 'he' ? 'אין לך חשבון? הירשם' : "Don't have an account? Sign Up"}</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/(auth)/resetPass')} accessibilityRole="link">
              <Text style={styles.linkText}>{lang === 'he' ? 'שכחת סיסמה' : 'Forgot Password'}</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.footer}>
          {lang === 'he'
            ? `כל הזכויות שמורות ל-HIT ${new Date().getFullYear()}`
            : `All rights reserved to HIT ${new Date().getFullYear()}`}
        </Text>
      </ScrollView>

      <Modal visible={!!linkingPrompt} transparent animationType="fade" onRequestClose={() => setLinkingPrompt(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <Text style={[styles.modalTitle, isRtl && styles.textRight]}>
              {lang === 'he' ? 'חשבון עם דוא"ל זה כבר קיים' : 'An account with this email already exists'}
            </Text>
            <Text style={[styles.modalSubtitle, isRtl && styles.textRight]}>
              {lang === 'he'
                ? `הזן/י את הסיסמה של ${linkingPrompt?.email} כדי לחבר את ההתחברות הזו לחשבון הקיים שלך.`
                : `Enter the password for ${linkingPrompt?.email} to link this sign-in to your existing account.`}
            </Text>
            <TextInput
              placeholder={lang === 'he' ? 'סיסמה' : 'Password'}
              placeholderTextColor={colors.muted}
              value={linkingPassword}
              onChangeText={(t) => { setLinkingPassword(t); setLinkingError(''); }}
              secureTextEntry
              style={[styles.input, styles.ltrInput]}
              accessibilityLabel={lang === 'he' ? 'סיסמה' : 'Password'}
            />
            {linkingError ? (
              <Text style={styles.errorText}>{linkingError}</Text>
            ) : null}
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton, { flex: 1 }]}
                onPress={() => { setLinkingPrompt(null); setLinkingPassword(''); setLinkingError(''); }}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryButtonText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.primaryButton, { flex: 1 }, linkingSubmitting && styles.buttonDisabled]}
                onPress={handleLinkSubmit}
                disabled={linkingSubmitting}
                accessibilityRole="button"
              >
                {linkingSubmitting
                  ? <ActivityIndicator color={colors.primaryInk} />
                  : <Text style={styles.primaryButtonText}>{lang === 'he' ? 'חבר חשבון' : 'Link account'}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    backgroundColor: colors.paper,
    padding: 20,
  },
  langRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  langBtn: {
    backgroundColor: colors.surface, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.line,
  },
  langText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  ltrInput: { textAlign: 'left', writingDirection: 'ltr' },
  rowReverse: { flexDirection: 'row-reverse' },
  textRight: { textAlign: 'right' },
  headerBlock: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    width: 64,
    height: 40,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.ink,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    padding: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.ink,
    marginBottom: 6,
  },
  labelSpaced: {
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
  },
  inputFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  passwordRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 44,
  },
  eyeButton: {
    position: 'absolute',
    right: 10,
    padding: 4,
  },
  errorText: {
    marginTop: 12,
    backgroundColor: colors.dangerBg,
    color: colors.dangerText,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    textAlign: 'center',
  },
  button: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    marginTop: 16,
  },
  primaryButtonText: {
    color: colors.primaryInk,
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.line,
  },
  dividerText: {
    marginHorizontal: 10,
    fontSize: 12,
    color: colors.muted,
  },
  linksBlock: {
    marginTop: 18,
    alignItems: 'center',
    gap: 8,
  },
  linkText: {
    color: colors.primary,
    fontSize: 13,
  },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.muted,
    marginTop: 24,
  },
  appleOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 20,
  },
  modalDialog: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 14,
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
});
