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


export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false); // ← new

  const handleLogin = async () => {
    if(loading) return;
    if (!email || !password) {
      setError("Please enter email and password");
      return;
    }
    try {
      setError("");
      setLoading(true);
      await loginUser(email, password);
    } catch (err: any) {
      console.log("Login error:", err);
      const code = err?.code;
      if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        setError("Email or password is incorrect");
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts. Please try again later");
      } else if (code === "auth/network-request-failed") {
        setError("Network error. Check your connection and try again");
      } else {
        setError("Something went wrong. Please try again");
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
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = loginStyles;