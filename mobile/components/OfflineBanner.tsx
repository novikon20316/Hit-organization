// components/OfflineBanner.tsx
// A slim bar across the top of every screen while the server can't be
// reached (src/api/connectivity.ts). Mounted once in app/_layout.tsx.
// Reads (and file uploads) are re-sent automatically once the connection
// is back — see apiClient.ts's isRetryable — so the text says so.
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isOffline, subscribeConnectivity } from '@/src/api/connectivity';
import { getCurrentLang } from '@/src/api/currentLang';

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(isOffline());

  useEffect(() => subscribeConnectivity(setOffline), []);

  if (!offline) return null;
  const he = getCurrentLang() === 'he';
  return (
    <View
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000, paddingTop: insets.top, backgroundColor: '#B45309' }}
    >
      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center', paddingVertical: 6, paddingHorizontal: 12 }}>
        {he
          ? '📡 אין חיבור לשרת — ננסה שוב אוטומטית כשהחיבור יחזור'
          : '📡 No connection — retrying automatically when you are back online'}
      </Text>
    </View>
  );
}
