import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Pressable,
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

  const handleLogin = async () => {
    try {
      setLoading(true);
      await loginUser(email, password);
      // ❗ NO navigation here — RootLayout handles redirect
    } catch (err) {
      console.log("Login error:", err);
      alert("username or password are incorrect")
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

const styles = loginStyles;