import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../src/firebase/firebase";
import { registerForPushNotificationsAsync } from '../components/pushNotifications';

export default function RootLayout() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      console.log("🔥 AUTH STATE:", user?.uid);
      console.log("AUTH UID:", user?.uid);
      if (!user) {
        console.log("➡️ No user, redirecting to login");
        router.replace("/(auth)/login");
        setLoading(false);
        return;
      }
      const snap = await getDoc(doc(db, "users", user.uid));
      
      console.log("SNAP EXISTS:", snap.exists());
      console.log("SNAP DATA:", snap.data());
      console.log("🔥 USER DOC EXISTS:", snap.exists());
      console.log("🔥 USER DATA:", snap.data());
      if (!snap.exists()) {
        console.log("❌ User doc missing");
        router.replace("/(auth)/login");
        setLoading(false);
        return;
      }
      const data = snap.data();
      if(!data.expoPushToken){
        try {
          const pushToken = await registerForPushNotificationsAsync();

          console.log("📱 PUSH TOKEN:", pushToken);

          if (pushToken) {
            await updateDoc(doc(db, "users", user.uid), {
              expoPushToken: pushToken,
            });

            console.log("✅ Push token saved to Firestore");
          }
        } catch (err) {
          console.log("❌ Push notification setup error:", err);
        }
      }
      const role = data.role;

      console.log("🔥 ROLE:", role);

      if (role === "student") {
        console.log("➡️ navigating to student");
        router.replace("/student/home");
      }else if (role === "supervisor") {
        console.log("➡️ navigating to supervisor");
        router.replace("/supervisor/dashboard");
      }else if (role === "admin") {
        console.log("➡️ navigating to admin");
        router.replace("/admin/panel");
      }else {
        console.log("➡️ navigating to auth");
        router.replace("/(auth)/login");
      }

      setLoading(false);
    });

    return unsub;
  }, []);

  if (loading) {
    return <Stack screenOptions={{ headerShown: false }} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}