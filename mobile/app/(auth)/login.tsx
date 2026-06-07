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
} from "react-native";
import {PRIMARY, loginStyles} from '../../constants'
import { loginUser } from "../../firebase/authService";
import { useState } from "react";
import { useRouter } from 'expo-router';
import { doc, getDoc } from "firebase/firestore";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/src/firebase/firebase";


export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false); // ← new

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError('');
    try {
      const firebaseUser = await signInWithEmailAndPassword(auth, email, password);

      const userDoc = await getDoc(doc(db, 'users', firebaseUser.user.uid));
      const userData = userDoc.data();

      if (userData?.totp_enabled) {
        // ✅ go to verify, NOT setup
        router.push('/(auth)/verify2fa');
      } else {
        const role = userData?.role;
        router.replace(
          role === 'system_admin'  ? '/admin/panel'
          : role === 'faculty_admin' ? '/faculty_admin/dashboard'
          : role === 'coordinator'   ? '/coordinator/home'
          : role === 'supervisor'    ? '/supervisor/dashboard'
          : role === 'student'       ? '/student/home'
          : role === 'examiner'      ? '/examinor/home'
          : '/(auth)/login'
        );
      }
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        setError('Incorrect email or password.');
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
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.container}>

        <View style={styles.logoContainer}>
          <Image
            source={require("../../assets/hit-logo.png")}
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
            onChangeText={(t) => { setEmail(t); setError(""); }}
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
              onChangeText={(t) => { setPassword(t); setError(""); }}
              secureTextEntry={!showPassword}
              style={[styles.input, { marginBottom: 0, paddingRight: 48 }]}
            />
            <Pressable
              onPress={() => setShowPassword(prev => !prev)}
              style={{
                position: 'absolute',
                right: 14,
                padding: 4,
              }}
            >
              <Text style={{ fontSize: 18 }}>
                {showPassword ? '🙈' : '👁️'}
              </Text>
            </Pressable>
          </View>

          {error ? (
            <Text style={{ color: "red", marginBottom: 8, textAlign: "center" }}>
              {error}
            </Text>
          ) : null}

          <TouchableOpacity
            style={styles.button}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
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