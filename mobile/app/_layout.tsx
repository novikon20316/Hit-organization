import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../src/firebase/firebase";

export default function RootLayout() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      console.log("🔥 AUTH STATE:", user?.uid);
      console.log("AUTH UID:", user?.uid);
      if (!user) return;

      const snap = await getDoc(doc(db, "users", user.uid));
      
      console.log("SNAP EXISTS:", snap.exists());
      console.log("SNAP DATA:", snap.data());
      console.log("🔥 USER DOC EXISTS:", snap.exists());
      console.log("🔥 USER DATA:", snap.data());

      const role = snap.exists() ? snap.data().role : null;

      console.log("🔥 ROLE:", role);

      if (role === "student") {
        console.log("➡️ navigating to student");
        router.replace("/student/home");
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