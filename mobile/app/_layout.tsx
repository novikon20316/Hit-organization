// app/_layout.tsx
import { Stack, useRouter, usePathname } from "expo-router";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useCallback, useEffect, useState } from "react";
import { View, Text, ActivityIndicator, Alert, Platform } from 'react-native';
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../src/firebase/firebase";
import { apiClient } from "../src/api/apiClient";
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useSafeKeepAwake } from '@/hooks/useSafeKeepAwake';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { NotificationsProvider } from '../src/context/NotificationsContext';


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
  const pathname = usePathname();
  useSafeKeepAwake();
  const [loading, setLoading] = useState(true);
  type RouterTarget = Parameters<typeof router.replace>[0];
  const [pendingRedirect, setPendingRedirect] = useState<RouterTarget | null>(null);

  useEffect(() => {
    if (!pendingRedirect) return;
    if (pathname === pendingRedirect) {
      setPendingRedirect(null);
      return;
    }
    router.replace(pendingRedirect);
  }, [pathname, pendingRedirect, router]);

  const scheduleRedirect = useCallback((target: RouterTarget) => {
    if (pathname === target) return;
    if (pendingRedirect === target) return;
    setPendingRedirect(target);
  }, [pathname, pendingRedirect]);

  // ── Auth state → role-based routing ────────────────────────
  useEffect(() => {
    console.log("PATHNAME:", pathname);
    const authRoutes = new Set<string>([
      '/',
      '/index',
      '/login',
      '/signup',
      '/register',
    ]);

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        console.log('No user, pathname =', pathname);
        console.log('authRoutes has pathname?', authRoutes.has(pathname));
        if (!authRoutes.has(pathname)) {
          console.log('Redirecting to login');
          scheduleRedirect('/(auth)/login');
        }
        setLoading(false);
        return;
      }

      try {
        let userData = null;
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            const response = await apiClient.get('/api/users/me');
            userData = response.data;
            break;
          } catch (err: any) {
            if (err?.response?.status === 404 && attempt < 5) {
              console.log(`⏳ /me attempt ${attempt} — retrying...`);
              await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
              throw err;
            }
          }
        }

        if (!userData) {
          scheduleRedirect('/(auth)/login');
          setLoading(false);
          return;
        }

        const role = userData.role;
        await registerPushToken();

        if (authRoutes.has(pathname)) {
          scheduleRedirect(
            role === 'system_admin'   ? '/admin/panel'
          : role === 'faculty_admin'  ? '/faculty_admin/dashboard'
          : role === 'coordinator'    ? '/coordinator/home'
          : role === 'supervisor'     ? '/supervisor/dashboard'
          : role === 'student'        ? '/student/home'
          : role === 'examiner'       ? '/examinor/home'
          : '/(auth)/login'
          );
        }
        setLoading(false);

      } catch (err: any) {
        console.error('Auth state exception caught:', err);
        if (err?.message === 'Network Error' || !err.response) {
          Alert.alert(
            'Network Connection Error / שגיאת חיבור',
            'There is a problem with the internet connection.\n\nישנה בעיה בחיבור לאינטרנט.'
          );
          await auth.signOut();
        }
        scheduleRedirect('/(auth)/login');
        setLoading(false);
      }
    });

    return unsub;
  }, [scheduleRedirect, pathname]);

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
  }, [router]); // ← router is stable in expo-router, keep listener registration once per navigator instance

  if (loading) {
    return (
      <SafeAreaProvider> 
        <StatusBar style="auto" translucent={false} />
        {/* ✅ Replace the empty Stack with an actual loading screen */}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F4FF' }}>
          <ActivityIndicator size="large" color="#2E86FF" />
          <Text style={{ marginTop: 16, fontSize: 16, color: '#2E86FF', fontWeight: '600' }}>
            Signing in...
          </Text>
        </View>
    </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NotificationsProvider>
        <StatusBar style="auto" translucent={false} />
        <Stack screenOptions={{ headerShown: false }} />
      </NotificationsProvider>
    </SafeAreaProvider>
  );
}