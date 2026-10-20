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
  /** Live — true as soon as the signed-in user has at least one open
   *  (unresolved) relayTasks doc assigned to them, false the moment the
   *  last one is resolved. Drives whether the "Decisions to Relay" sidebar
   *  item is shown at all (see navSections.ts's relay_tasks item's `visible`
   *  gate), not just a badge count — this is a "do you have anything to do
   *  here" gate, independent of the notification's own read/unread state. */
  hasOpenRelayTasks: boolean;
  /** Live — true as soon as the signed-in user is in any committee's
   *  memberIds (chairman included — always added there too, see
   *  committeeController.ts). Drives whether the "Committees" sidebar item
   *  is shown at all (see navSections.ts's committees item's `visible`
   *  gate) for every role except system_admin, who manages committees
   *  faculty-wide regardless of their own membership. */
  isOnAnyCommittee: boolean;
  /** Live — true while the signed-in user is substituted onto an open
   *  milestone's committee in place of a conflicted member (see server's
   *  substituteCommitteeMember). Gates the supervisor-only Committees tab
   *  and Quick Tasks entry (see lib/roles.ts's isSupervisorWithoutHigherRole). */
  isCommitteeSubstitute: boolean;
  /** Bumps every time a NEW notification lands for the signed-in user
   *  (never on the initial load). Screens watch it through
   *  hooks/useLiveRefresh.ts to refetch their own data the moment something
   *  happens to them — a supervisor's rejection, a new submission, a
   *  committee decision — instead of waiting for a manual page refresh. */
  liveEventTick: number;
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
  hasOpenRelayTasks: false,
  isOnAnyCommittee: false,
  isCommitteeSubstitute: false,
  liveEventTick: 0,
  markTabSeen: async () => {},
  refresh: async () => {},
});

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { firebaseUser, activeRole } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadChats, setUnreadChats] = useState(0);
  const [unreadByTargetScreen, setUnreadByTargetScreen] = useState<Record<string, number>>({});
  const [hasOpenRelayTasks, setHasOpenRelayTasks] = useState(false);
  const [isOnFormalCommittee, setIsOnFormalCommittee] = useState(false);
  const [isCommitteeSubstitute, setIsCommitteeSubstitute] = useState(false);
  const isOnAnyCommittee = isOnFormalCommittee || isCommitteeSubstitute;
  const [liveEventTick, setLiveEventTick] = useState(0);
  const unsubSubstitutions = useRef<Unsubscribe | null>(null);
  const unsubUnread = useRef<Unsubscribe | null>(null);
  const unsubRelayTasks = useRef<Unsubscribe | null>(null);
  const unsubCommittees = useRef<Unsubscribe | null>(null);

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
    } catch {}
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
    let initialSnapshot = true;
    unsubUnread.current = onSnapshot(
      q,
      (snapshot) => {
        // The first snapshot is just the existing backlog — only later
        // 'added' changes are genuinely new events worth a refetch.
        if (!initialSnapshot && snapshot.docChanges().some((c) => c.type === 'added')) {
          setLiveEventTick((n) => n + 1);
        }
        initialSnapshot = false;
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
      }
    );
    return () => cancel(unsubUnread);
  }, [firebaseUser, activeRole]);

  // Live "do I currently owe a relay" flag — checked in the background from
  // the moment the user is signed in, independent of role (a committee
  // chairman can route a decision to any staff role, so this isn't scoped
  // to activeRole the way the bell count above is). Only needs an
  // existence check, not the ordered/paginated list page.tsx fetches via
  // the server — see firestore.rules' relayTasks match for why the client
  // is allowed to read this directly.
  useEffect(() => {
    cancel(unsubRelayTasks);
    if (!firebaseUser) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the gate on sign-out, mirrors the listener teardown right above
      setHasOpenRelayTasks(false);
      return;
    }

    const q = query(
      collection(db, 'relayTasks'),
      where('recipientId', '==', firebaseUser.uid),
      where('resolvedAt', '==', null)
    );
    unsubRelayTasks.current = onSnapshot(
      q,
      (snapshot) => setHasOpenRelayTasks(!snapshot.empty),
      (err: any) => {
        if (err?.code === 'permission-denied') return; // expected during sign-out
      }
    );
    return () => cancel(unsubRelayTasks);
  }, [firebaseUser]);

  // Live "am I on any committee" flag — same idea as hasOpenRelayTasks
  // above, just for app/committees/page.tsx: that page is already empty of
  // anything useful for a user who's on no committee and has no pending
  // review, so the sidebar link should simply not exist for them either.
  useEffect(() => {
    cancel(unsubCommittees);
    if (!firebaseUser) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the gate on sign-out, mirrors the listener teardown right above
      setIsOnFormalCommittee(false);
      return;
    }

    const q = query(collection(db, 'committees'), where('memberIds', 'array-contains', firebaseUser.uid));
    unsubCommittees.current = onSnapshot(
      q,
      (snapshot) => setIsOnFormalCommittee(!snapshot.empty),
      (err: any) => {
        if (err?.code === 'permission-denied') return; // expected during sign-out
      }
    );
    return () => cancel(unsubCommittees);
  }, [firebaseUser]);

  // A staff member substituted onto one milestone's committee in place of a
  // conflicted supervisor (see server's substituteCommitteeMember) isn't in
  // any committee's memberIds, but still needs the Committees link while
  // that review is open.
  useEffect(() => {
    cancel(unsubSubstitutions);
    if (!firebaseUser) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the gate on sign-out, mirrors the listener teardown right above
      setIsCommitteeSubstitute(false);
      return;
    }

    const q = query(collection(db, 'milestones'), where('committeeSubstituteIds', 'array-contains', firebaseUser.uid));
    unsubSubstitutions.current = onSnapshot(
      q,
      (snapshot) => setIsCommitteeSubstitute(snapshot.docs.some((d) => !!d.data().currentCommitteeId)),
      (err: { code?: string }) => {
        if (err?.code === 'permission-denied') return; // expected during sign-out
      }
    );
    return () => cancel(unsubSubstitutions);
  }, [firebaseUser]);

  const markTabSeen = useCallback(async (targetScreens: string[]) => {
    try {
      await apiClient.markNotificationsRead(targetScreens);
    } catch {
      // Fire-and-forget from SidebarShell's badge-clearing effect — a
      // failure here must never block navigation/rendering.
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
    hasOpenRelayTasks: firebaseUser ? hasOpenRelayTasks : false,
    isOnAnyCommittee: firebaseUser ? isOnAnyCommittee : false,
    isCommitteeSubstitute: firebaseUser ? isCommitteeSubstitute : false,
    liveEventTick,
    markTabSeen,
    refresh,
  };

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export const useNotifications = () => useContext(NotificationsContext);
