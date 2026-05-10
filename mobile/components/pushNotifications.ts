import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    alert('Must use physical device');
    return null;
  }

  const { status: existingStatus } =
    await Notifications.getPermissionsAsync();

  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } =
      await Notifications.requestPermissionsAsync();

    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    alert('Permission not granted');
    return null;
  }

  const token = (
    await Notifications.getExpoPushTokenAsync({
      projectId:
        Constants.expoConfig?.extra?.eas?.projectId,
    })
  ).data;

  return token;
}

export async function sendPushNotification(
  expoPushToken: string,
  title: string,
  body: string,
  data: any = {}
) {
  if (!expoPushToken) {
    console.log('❌ Missing push token');
    return;
  }

  try {
    const message = {
      to: expoPushToken,
      sound: 'default',
      title,
      body,
      data,
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
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