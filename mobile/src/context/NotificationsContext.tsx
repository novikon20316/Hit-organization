import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { apiClient } from '../api/apiClient';
import { auth } from '../firebase/firebase';
import { onAuthStateChanged } from 'firebase/auth';

// Best-effort — the native app-icon badge (like WhatsApp's unread count) isn't
// available on every platform/build (e.g. Android launchers vary, Expo Go
// doesn't reliably reflect it), so a failure here must never break the
// in-app unread counts this same call is derived from.
function setNativeBadge(count: number) {
  Notifications.setBadgeCountAsync(count).catch(() => {});
}

interface NotificationsContextValue {
  unreadCount: number;
  unreadChats: number;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  unreadCount: 0,
  unreadChats: 0,
  refresh: async () => {},
});

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadChats, setUnreadChats] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

   // Track auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsLoggedIn(!!user);
      if (!user) {
        setUnreadCount(0);   // ← clear on logout
        setUnreadChats(0);
        setNativeBadge(0);
      }
    });
    return unsub;
  }, []);

  const refresh = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      const [notifsRes, chatsRes] = await Promise.all([
        apiClient.get('/api/notifications/feed'),
        apiClient.get('/api/chats/dashboard'),
      ]);
      const notifs = Array.isArray(notifsRes.data) ? notifsRes.data : [];
      const chats  = chatsRes.data.chats ?? [];
      // Chat-originated entries are counted via each chat's own unreadCount
      // below, not double-counted as alerts too.
      const unreadAlerts = notifs.filter((n: any) => !n.isRead && n.type !== 'new_message').length;
      const unreadMessages = chats.reduce((sum: number, c: any) => sum + (c.unreadCount > 0 ? c.unreadCount : 0), 0);
      setUnreadCount(unreadAlerts);
      setUnreadChats(chats.filter((c: any) => c.unreadCount > 0).length);
      // Native app-icon badge (mobile-only "unread" indicator, like WhatsApp) —
      // total unread alerts + messages, not just conversation count.
      setNativeBadge(unreadAlerts + unreadMessages);
    } catch (e) {
      console.warn('Failed refreshing notification counts', e);
    }
  }, []);

  // ← Only poll when logged in
  useEffect(() => {
    if (!isLoggedIn) return;
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [isLoggedIn, refresh]);

  return (
    <NotificationsContext.Provider value={{ unreadCount, unreadChats, refresh }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationsContext);