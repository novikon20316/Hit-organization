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
import { notifMatchesRole } from '@/lib/notificationScreens';

interface NotificationsContextValue {
  unreadCount: number;
  unreadChats: number;
  /** Unread in-app notification count bucketed by targetScreen (see
   *  server/src/services/notificationTargets.ts) — how per-tab sidebar
   *  badges (SidebarShell.tsx) know how many "new" items each tab has. */
  unreadByTargetScreen: Record<string, number>;
  /** Bulk-marks read every unread notification whose targetScreen is one
   *  of `targetScreens` — called once when the user opens a tab that has
   *  a badge, so it clears immediately. */
  markTabSeen: (targetScreens: string[]) => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  unreadCount: 0,
  unreadChats: 0,
  unreadByTargetScreen: {},
  markTabSeen: async () => {},
  refresh: async () => {},
});

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { firebaseUser, activeRole } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadChats, setUnreadChats] = useState(0);
  const [unreadByTargetScreen, setUnreadByTargetScreen] = useState<Record<string, number>>({});
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
      (snapshot) => {
        // The bell count reflects "unread notifications for the role I'm
        // currently viewing the app as" — a multi-role user switched into
        // supervisor shouldn't see their grad_school_head queue's count
        // here. Per-tab badges below stay unfiltered: each sidebar item's
        // own badgeTargetScreens already only names that role's own
        // screens (or, for the "Switch Role" section, the OTHER role being
        // offered), so they're inherently scoped without needing this.
        const roleFiltered = snapshot.docs.filter((doc) => notifMatchesRole(doc.data().targetScreen, activeRole));
        setUnreadCount(roleFiltered.length);
        const byScreen: Record<string, number> = {};
        for (const doc of snapshot.docs) {
          const targetScreen = doc.data().targetScreen;
          if (typeof targetScreen === 'string') byScreen[targetScreen] = (byScreen[targetScreen] ?? 0) + 1;
        }
        setUnreadByTargetScreen(byScreen);
      },
      (err: any) => {
        if (err?.code === 'permission-denied') return; // expected during sign-out
        console.error('notifications: live unread-count listener error', err);
      }
    );
    return () => cancel(unsubUnread);
  }, [firebaseUser, activeRole]);

  const markTabSeen = useCallback(async (targetScreens: string[]) => {
    try {
      await apiClient.markNotificationsRead(targetScreens);
    } catch (err) {
      console.warn('Failed marking tab notifications as read', err);
    }
  }, []);

  // Rather than resetting unreadCount/unreadChats to 0 with a setState call
  // when firebaseUser goes away (a synchronous reset-on-dependency-change,
  // which is the pattern React's own effect rules flag), derive the exposed
  // value directly: signed out always reads as zero, no extra render needed.
  const value = {
    unreadCount: firebaseUser ? unreadCount : 0,
    unreadChats: firebaseUser ? unreadChats : 0,
    unreadByTargetScreen: firebaseUser ? unreadByTargetScreen : {},
    markTabSeen,
    refresh,
  };

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export const useNotifications = () => useContext(NotificationsContext);
