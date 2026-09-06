import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { collection, query, where, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { apiClient } from '../api/apiClient';
import { auth, db } from '../firebase/firebase';
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
  /** Unread in-app notification count bucketed by targetScreen (see
   *  server/src/services/notificationTargets.ts) — how per-tab badges
   *  know how many "new" items each tab has. */
  unreadByTargetScreen: Record<string, number>;
  /** Bulk-marks read every unread notification whose targetScreen is one
   *  of `targetScreens` — call once when the user opens a tab that has a
   *  badge, so it clears immediately. */
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

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadChats, setUnreadChats] = useState(0);
  const [unreadByTargetScreen, setUnreadByTargetScreen] = useState<Record<string, number>>({});
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // Total unread MESSAGES (not conversation count) — kept separately from
  // unreadChats (conversations with >=1 unread) purely to feed the native
  // badge total below, same split the old single refresh() had.
  const unreadMessagesRef = useRef(0);
  const unsubUnread = useRef<Unsubscribe | null>(null);

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

  // Chats only now — notification alerts come from the live listener below.
  const refresh = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      const chatsRes = await apiClient.get('/api/chats/dashboard');
      const chats = chatsRes.data.chats ?? [];
      const unreadMessages = chats.reduce((sum: number, c: any) => sum + (c.unreadCount > 0 ? c.unreadCount : 0), 0);
      unreadMessagesRef.current = unreadMessages;
      setUnreadChats(chats.filter((c: any) => c.unreadCount > 0).length);
      setNativeBadge(unreadCount + unreadMessages);
    } catch (e) {
      console.warn('Failed refreshing chat counts', e);
    }
  }, [unreadCount]);

  // ← Only poll (chats) when logged in
  useEffect(() => {
    if (!isLoggedIn) return;
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [isLoggedIn, refresh]);

  // Live unread-alert count — same idiom as web's NotificationsContext.tsx /
  // hooks/useStudentData.ts's listeners (ref + cancel + permission-denied
  // swallowed). Excludes type 'new_message' client-side (those are counted
  // via each chat's own unreadCount instead, above) rather than in the
  // query itself, to avoid needing a composite index for a third filter.
  useEffect(() => {
    if (unsubUnread.current) { unsubUnread.current(); unsubUnread.current = null; }
    const uid = auth.currentUser?.uid;
    if (!isLoggedIn || !uid) return;

    const q = query(collection(db, 'notifications'), where('recipientId', '==', uid), where('isRead', '==', false));
    unsubUnread.current = onSnapshot(
      q,
      (snapshot) => {
        const alertDocs = snapshot.docs.filter((d) => d.data().type !== 'new_message');
        setUnreadCount(alertDocs.length);
        setNativeBadge(alertDocs.length + unreadMessagesRef.current);
        const byScreen: Record<string, number> = {};
        for (const doc of alertDocs) {
          const targetScreen = doc.data().targetScreen;
          if (typeof targetScreen === 'string') byScreen[targetScreen] = (byScreen[targetScreen] ?? 0) + 1;
        }
        setUnreadByTargetScreen(byScreen);
      },
      (err: any) => {
        if (err?.code === 'permission-denied') return; // expected during sign-out
        console.warn('notifications: live unread-count listener error', err);
      }
    );
    return () => {
      if (unsubUnread.current) { unsubUnread.current(); unsubUnread.current = null; }
    };
  }, [isLoggedIn]);

  const markTabSeen = useCallback(async (targetScreens: string[]) => {
    try {
      await apiClient.markNotificationsRead(targetScreens);
    } catch (err) {
      console.warn('Failed marking tab notifications as read', err);
    }
  }, []);

  return (
    <NotificationsContext.Provider value={{ unreadCount, unreadChats, unreadByTargetScreen, markTabSeen, refresh }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationsContext);