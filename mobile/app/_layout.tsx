// app/_layout.tsx
import { Stack, useRouter, usePathname } from "expo-router";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useCallback, useEffect, useState, useRef } from "react";
import { View, Text, ActivityIndicator, Alert, Platform } from 'react-native';
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../src/firebase/firebase";
import { getDoc, doc, Timestamp } from "firebase/firestore";
import { apiClient } from "../src/api/apiClient";
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useSafeKeepAwake } from '@/hooks/useSafeKeepAwake';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { NotificationsProvider } from '../src/context/NotificationsContext';

// ─── Android notification channel ─────────────────────────────────────────────
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
const registerPushToken = async () => {
  try {
    if (!Device.isDevice) {
      console.warn('⚠️ Push notifications require a physical device. Skipping token registration.');
      return;
    }
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

const authRoutes = new Set<string>([
  '/',
  '/index',
  '/login',
  '/signup',
  '/resetPass',
  '/verify2fa',
  '/setup2fa',
  '/(auth)/login',
  '/(auth)/signup',
  '/(auth)/resetPass',
  '/(auth)/verify2fa',
  '/(auth)/setup2fa',
]);

// ─── Root layout ──────────────────────────────────────────────────────────────
export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  useSafeKeepAwake();
  const [loading, setLoading] = useState(true);
  type RouterTarget = Parameters<typeof router.replace>[0];
  const [pendingRedirect, setPendingRedirect] = useState<RouterTarget | null>(null);

  // ── Refs so the auth effect never needs to re-run ──────────────────────────
  const pathnameRef          = useRef(pathname);
  const scheduleRedirectRef  = useRef<((target: RouterTarget) => void) | null>(null);
  const pushTokenRegistered  = useRef(false);

  // Keep pathnameRef current on every render
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // ── Redirect state machine ─────────────────────────────────────────────────
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

  // Keep scheduleRedirectRef current
  useEffect(() => {
    scheduleRedirectRef.current = scheduleRedirect;
  }, [scheduleRedirect]);

  // ── Auth state → role-based routing (runs ONCE) ────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      // Always read from refs — never from closure
      const currentPathname   = pathnameRef.current;
      const redirect          = scheduleRedirectRef.current!;

      if (!user) {
        console.log('No user, pathname =', currentPathname);
        if (!authRoutes.has(currentPathname)) {
          console.log('Redirecting to login');
          redirect('/(auth)/login');
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
          redirect('/(auth)/login');
          setLoading(false);
          return;
        }

        const role = userData.role;

        // ✅ Push token — register only once per app session
        if (!pushTokenRegistered.current) {
          pushTokenRegistered.current = true;
          await registerPushToken();
        }

        const userDoc = await getDoc(doc(db, 'users', user.uid));

        // Guard: user may have signed out while getDoc was in-flight
        if (!auth.currentUser) {
          setLoading(false);
          return;
        }

        const firestoreData = userDoc.data();
        const totpEnabled   = firestoreData?.totp_enabled ?? false;

        const lastVerified  = firestoreData?.totp_last_verified as Timestamp | null;
        const verifiedToday = lastVerified
          ? lastVerified.toDate().toDateString() === new Date().toDateString()
          : false;

        // Re-read pathname from ref — it may have changed during awaits
        const latestPathname  = pathnameRef.current;
        const alreadyVerifying = latestPathname === '/(auth)/verify2fa';
        const alreadyOnSetup   = latestPathname === '/(auth)/setup2fa';

        if (totpEnabled && !verifiedToday && !alreadyVerifying && !alreadyOnSetup) {
          redirect('/(auth)/verify2fa' as any);
          setLoading(false);
          return;
        }

        if (authRoutes.has(latestPathname)) {
          redirect(
            role === 'system_admin'  ? '/admin/panel'
            : role === 'faculty_admin' ? '/faculty_admin/dashboard'
            : role === 'coordinator'   ? '/coordinator/home'
            : role === 'supervisor'    ? '/supervisor/dashboard'
            : role === 'student'       ? '/student/home'
            : role === 'examiner'      ? '/examinor/home'
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
        scheduleRedirectRef.current?.('/(auth)/login');
        setLoading(false);
      }
    });

    return unsub;
  }, []); // ← empty — runs once only, reads live values via refs

  // ── Notification listeners ─────────────────────────────────────────────────
  useEffect(() => {
    const notifListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('🔔 Foreground notification received:', notification);
    });

    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, string>;
      setTimeout(() => {
        if (data?.chatId) {
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
    });

    return () => {
      notifListener.remove();
      responseListener.remove();
    };
  }, [router]);

  if (loading) {
    return (
      <SafeAreaProvider>
        <StatusBar style="auto" translucent={false} />
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