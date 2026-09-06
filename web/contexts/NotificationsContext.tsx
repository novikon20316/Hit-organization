'use client';

// contexts/NotificationsContext.tsx
// unreadCount is now a live Firestore listener (see EFFECT below) instead of
// a 30s REST poll — a new notification (grading, approval, defense date,
// a message) now updates the bell instantly rather than up to 30s late.
// unreadChats stays on the REST/poll path — chats/unread-counts aren't
// covered by this pass (see plan: "a live chat feed is a separate, larger
// feature").

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { collection, query, where, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
  const unsubUnread = useRef<Unsubscribe | null>(null);

  const cancel = (ref: React.MutableRefObject<Unsubscribe | null>) => {
    if (ref.current) {
      ref.current();
      ref.current = null;
    }
  };

  // Chats only — notifications now come from the live listener below.
  const refresh = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const chatsRes = await apiClient.getChatDashboard();
      setUnreadChats((chatsRes.chats ?? []).filter((c) => Number(c.unreadCount ?? 0) > 0).length);
    } catch (err) {
      console.warn('Failed refreshing chat counts', err);
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling on sign-in; refresh's setState calls happen after its awaited network calls resolve, not synchronously in this effect
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [firebaseUser, refresh]);

  // Live unread-notification count — same idiom as hooks/useStudentData.ts's
  // milestones listener (ref + cancel + permission-denied swallowed).
  useEffect(() => {
    cancel(unsubUnread);
    if (!firebaseUser) return;

    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', firebaseUser.uid),
      where('isRead', '==', false)
    );
    unsubUnread.current = onSnapshot(
      q,
      (snapshot) => setUnreadCount(snapshot.size),
      (err: any) => {
        if (err?.code === 'permission-denied') return; // expected during sign-out
        console.error('notifications: live unread-count listener error', err);
      }
    );
    return () => cancel(unsubUnread);
  }, [firebaseUser]);

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
