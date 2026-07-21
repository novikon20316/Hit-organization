import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View, Text, Image, ActivityIndicator, Pressable } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../src/firebase/firebase";
import NoAccessScreen from "../../components/NoAccessScreen";
import { apiClient } from "../../src/api/apiClient";

// This screen only ever gets navigated to as the result of login.tsx (or
// root _layout.tsx) already confirming role === 'system_admin' from a
// direct Firestore read — moments before this layout's own /api/users/profile
// check fires. That server round-trip (Firebase Admin SDK token
// verification) has no relation to whether the role is actually correct; a
// transient blip right after fresh sign-in (token not fully propagated yet,
// a slow cold backend) used to be treated as "confirmed not admin" on the
// very first failed attempt, producing a false "Access Denied" for a
// legitimate system_admin. Retrying with backoff — and only ever showing
// NoAccessScreen after an actual successful response says the role isn't
// system_admin, never after a failed *request* — fixes that: the check
// keeps a branded loading screen up until it has a definitive answer.
const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 800;

function BrandedLoadingScreen({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F0F4FF", padding: 24 }}>
      <Image
        source={require("../../assets/hit-logo.png")}
        style={{ width: 96, height: 96, marginBottom: 20 }}
        resizeMode="contain"
      />
      {!retry && <ActivityIndicator size="large" color="#2E86FF" style={{ marginBottom: 12 }} />}
      <Text style={{ fontSize: 15, color: "#2E86FF", fontWeight: "600", textAlign: "center" }}>
        {message}
      </Text>
      {retry && (
        <Pressable
          onPress={retry}
          style={{ marginTop: 20, backgroundColor: "#2E86FF", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Try Again</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function AdminLayout() {
  const router = useRouter();

  // 'checking' — still retrying, no definitive answer yet (branded loading screen).
  // 'admin' — a successful response confirmed role === 'system_admin'.
  // 'not-admin' — a successful response confirmed the role is something else.
  // 'unverifiable' — every retry attempt failed as a *request* (network/token/server) — never a confirmed non-admin, so this must never render NoAccessScreen.
  const [status, setStatus] = useState<"checking" | "admin" | "not-admin" | "unverifiable">("checking");

  const runCheck = useCallback(async () => {
    setStatus("checking");
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await apiClient.get("/api/users/profile");
        const role = response.data?.role;
        setStatus(role === "system_admin" ? "admin" : "not-admin");
        return;
      } catch (e) {
        console.error(`AdminLayout profile check failed (attempt ${attempt}/${MAX_ATTEMPTS}):`, e);
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
        }
      }
    }
    setStatus("unverifiable");
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      runCheck();
    });

    return unsub;
  }, [runCheck, router]);

  if (status === "checking") {
    return <BrandedLoadingScreen message="Verifying your account..." />;
  }

  if (status === "unverifiable") {
    return (
      <BrandedLoadingScreen
        message="Couldn't reach the server to verify your account. Check your connection and try again."
        retry={runCheck}
      />
    );
  }

  if (status === "not-admin") {
    return <NoAccessScreen />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
