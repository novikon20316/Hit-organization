import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/apiClient';
import { auth } from '../firebase/firebase';
import { onAuthStateChanged } from 'firebase/auth';

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
      setUnreadCount(notifs.filter((n: any) => !n.isRead).length);
      setUnreadChats(chats.filter((c: any) => c.unreadCount > 0).length);
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