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
      // ❗ NO navigation here — RootLayout handles redirect
    } catch (err: any) {
      console.log("Login error:", err);
      const code = err?.code;
      if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        setError("Email or password is incorrect");
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts. Please try again later");
      } else if (code === "auth/network-request-failed") {
        setError("Network error. Check your connection and try again"); // ← your actual bug
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

        {/* LOGO SECTION */}
        <View style={styles.logoContainer}>
          <Image
            source={require("../../assets/hit-logo.png")} // <-- make sure file exists
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>HIT System</Text>
        </View>

        {/* INPUTS */}
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

          <TextInput
            placeholder="Password"
            placeholderTextColor="#999"
            value={password}
            onChangeText={(t) => { setPassword(t); setError(""); }}
            secureTextEntry
            style={styles.input}
          />

          {/* Inline error instead of alert() */}
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