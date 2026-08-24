'use client';

// app/notifications/page.tsx
// Ported from mobile/app/(tabs)/notifications.tsx — Notifications, Chats,
// and Feedback tabs in one screen, same as mobile.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNotifications } from '@/contexts/NotificationsContext';
import { apiClient } from '@/lib/apiClient';
import { getRoleAccent } from '@/lib/facultyColors';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { NewChatModal } from './NewChatModal';
import { FeedbackTab } from './FeedbackTab';
import { TYPE_STYLE, relativeTime, initials, rowTimestamp, computeNotifTargetRoute, type Notif, type ChatRow } from './types';

type Tab = 'notifs' | 'chats' | 'feedback';

export default function NotificationsPage() {
  const router = useRouter();
  const { userData, loading: authLoading } = useAuth();
  const { lang, t } = useLanguage();
  const { refresh: refreshBadges } = useNotifications();

  const [tab, setTab] = useState<Tab>('notifs');
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(true);
  const [loadingChats, setLoadingChats] = useState(true);
  // Distinct from "genuinely empty" — a failed fetch used to render
  // identically to zero notifications/chats, so a real outage looked like
  // an empty inbox instead of a broken page.
  const [notifsError, setNotifsError] = useState('');
  const [chatsError, setChatsError] = useState('');
  // Shared banner for the smaller mutations below (mark-one-read,
  // mark-all-read, delete-chat) — same "don't fail silently" fix, just
  // grouped since none of them have their own dedicated UI slot.
  const [actionError, setActionError] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [showNewChat, setShowNewChat] = useState(false);
  const [deletingChat, setDeletingChat] = useState<ChatRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const unreadChats = chats.filter((c) => c.unreadCount > 0).length;

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await apiClient.getNotificationFeed();
      setNotifications((res ?? []) as unknown as Notif[]);
      setNotifsError('');
    } catch (err) {
      console.error('Failed fetching notifications:', err);
      setNotifsError(lang === 'he' ? 'טעינת ההתראות נכשלה' : 'Failed to load notifications');
    } finally {
      setLoadingNotifs(false);
    }
  }, [lang]);

  const fetchChats = useCallback(async () => {
    try {
      const res = await apiClient.getChatDashboard();
      setChats((res.chats ?? []) as unknown as ChatRow[]);
      setChatsError('');
    } catch (err) {
      console.error('Failed compiling chat list feed items:', err);
      setChatsError(lang === 'he' ? 'טעינת השיחות נכשלה' : 'Failed to load conversations');
    } finally {
      setLoadingChats(false);
    }
  }, [lang]);

  useEffect(() => {
    // Wait for AuthContext to resolve Firebase's restored session first — on
    // a hard reload auth.currentUser is briefly null while that restore is
    // in flight, so firing these before authLoading flips false sends every
    // request with no Authorization header at all (apiClient.ts's request()
    // reads auth.currentUser synchronously), which the server correctly
    // rejects as unauthorized rather than this being a real outage.
    if (authLoading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling on mount; both fetch functions' setState calls happen after their awaited network calls resolve, not synchronously in this effect
    fetchNotifications();
    fetchChats();
    const interval = setInterval(() => {
      fetchNotifications();
      fetchChats();
    }, 30_000);
    return () => clearInterval(interval);
  }, [authLoading, fetchNotifications, fetchChats]);

  const handleTapNotif = async (notif: Notif) => {
    if (!notif.isRead) {
      try {
        await apiClient.markNotificationRead(notif.id);
        setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)));
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
        setActionError(lang === 'he' ? 'סימון ההתראה כנקראה נכשל' : 'Failed to mark the notification as read');
      }
    }
    refreshBadges();

    if (notif.type === 'new_message') {
      if (notif.chatId) {
        router.push(`/message/${notif.chatId}?otherName=${encodeURIComponent(notif.senderName ?? '')}`);
      }
      return;
    }

    // Every other type opens its own full-screen detail view (full title +
    // body) instead of silently jumping straight to a dashboard — that
    // dashboard never showed the notification's actual content anywhere, so
    // the redirect looked like it had no reason behind it.
    const targetRoute = computeNotifTargetRoute(notif.type, userData?.role, notif.targetScreen);

    const params = new URLSearchParams({
      type: notif.type,
      titleHe: notif.titleHe,
      titleEn: notif.titleEn,
      bodyHe: notif.bodyHe,
      bodyEn: notif.bodyEn,
      createdAt: notif.createdAt,
      targetRoute,
    });
    router.push(`/notification/${notif.id}?${params.toString()}`);
  };

  const handleTapChat = (chat: ChatRow) => {
    router.push(`/message/${chat.chatId}?otherName=${encodeURIComponent(chat.otherName)}&otherRole=${encodeURIComponent(chat.otherRole)}`);
  };

  const handleDeleteChat = async () => {
    if (!deletingChat) return;
    setDeleting(true);
    try {
      await apiClient.deleteChat(deletingChat.chatId);
      setChats((prev) => prev.filter((c) => c.chatId !== deletingChat.chatId));
      setDeletingChat(null);
    } catch (err) {
      console.error('Failed to delete chat:', err);
      setActionError(lang === 'he' ? 'מחיקת השיחה נכשלה' : 'Failed to delete the conversation');
    } finally {
      setDeleting(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiClient.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      refreshBadges();
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
      setActionError(lang === 'he' ? 'סימון הכל כנקרא נכשל' : 'Failed to mark all as read');
    }
  };

  const displayed = filter === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;

  const grouped = useMemo(() => {
    const groups: Record<string, Notif[]> = {};
    displayed.forEach((n) => {
      if (!n.createdAt) return;
      const date = new Date(n.createdAt);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      let key: string;
      if (date.toDateString() === today.toDateString()) key = lang === 'he' ? 'היום' : 'Today';
      else if (date.toDateString() === yesterday.toDateString()) key = lang === 'he' ? 'אתמול' : 'Yesterday';
      else key = date.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      (groups[key] ??= []).push(n);
    });
    return groups;
  }, [displayed, lang]);

  const existingChatIds = new Set(chats.map((c) => c.otherUid));

  const tabs: { key: Tab; label: string; badge: number }[] = [
    { key: 'notifs', label: lang === 'he' ? 'התראות' : 'Notifications', badge: unreadCount },
    { key: 'chats', label: lang === 'he' ? 'הודעות' : 'Chats', badge: unreadChats },
    ...(userData?.role !== 'system_admin' ? [{ key: 'feedback' as const, label: lang === 'he' ? 'משוב' : 'Feedback', badge: 0 }] : []),
  ];

  return (
    <DashboardShell title={lang === 'he' ? 'התראות והודעות' : 'Notifications & Messages'}>
      {actionError && (
        <div className="mb-4 flex items-center justify-between rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
          <span>⚠️ {actionError}</span>
          <button type="button" onClick={() => setActionError('')} className="font-medium">
            ✕
          </button>
        </div>
      )}

      <div className="mb-5 flex gap-1 border-b border-line">
        {tabs.map(({ key, label, badge }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${tab === key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {key === 'notifs' ? '🔔' : key === 'chats' ? '💬' : '🗨️'} {label}
            {badge > 0 ? ` (${badge})` : ''}
          </button>
        ))}
      </div>

      {tab === 'notifs' && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex gap-1.5">
              {(['all', 'unread'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${filter === f ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink'}`}
                >
                  {f === 'all' ? t('all') : `${lang === 'he' ? 'לא נקראו' : 'Unread'} (${unreadCount})`}
                </button>
              ))}
            </div>
            {unreadCount > 0 && (
              <button type="button" onClick={handleMarkAllRead} className="text-sm text-primary hover:underline">
                {lang === 'he' ? 'סמן הכל כנקרא' : 'Mark all read'}
              </button>
            )}
          </div>

          {notifsError && (
            <div className="mb-3 flex items-center justify-between rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
              <span>⚠️ {notifsError}</span>
              <button type="button" onClick={fetchNotifications} className="font-medium underline">
                {lang === 'he' ? 'נסה שוב' : 'Retry'}
              </button>
            </div>
          )}

          {loadingNotifs ? (
            <p className="text-sm text-muted">{t('loading')}</p>
          ) : displayed.length === 0 ? (
            notifsError ? null : <p className="text-sm text-muted">🔔 {lang === 'he' ? 'אין התראות' : 'No notifications'}</p>
          ) : (
            <div className="grid gap-4">
              {Object.entries(grouped).map(([dateLabel, notifs]) => (
                <div key={dateLabel}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{dateLabel}</p>
                  <div className="grid gap-2">
                    {notifs.map((n) => {
                      const style = TYPE_STYLE[n.type] ?? TYPE_STYLE.project_published;
                      return (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => handleTapNotif(n)}
                          className="role-rail flex items-start gap-3 rounded-[var(--radius)] border border-line bg-surface p-3 text-start"
                          style={{ '--rail-color': n.isRead ? 'var(--line)' : style.color } as React.CSSProperties}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base" style={{ backgroundColor: style.bg }}>
                            {style.icon}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className={`truncate text-sm ${n.isRead ? 'text-ink' : 'font-semibold text-ink'}`}>{lang === 'he' ? n.titleHe : n.titleEn}</span>
                              <span className="shrink-0 text-xs text-muted">{rowTimestamp(n.createdAt, lang)}</span>
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted">{lang === 'he' ? n.bodyHe : n.bodyEn}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'chats' && (
        <div>
          {chatsError && (
            <div className="mb-3 flex items-center justify-between rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
              <span>⚠️ {chatsError}</span>
              <button type="button" onClick={fetchChats} className="font-medium underline">
                {lang === 'he' ? 'נסה שוב' : 'Retry'}
              </button>
            </div>
          )}

          {loadingChats ? (
            <p className="text-sm text-muted">{t('loading')}</p>
          ) : chats.length === 0 ? (
            chatsError ? null : <p className="text-sm text-muted">💬 {lang === 'he' ? 'אין שיחות. לחץ על + כדי להתחיל.' : 'No conversations yet. Tap + to start one.'}</p>
          ) : (
            <div className="grid gap-2">
              {chats.map((chat) => {
                const color = getRoleAccent(chat.otherRole);
                return (
                  <div key={chat.chatId} className="group flex items-center gap-3 rounded-[var(--radius)] border border-line bg-surface p-3">
                    <button type="button" onClick={() => handleTapChat(chat)} className="flex flex-1 items-center gap-3 text-start">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ backgroundColor: color }}>
                        {initials(chat.otherName)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-ink">{chat.otherName}</span>
                          <span className="shrink-0 text-xs text-muted">{relativeTime(chat.updatedAt, lang)}</span>
                        </span>
                        <span className={`mt-0.5 block truncate text-xs ${chat.unreadCount > 0 ? 'font-semibold text-ink' : 'text-muted'}`}>
                          {chat.lastMessage || (lang === 'he' ? 'אין הודעות' : 'No messages yet')}
                        </span>
                      </span>
                      {chat.unreadCount > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                          {chat.unreadCount > 9 ? '9+' : chat.unreadCount}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingChat(chat)}
                      className="shrink-0 rounded-full px-2 py-1 text-xs text-muted opacity-0 hover:text-danger group-hover:opacity-100"
                    >
                      🗑️
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowNewChat(true)}
            className="fixed bottom-8 end-8 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl text-primary-ink shadow-lg hover:bg-primary-hover"
            aria-label={lang === 'he' ? 'הודעה חדשה' : 'New message'}
          >
            +
          </button>
        </div>
      )}

      {tab === 'feedback' && userData?.role !== 'system_admin' && <FeedbackTab />}

      {showNewChat && (
        <NewChatModal
          existingChatIds={existingChatIds}
          onClose={() => setShowNewChat(false)}
          onChatCreated={(chatId, otherName, otherRole) => {
            setShowNewChat(false);
            router.push(`/message/${chatId}?otherName=${encodeURIComponent(otherName)}&otherRole=${encodeURIComponent(otherRole)}`);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deletingChat}
        title={lang === 'he' ? 'מחיקת שיחה' : 'Delete Conversation'}
        message={lang === 'he' ? 'האם אתה בטוח שברצונך למחוק שיחה זו?' : 'Are you sure you want to delete this conversation?'}
        confirmLabel={lang === 'he' ? 'מחק' : 'Delete'}
        cancelLabel={t('cancel')}
        destructive
        busy={deleting}
        onConfirm={handleDeleteChat}
        onCancel={() => setDeletingChat(null)}
      />
    </DashboardShell>
  );
}
