import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../src/firebase/firebase";
import NoAccessScreen from "../../components/NoAccessScreen";
import { apiClient } from "../../src/api/apiClient"; 


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
        const response = await apiClient.get('/api/users/profile');
        const role = response.data?.role;

        if (role === "system_admin") {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      } catch (e) {
        console.error('AdminLayout API error:', e); // ← add this
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