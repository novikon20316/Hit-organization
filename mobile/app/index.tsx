import { Redirect } from "expo-router";
import { auth, db } from "../src/firebase/firebase";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { View, ActivityIndicator } from "react-native";

export default function Index() {
    const [redirectPath, setRedirectPath] = useState<string | null>(null);

  useEffect(() => {
    const checkUserRole = async () => {
      const user = auth.currentUser;

      // Not logged in
      if (!user) {
        setRedirectPath("/(auth)/login");
        return;
      }

      try {
        // Get user document from Firestore
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          setRedirectPath("/(auth)/login");
          return;
        }

        const userData = userSnap.data();
        const role = userData.role;

        // Redirect based on role
        switch (role) {
          case "student":
            setRedirectPath("/student/home");
            break;

          case "supervisor":
            setRedirectPath("/supervisor/dashboard");
            break;

          case "admin":
            setRedirectPath("/admin/panel");
            break;

          default:
            setRedirectPath("/(auth)");
        }
      } catch (error) {
        console.log("Role fetch error:", error);
        setRedirectPath("/(auth)");
      }
    };

    checkUserRole();
  }, []);

  // Loading screen while checking role
  if (!redirectPath) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color="#2E86FF" />
      </View>
    );
  }

  return <Redirect href={redirectPath as any} />;
  /*const user = auth.currentUser;

  // Not logged in
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  // Logged in → temporary redirect
  // until we fetch role properly
  return <Redirect href="/student/home" />;
  }*/
 }