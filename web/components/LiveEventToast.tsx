'use client';

// components/LiveEventToast.tsx
// Pops the newest live notification (NotificationsContext.liveEvent) on
// screen the moment it lands — a new milestone submission, an approval, a
// committee decision — on whatever page the user is on, instead of it only
// showing up in the bell/email until they reload. Mounted once in
// app/layout.tsx. "View" goes straight to the notification's target screen
// (which reloads fresh), switching to the role it was resolved for when the
// user holds it — same rule as the notifications page's goToTarget.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { getUserRoles, isValidRole } from '@/lib/roles';
import { computeNotifTargetRoute, withDeepLinkParams } from '@/app/notifications/types';

const AUTO_HIDE_MS = 12_000;

export function LiveEventToast() {
  const { liveEvent, dismissLiveEvent } = useNotifications();
  const { userData, activeRole, setActiveRole } = useAuth();
  const { lang } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (!liveEvent) return;
    const timer = setTimeout(dismissLiveEvent, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [liveEvent, dismissLiveEvent]);

  if (!liveEvent) return null;

  const title = (lang === 'he' ? liveEvent.titleHe : liveEvent.titleEn) || liveEvent.titleHe || liveEvent.titleEn;
  const body = (lang === 'he' ? liveEvent.bodyHe : liveEvent.bodyEn) || liveEvent.bodyHe || liveEvent.bodyEn;
  const targetRole = liveEvent.targetRole && isValidRole(liveEvent.targetRole) && getUserRoles(userData).includes(liveEvent.targetRole)
    ? liveEvent.targetRole
    : activeRole;
  const route = withDeepLinkParams(computeNotifTargetRoute(liveEvent.type, targetRole ?? undefined, liveEvent.targetScreen), liveEvent);

  const handleView = () => {
    const event = liveEvent;
    dismissLiveEvent();
    apiClient.markNotificationRead(event.id).catch(() => {});
    if (targetRole && targetRole !== activeRole) setActiveRole(targetRole);
    router.push(route || '/notifications');
  };

  return (
    <div
      role="status"
      aria-live="polite"
      dir={lang === 'he' ? 'rtl' : 'ltr'}
      className="fixed bottom-4 end-4 z-[90] w-[calc(100%-2rem)] max-w-sm rounded-[var(--radius)] border border-line bg-surface p-4 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{title}</p>
          {body && <p className="mt-1 line-clamp-4 whitespace-pre-line text-sm text-muted">{body}</p>}
        </div>
        <button
          type="button"
          onClick={dismissLiveEvent}
          aria-label={lang === 'he' ? 'סגירה' : 'Dismiss'}
          className="-m-1 rounded p-1 text-muted hover:text-ink"
        >
          ✕
        </button>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={handleView}
          className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
        >
          {lang === 'he' ? 'צפייה' : 'View'}
        </button>
      </div>
    </div>
  );
}
