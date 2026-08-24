'use client';

// app/notification/[id]/page.tsx — full-screen view of a single notification,
// reached by tapping a row in app/notifications/page.tsx. Also supports
// paging to the previous/next notification without going back to the list.
// Mirrors mobile/app/notification/[id].tsx.

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNotifications } from '@/contexts/NotificationsContext';
import { apiClient } from '@/lib/apiClient';
import { TYPE_STYLE, computeNotifTargetRoute, type Notif } from '@/app/notifications/types';

export default function NotificationDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { userData } = useAuth();
  const { lang } = useLanguage();
  const { refresh: refreshBadges } = useNotifications();

  const paramType        = searchParams.get('type') ?? '';
  const paramTitleHe     = searchParams.get('titleHe') ?? '';
  const paramTitleEn     = searchParams.get('titleEn') ?? '';
  const paramBodyHe      = searchParams.get('bodyHe') ?? '';
  const paramBodyEn      = searchParams.get('bodyEn') ?? '';
  const paramCreatedAt   = searchParams.get('createdAt') ?? '';
  const paramTargetRoute = searchParams.get('targetRoute') ?? '';

  // Fetched once and reused across next/previous clicks (this page stays
  // mounted across router.replace calls to the same route) — lets paging
  // between notifications feel instant instead of refetching on every click.
  const [alerts, setAlerts] = useState<Notif[]>([]);
  const [listReady, setListReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getNotificationFeed()
      .then((res) => {
        if (cancelled) return;
        const feed = ((res ?? []) as unknown as Notif[])
          .filter((n) => n.type !== 'new_message')
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setAlerts(feed);
        setListReady(true);
      })
      .catch((err) => {
        console.error('Failed to load notification list for paging:', err);
        setListReady(true); // paging just stays disabled
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentIndex = alerts.findIndex((n) => n.id === params.id);
  const current = currentIndex >= 0 ? alerts[currentIndex] : null;

  // Falls back to the data passed in from the list click (already correct
  // for the notification actually clicked) until the list above finishes
  // loading, or if it's somehow missing from the fetched list.
  const type       = current?.type       ?? paramType;
  const titleHe    = current?.titleHe    ?? paramTitleHe;
  const titleEn    = current?.titleEn    ?? paramTitleEn;
  const bodyHe     = current?.bodyHe     ?? paramBodyHe;
  const bodyEn     = current?.bodyEn     ?? paramBodyEn;
  const createdAt  = current?.createdAt  ?? paramCreatedAt;
  // Only recomputed once the list (and userData.role) is known — otherwise
  // falls back to whatever the list page already computed for this notification.
  const targetRoute = listReady ? computeNotifTargetRoute(type, userData?.role, current?.targetScreen) : paramTargetRoute;

  const style = TYPE_STYLE[type] ?? TYPE_STYLE.project_published;
  const title = lang === 'he' ? titleHe : titleEn;
  const body = lang === 'he' ? bodyHe : bodyEn;

  const date = createdAt ? new Date(createdAt) : null;
  const timestamp =
    date && !isNaN(date.getTime())
      ? date.toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', {
          day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
        })
      : '';

  const hasPrev = listReady && currentIndex > 0;
  const hasNext = listReady && currentIndex >= 0 && currentIndex < alerts.length - 1;

  const goTo = (direction: 'prev' | 'next') => {
    const targetIndex = currentIndex + (direction === 'next' ? 1 : -1);
    if (targetIndex < 0 || targetIndex >= alerts.length) return;
    const target = alerts[targetIndex];

    if (!target.isRead) {
      apiClient.markNotificationRead(target.id).catch((err) => {
        console.error('Failed to mark notification as read:', err);
      });
      setAlerts((prev) => prev.map((n) => (n.id === target.id ? { ...n, isRead: true } : n)));
      refreshBadges();
    }

    const nextParams = new URLSearchParams({
      type: target.type,
      titleHe: target.titleHe,
      titleEn: target.titleEn,
      bodyHe: target.bodyHe,
      bodyEn: target.bodyEn,
      createdAt: target.createdAt,
      targetRoute: computeNotifTargetRoute(target.type, userData?.role, target.targetScreen),
    });
    router.replace(`/notification/${target.id}?${nextParams.toString()}`);
  };

  return (
    <DashboardShell title={lang === 'he' ? 'התראה' : 'Notification'}>
      <div className="mx-auto grid max-w-2xl gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="w-fit rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-paper"
        >
          {lang === 'he' ? '→ חזרה' : '← Back'}
        </button>

        <span
          className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
          style={{ backgroundColor: style.bg }}
        >
          {style.icon}
        </span>

        <div>
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          {timestamp && <p className="mt-1 text-sm text-muted">{timestamp}</p>}
        </div>

        <div className="rounded-[var(--radius)] border border-line bg-surface p-5">
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{body}</p>
        </div>

        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={!hasPrev}
            onClick={() => goTo('prev')}
            className="flex-1 rounded-[var(--radius)] border border-line bg-surface py-2.5 text-sm font-semibold text-primary disabled:opacity-40"
          >
            {lang === 'he' ? '‹ הקודם' : '‹ Previous'}
          </button>
          <button
            type="button"
            disabled={!hasNext}
            onClick={() => goTo('next')}
            className="flex-1 rounded-[var(--radius)] border border-line bg-surface py-2.5 text-sm font-semibold text-primary disabled:opacity-40"
          >
            {lang === 'he' ? 'הבא ›' : 'Next ›'}
          </button>
        </div>

        {targetRoute && (
          <button
            type="button"
            onClick={() => router.push(targetRoute)}
            className="rounded-[var(--radius)] bg-primary px-4 py-3 text-sm font-semibold text-primary-ink hover:opacity-90"
          >
            {lang === 'he' ? 'עבור לדשבורד' : 'Go to dashboard'}
          </button>
        )}
      </div>
    </DashboardShell>
  );
}
