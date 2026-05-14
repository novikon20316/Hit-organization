import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../src/firebase/firebase";
import { doc, getDoc } from "firebase/firestore";
import NoAccessScreen from "../../components/NoAccessScreen";

export default function AdminLayout() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", user.uid));

        const role = snap.data()?.role;

        if (role === "system_admin") {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      } catch (e) {
        setIsAdmin(false);
      }

      setLoading(false);
    });

    return unsub;
  }, []);

  if (loading) return null;

  if (!isAdmin) {
    return <NoAccessScreen />;
  }

  return <Stack 
    screenOptions={{
      headerShown: false,
    }}
  />;
}