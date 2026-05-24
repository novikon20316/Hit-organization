// app/_layout.tsx
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../src/firebase/firebase";
import { apiClient } from "../src/api/apiClient"; // Import our server wrapper

export default function RootLayout() {
  console.log('🟢 Root layout structural mounting');
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
  const unsub = onAuthStateChanged(auth, async (user) => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const response = await apiClient.get('/api/users/me');
      const userData = response.data;

      if (!userData) {
        router.replace('/(auth)/login');
        setLoading(false);
        return;
      }

      const role = userData.role;
      if (role === 'system_admin')                       router.replace('/admin/panel');
      else if (role === 'faculty_admin')                 router.replace('/faculty_admin/dashboard')
      else if (role === 'coordinator')                   router.replace('/coordinator/home');
      else if (role === 'supervisor')                    router.replace('/supervisor/dashboard');
      else if (role === 'student')                       router.replace('/student/home');
      else if (role === 'examiner')                      router.replace('/examinor/home');
      else                                               router.replace('/(auth)/login');

    } catch (err) {
      console.error('Auth state exception:', err);
      router.replace('/(auth)/login');
    } finally {
      setLoading(false);
    }
  });

  return unsub;
}, []);

  if (loading) {
    return <Stack screenOptions={{ headerShown: false }} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}