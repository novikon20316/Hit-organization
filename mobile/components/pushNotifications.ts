import Constants from 'expo-constants';

// ─── NO top-level expo-notifications or expo-device imports ──────────────────
// Both packages crash Expo Go on SDK 53 when imported at module load time.
// We lazy-import them inside each function instead.

const isExpoGo = Constants.appOwnership === 'expo';

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Silently skip in Expo Go — push tokens don't work there on SDK 53
  if (isExpoGo) {
    console.log('ℹ️ Skipping push token registration in Expo Go');
    return null;
  }

  // Lazy import — only loads the native module when this function is actually called
  const Device        = await import('expo-device');
  const Notifications = await import('expo-notifications');

  if (!Device.isDevice) {
    console.log('Must use physical device for Push Notifications');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('❌ Push notification permission not granted');
    return null;
  }

  const token = (
    await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId,
    })
  ).data;

  return token;
}

export async function sendPushNotification(
  expoPushToken: string | null | undefined,
  title: string,
  body: string,
  data: any = {}
): Promise<void> {
  // Skip in Expo Go or if no token
  if (isExpoGo || !expoPushToken) {
    console.log('ℹ️ Skipping push notification (Expo Go or no token)');
    return;
  }

  try {
    const message = {
      to:    expoPushToken,
      sound: 'default',
      title,
      body,
      data,
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method:  'POST',
      headers: {
        Accept:         'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log('📲 Push sent:', result);
  } catch (error) {
    console.log('❌ Push error:', error);
  }
}