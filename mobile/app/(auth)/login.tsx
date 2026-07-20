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
} from "react-native";
import { PRIMARY, loginStyles } from '../../constants';
import { useState } from "react";
import { useRouter } from 'expo-router';
import { doc, getDoc } from "firebase/firestore";
import { signInWithEmailAndPassword } from "firebase/auth";
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

  const checkMaintenance = useMaintenanceCheck(); // ← NEW

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError('');

    try {
      const firebaseUser = await signInWithEmailAndPassword(auth, email, password);

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
            />
            <Pressable
              onPress={() => setShowPassword(prev => !prev)}
              style={{ position: 'absolute', right: 14, padding: 4 }}
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
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Login</Text>
            }
          </TouchableOpacity>

          <Pressable onPress={() => router.push('/(auth)/signup')}>
            <Text style={{ color: PRIMARY, textAlign: 'center', marginTop: 10 }}>
              Don&#39;t have an account? Sign Up.
            </Text>
          </Pressable>

          <Pressable onPress={() => router.push('/(auth)/resetPass')}>
            <Text style={{ color: PRIMARY, textAlign: 'center', marginTop: 10 }}>
              Don&#39;t remember your password? Reset It.
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = loginStyles;