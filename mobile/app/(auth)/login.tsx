import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from "react-native";

import { loginUser } from "../../firebase/authService";
import { useState } from "react";
import { useRouter } from 'expo-router';


export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setLoading(true);
      await loginUser(email, password);
      // ❗ NO navigation here — RootLayout handles redirect
    } catch (err) {
      console.log("Login error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
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
          onChangeText={setEmail}
          style={styles.input}
          autoCapitalize="none"
        />

        <TextInput
          placeholder="Password"
          placeholderTextColor="#999"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
        />

        <TouchableOpacity style={styles.button} onPress={handleLogin}>
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
        {/* OPTIONAL TEST BUTTON 
        <View style={{ marginTop: 20 }}>
          <Button title="Test Firebase" onPress={testFirebase} />
        </View>*/}
      </View>
  );
}

const PRIMARY = "#2E86FF"; // replace with HIT logo color if needed

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    padding: 20,
  },

  logoContainer: {
    alignItems: "center",
    marginBottom: 40,
  },

  logo: {
    width: 130,
    height: 130,
  },

  title: {
    fontSize: 22,
    fontWeight: "600",
    marginTop: 10,
    color: "#111",
  },

  form: {
    gap: 15,
  },

  input: {
    backgroundColor: "#f5f5f5",
    padding: 14,
    borderRadius: 10,
    fontSize: 16,
    color: "#000",
  },

  button: {
    backgroundColor: PRIMARY,
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },

  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});