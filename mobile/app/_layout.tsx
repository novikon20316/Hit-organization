// app/_layout.tsx
import { Stack, useRouter, usePathname } from "expo-router";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useCallback, useEffect, useState, useRef } from "react";
import { View, Text, ActivityIndicator, Alert, Platform } from 'react-native';
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../src/firebase/firebase";
import { getDoc, doc } from "firebase/firestore";
import { apiClient } from "../src/api/apiClient";
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useSafeKeepAwake } from '@/hooks/useSafeKeepAwake';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { NotificationsProvider } from '../src/context/NotificationsContext';
import { useMaintenanceCheck } from '@/hooks/useMaintenanceCheck';
import { getHomeRoute } from '@/firebase/roles'; // ← single source of truth

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
      console.warn('⚠️  Push notifications require a physical device. Skipping.');
      return;
    }
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.warn('❌ Push notification permission denied.');
      return;
    }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn('⚠️  No EAS projectId found. Push token skipped.');
      return;
    }
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    await apiClient.post('/api/users/update-push-token', { token: token.data });
  } catch (e) {
    console.warn('Push token registration failed:', e);
  }
};

// ─── Routes that do NOT require authentication ────────────────────────────────
// Add every route that must be reachable without a Firebase Auth session.
// ⚠️  examiner-access MUST be here — external examiners arrive via a link
//     and have no Firebase account.
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
  '/changePassword',
  '/(auth)/changePassword',
  '/examiner-access',       // ← external examiner token link (no Auth required)
  '/login-security',        // ← failed-login confirm/deny link (account is disabled at this point)
  '/maintenance',           // ← accessible before role is known
  '/privacy-policy',        // ← linked from signup, must be reachable pre-login
]);

