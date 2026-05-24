// app/_layout.tsx
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../src/firebase/firebase";
import { apiClient } from "../src/api/apiClient"; // Import our server wrapper
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
    shouldShowBanner: true, 
    shouldShowList:   true,
  }),
});

const registerPushToken = async () => {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;

    const token = await Notifications.getExpoPushTokenAsync();
    await apiClient.post('/api/users/update-push-token', { 
      token: token.data 
    });
    console.log('📲 Push token registered:', token.data);
  } catch (e) {
    console.warn('Push token registration failed:', e);
  }
};


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
      console.log('👤 /me response:', JSON.stringify(response.data));
      console.log('👤 role:', response.data?.role);
      const userData = response.data;

      if (!userData) {
        router.replace('/(auth)/login');
        setLoading(false);
        return;
      }

      const role = userData.role;
      await registerPushToken();
      if (role === 'system_admin')                       router.replace('/admin/panel');
      else if (role === 'faculty_admin')                 router.replace('/faculty_admin/dashboard')
      else if (role === 'coordinator')                   router.replace('/coordinator/home');
      else if (role === 'supervisor')                    router.replace('/supervisor/dashboard');
      else if (role === 'student')                       router.replace('/student/home');
      else if (role === 'examiner')                      router.replace('/examinor/home');
      else                                               router.replace('/(auth)/login');

    } catch (err: any) {
      // 404 = user exists in Firebase Auth but Firestore doc not created yet
      // This is normal during signup — just send to login, not an error
      if (err?.response?.status === 404) {
        console.log('ℹ️ New user, Firestore doc not ready yet — redirecting to login');
        router.replace('/(auth)/login');
      } else {
        console.error('Auth state exception:', err);
        router.replace('/(auth)/login');
      }
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