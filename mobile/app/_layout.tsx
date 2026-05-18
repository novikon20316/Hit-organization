import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../src/firebase/firebase";
import { registerForPushNotificationsAsync } from '../components/pushNotifications';
import Constants from 'expo-constants'; // should erase that after launching as an app

const isExpoGo = Constants.appOwnership === 'expo'; // should erase that after launching as an app


export default function RootLayout() {
  console.log('🟢 Layout rendering');
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }
      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) {
        console.log("❌ User doc missing");
        router.replace("/(auth)/login");
        setLoading(false);
        return;
      }
      const data = snap.data();
      if(!data.expoPushToken && !isExpoGo){
        try {
          const pushToken = await registerForPushNotificationsAsync();
          if (pushToken) {
            await updateDoc(doc(db, "users", user.uid), {
              expoPushToken: pushToken,
            });
          }
        } catch (err) {
          console.log("❌ Push notification setup error:", err);
        }
      }
      const role = data.role;
      if (role === "student") {
        console.log("➡️ navigating to student");
        router.replace("/student/home");
      }else if (role === "supervisor") {
        console.log("➡️ navigating to supervisor");
        router.replace("/supervisor/dashboard");
      }else if (role === "system_admin") {
        console.log("➡️ navigating to admin");
        router.replace("/admin/panel");
      }else if(role === "coordinator"){
        console.log("➡️ navigating to coordinator");
        router.replace("/coordinator/home");
      }else if(role === "examiner"){
        console.log("➡️ navigating to examiner");
        router.replace("/examinor/home");
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