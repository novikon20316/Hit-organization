'use client';

// contexts/NotificationsContext.tsx
// Ported from mobile/src/context/NotificationsContext.tsx — same polling
// cadence (30s), same "clear counts on sign-out" behavior.

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { apiClient } from '@/lib/apiClient';

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

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { firebaseUser } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadChats, setUnreadChats] = useState(0);

  const refresh = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const [notifs, chatsRes] = await Promise.all([apiClient.getNotificationFeed(), apiClient.getChatDashboard()]);
      setUnreadCount(notifs.filter((n) => !n.isRead).length);
      setUnreadChats((chatsRes.chats ?? []).filter((c) => Number(c.unreadCount ?? 0) > 0).length);
    } catch (err) {
      console.warn('Failed refreshing notification counts', err);
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling on sign-in; refresh's setState calls happen after its awaited network calls resolve, not synchronously in this effect
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [firebaseUser, refresh]);

  // Rather than resetting unreadCount/unreadChats to 0 with a setState call
  // when firebaseUser goes away (a synchronous reset-on-dependency-change,
  // which is the pattern React's own effect rules flag), derive the exposed
  // value directly: signed out always reads as zero, no extra render needed.
  const value = {
    unreadCount: firebaseUser ? unreadCount : 0,
    unreadChats: firebaseUser ? unreadChats : 0,
    refresh,
  };

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export const useNotifications = () => useContext(NotificationsContext);
