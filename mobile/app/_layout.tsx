// app/_layout.tsx
import { Stack, useRouter } from "expo-router";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect, useState } from "react";
import { Alert, Platform } from 'react-native';
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../src/firebase/firebase";
import { apiClient } from "../src/api/apiClient";
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useSafeKeepAwake } from '@/hooks/useSafeKeepAwake';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';

// ─── Android notification channel ─────────────────────────────────────────────
// Must be set up before any notification can appear on Android.
// Safe to call at module level — it's a no-op on iOS.
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2E86FF',
    sound: 'default',
  });
}

// ─── Foreground notification display behaviour ────────────────────────────────
// Controls what happens when a push arrives while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
});

// ─── Push token registration ──────────────────────────────────────────────────
// ✅ Works on Android today.
// 🔜 Works on iOS the moment you run `eas credentials` and add APNs — zero code changes needed.
const registerPushToken = async () => {
  try {
    // Push tokens only exist on physical devices (not simulators / emulators)
    if (!Device.isDevice) {
      console.warn('⚠️ Push notifications require a physical device. Skipping token registration.');
      return;
    }

    // Check existing permission before prompting to avoid repeated system dialogs
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('❌ Push notification permission denied by user.');
      return;
    }

    // projectId is required for both Android and iOS (Expo SDK 49+)
    // Set this in app.json → expo.extra.eas.projectId  (run `eas init` to generate one)
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId) {
      console.warn('⚠️ No EAS projectId found in app.config. Push token skipped.');
      return;
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });

    await apiClient.post('/api/users/update-push-token', { token: token.data });

    console.log('📲 Push token registered:', token.data);
  } catch (e) {
    console.warn('Push token registration failed:', e);
  }
};

// ─── Root layout ──────────────────────────────────────────────────────────────
export default function RootLayout() {
  const router = useRouter();
  useSafeKeepAwake();
  const [loading, setLoading] = useState(true);

  // ── Auth state → role-based routing ────────────────────────────────────────
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

        setTimeout(() => {
          if      (role === 'system_admin')   router.replace('/admin/panel');
          else if (role === 'faculty_admin')  router.replace('/faculty_admin/dashboard');
          else if (role === 'coordinator')    router.replace('/coordinator/home');
          else if (role === 'supervisor')     router.replace('/supervisor/dashboard');
          else if (role === 'student')        router.replace('/student/home');
          else if (role === 'examiner')       router.replace('/examinor/home');
          else                                router.replace('/(auth)/login');
        }, 250);

      } catch (err: any) {
        console.error('Auth state exception caught:', err);

        if (err?.message === 'Network Error' || !err.response) {
          Alert.alert(
            'Network Connection Error / שגיאת חיבור',
            'There is a problem with the internet connection. Please try again later.\n\n' +
            'ישנה בעיה בחיבור לאינטרנט או לשרת הפיתוח. אנא נסה שנית מאוחר יותר.'
          );
          await auth.signOut();
          router.replace('/(auth)/login');
        } else if (err?.response?.status === 404) {
          console.log('ℹ️ New user profile record missing, routing to login form.');
          router.replace('/(auth)/login');
        } else {
          router.replace('/(auth)/login');
        }
      } finally {
        setLoading(false);
      }
    });

    return unsub;
  }, []);

  // ── Notification listeners ──────────────────────────────────────────────────
  // ⚠️  The empty [] dependency array is critical — without it this effect
  //     re-runs on every render, creating duplicate listeners each time.
  useEffect(() => {
    // Fires when a push notification arrives while the app is OPEN (foreground)
    const notifListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('🔔 Foreground notification received:', notification);
      // You can trigger a feed refresh here in the future by lifting state or
      // using a global store (e.g. Zustand / Context) to signal the notifications screen.
    });

    // Fires when the user TAPS a notification (foreground or background)
    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, string>;
      setTimeout(() => {
        if (data?.chatId) {
          // Deep-link directly into the relevant chat thread
          router.push({
            pathname: '/message/[chatId]',
            params: {
              chatId:    data.chatId,
              otherName: data.otherName ?? '',
              otherRole: data.otherRole ?? '',
            },
          });
        }
      }, 500);
      // Add more routing cases here as needed, e.g. data.type === 'milestone_graded'
    });

    // Clean up both listeners when the layout unmounts
    return () => {
      notifListener.remove();
      responseListener.remove();
    };
  }, []); // ← empty array: register once, never re-register

  if (loading) {
    return (
      <SafeAreaProvider>
        <StatusBar style="auto" translucent={false} />
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" translucent={false} />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}