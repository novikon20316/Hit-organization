import { Stack } from 'expo-router';

export default function MessageLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="new" options={{ title: "New Message" }} />
      <Stack.Screen name="[chatId]" options={{ title: "Chat" }} />
    </Stack>
  );
}