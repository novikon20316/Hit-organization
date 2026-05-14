// hooks/usePushNotifications.ts
//
// Call this hook ONCE in your RootLayout (or any top-level component).
// It registers the device with Expo, saves the push token to Firestore,
// and sets up a listener that navigates the user when they tap a notification.

import { useEffect, useRef } from 'react';
import { Platform, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../src/firebase/firebase';
import { useRouter } from 'expo-router';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications() {
  const router               = useRouter();
  const notifListener        = useRef<Notifications.Subscription | undefined>(undefined);
  const responseListener     = useRef<Notifications.Subscription | undefined>(undefined);

  useEffect(() => {
    registerForPushNotificationsAsync();

    // Foreground notification listener — show an in-app alert
    notifListener.current = Notifications.addNotificationReceivedListener((notification) => {
      // The in-app bell will already show this via Firestore real-time listener
      // so we don't need to do anything extra here — the badge will update automatically
      console.log('📲 Notification received in foreground:', notification.request.content.title);
    });

    // Tap listener — navigate to the right screen when user taps a push notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string>;
      handleNotificationTap(data, router);
    });

    return () => {
      if (notifListener.current)
        notifListener.current.remove();
        //Notifications.removeNotificationSubscription(notifListener.current); -- this one causes a crash for some reason, maybe a bug in Expo? The .remove() method works fine though
      if (responseListener.current)
        responseListener.current.remove();
        //Notifications.removeNotificationSubscription(responseListener.current); -- this one causes a crash for some reason, maybe a bug in Expo? The .remove() method works fine though
    };
  }, []);
}

// ─── Navigate based on notification type ─────────────────────────────────────
function handleNotificationTap(
  data: Record<string, string>,
  router: ReturnType<typeof useRouter>
) {
  const { type, relatedProjectId } = data;

  switch (type) {
    case 'project_published':
      if (relatedProjectId) router.push({ pathname: '/student/projects/[id]', params: { id: relatedProjectId } });
      else router.push('/student/home');
      break;
    case 'application_approved':
    case 'application_rejected':
    case 'meeting_requested':
      router.push('/student/home');
      break;
    case 'milestone_graded':
    case 'milestone_deadline_7d':
    case 'milestone_deadline_1d':
      router.push('/student/home');
      break;
    default:
      router.push('/(tabs)/notifications');
  }
}

// ─── Register device and save token to Firestore ──────────────────────────────
async function registerForPushNotificationsAsync(): Promise<void> {
  // Push notifications only work on real devices
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device.');
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name:      'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2E86FF',
    });
  }

  // Check existing permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission denied.');
    return;
  }

  // Get Expo push token
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: process.env.EXPO_PUBLIC_PROJECT_ID, // from app.json / EAS
  });
  const token = tokenData.data;

  console.log('📲 Expo Push Token:', token);

  // Save to current user's Firestore doc
  const uid = auth.currentUser?.uid;
  if (uid && token) {
    await updateDoc(doc(db, 'users', uid), {
      expoPushToken: token,
    });
  }
}