// ─── Root layout ──────────────────────────────────────────────────────────────
export default function RootLayout() {
  const router   = useRouter();
  const pathname = usePathname();
  useSafeKeepAwake();

  const [loading, setLoading] = useState(true);
  type RouterTarget = Parameters<typeof router.replace>[0];
  const [pendingRedirect, setPendingRedirect] = useState<RouterTarget | null>(null);

  const checkMaintenance        = useMaintenanceCheck();
  const pathnameRef             = useRef(pathname);
  const scheduleRedirectRef     = useRef<((target: RouterTarget) => void) | null>(null);
  const pushTokenRegistered     = useRef(false);
  const initialAuthCheckedRef   = useRef(false);

  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  // ── Redirect state machine ─────────────────────────────────────────────────
  useEffect(() => {
    if (!pendingRedirect) return;
    if (pathname === pendingRedirect) { setPendingRedirect(null); return; }
    router.replace(pendingRedirect);
  }, [pathname, pendingRedirect, router]);

  const scheduleRedirect = useCallback((target: RouterTarget) => {
    if (pathname === target)        return;
    if (pendingRedirect === target) return;
    setPendingRedirect(target);
  }, [pathname, pendingRedirect]);

  useEffect(() => { scheduleRedirectRef.current = scheduleRedirect; }, [scheduleRedirect]);

  // ── Auth state → role-based routing ───────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      const currentPathname = pathnameRef.current;
      const redirect        = scheduleRedirectRef.current!;

      // ── Force the login screen on every app launch ─────────────────────────
      // Firebase persists the auth session across restarts, so a returning
      // user would otherwise skip the login screen entirely and land
      // straight on /verify2fa (or their dashboard). Sign out once per app
      // lifetime so 2FA/home routing only ever happens as the result of an
      // explicit login submitted from the login screen.
      if (!initialAuthCheckedRef.current) {
        initialAuthCheckedRef.current = true;
        if (user) {
          await auth.signOut();
          return; // onAuthStateChanged fires again below with user === null
        }
      }

      // ── Unauthenticated ────────────────────────────────────────────────────
      if (!user) {
        // Let the examiner-access screen handle itself (public route)
        if (!authRoutes.has(currentPathname)) {
          redirect('/(auth)/login');
        }
        setLoading(false);
        return;
      }

      try {
        // ── Fetch user record from backend ─────────────────────────────────
        let userData = null;
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            const response = await apiClient.get('/api/users/me');
            userData = response.data;
            break;
          } catch (err: any) {
            if (err?.response?.status === 404 && attempt < 5) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
              throw err;
            }
          }
        }

        if (!userData) {
          // Expected while a freshly-created account is still sitting on
          // signup's email-verification step — the Firestore profile isn't
          // written until verification completes (see signup.tsx). Let that
          // screen keep driving its own flow instead of yanking the user to
          // login mid-verification.
          const onSignup = currentPathname === '/signup' || currentPathname === '/(auth)/signup';
          if (onSignup) { setLoading(false); return; }
          redirect('/(auth)/login');
          setLoading(false);
          return;
        }

        const role = userData.role as string;

        // ── Forced password change (accounts created via Excel import) ──────
        // Takes priority over everything below, including the 2FA gate.
        const latestPathnameForPwGate = pathnameRef.current;
        const alreadyChangingPassword =
          latestPathnameForPwGate === '/changePassword' ||
          latestPathnameForPwGate === '/(auth)/changePassword';

        if (userData.mustChangePassword && !alreadyChangingPassword) {
          redirect('/(auth)/changePassword' as any);
          setLoading(false);
          return;
        }

        // ── Push token (once per session) ──────────────────────────────────
        if (!pushTokenRegistered.current) {
          pushTokenRegistered.current = true;
          registerPushToken(); // fire-and-forget — don't block routing
        }

        // ── 2FA gate ────────────────────────────────────────────────────────
        const userSnap       = await getDoc(doc(db, 'users', user.uid));
        if (!auth.currentUser) { setLoading(false); return; }

        const firestoreData  = userSnap.data();
        const totpEnabled    = firestoreData?.totp_enabled ?? false;

        const latestPathname   = pathnameRef.current;
        console.log('latestPathname:', latestPathname);
        const alreadyVerifying = latestPathname === '/verify2fa' || latestPathname === '/(auth)/verify2fa';
        const alreadyOnSetup   = latestPathname === '/setup2fa'  || latestPathname === '/(auth)/setup2fa';

        // SECURITY: this handler must NEVER navigate the user away from
        // verify2fa/setup2fa. That is exclusively verify2fa.tsx's (and the
        // recovery modal's) own job, driven by an actual successful
        // /api/auth/2fa/validate or /verify call — never by re-reading
        // Firestore here. A prior version of this guard tried to use
        // `totp_last_verified` (whether verification happened "today") to
        // decide it was safe to fall through to the redirect-home branch
        // below — but that flag is calendar-day-scoped and set by ANY past
        // successful verification, not just the current login. Once it was
        // set once in a day, every subsequent fresh login satisfied it and
        // skipped 2FA entirely. There is no Firestore-derived signal that
        // safely distinguishes "verified just now, in this exact flow" from
        // "verified at some earlier point today" — so this handler simply
        // never acts on these two routes at all, full stop.
        if (alreadyVerifying || alreadyOnSetup) {
          setLoading(false);
          return;
        }

        if (totpEnabled && authRoutes.has(latestPathname)) {
          redirect('/(auth)/verify2fa' as any);
          setLoading(false);
          return;
        }

        // ── Only redirect if the user is currently on an auth/public route ──
        // This prevents overwriting deep-links (e.g. a coordinator navigating
        // to a student's process file directly).
        if (authRoutes.has(latestPathname)) {
          const maintenance = await checkMaintenance(role);

          if (maintenance.blocked) {
            redirect({
              pathname: '/maintenance',
              params: { title: maintenance.title, endsAt: maintenance.endsAt ?? '' },
            } as any);
          } else {
            // getHomeRoute() from roles.ts covers ALL roles including new ones
            redirect(getHomeRoute(role as any) as any);
          }
        }

        setLoading(false);

      } catch (err: any) {
        console.error('Auth state error:', err);
        if (err?.message === 'Network Error' || !err?.response) {
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Notification listeners ─────────────────────────────────────────────────
  useEffect(() => {
    const notifListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('🔔 Foreground notification:', notification);
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

    return () => { notifListener.remove(); responseListener.remove(); };
  }, [router]);

  // ── Loading splash ─────────────────────────────────────────────────────────
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