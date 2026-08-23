'use client';

// components/NotificationBell.tsx
// Ported from mobile/components/NotificationBell.tsx.

import Link from 'next/link';
import { useNotifications } from '@/contexts/NotificationsContext';

interface NotificationBellProps {
  /** Hover/background color classes — defaults to the light-header look;
   *  callers on a dark surface (e.g. SidebarShell) pass their own token
   *  classes instead. */
  className?: string;
}

export function NotificationBell({ className = 'hover:bg-paper' }: NotificationBellProps) {
  const { unreadCount, unreadChats } = useNotifications();
  const total = unreadCount + unreadChats;

  return (
    <Link href="/notifications" className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${className}`} aria-label="Notifications">
      🔔
      {total > 0 && (
        <span className="absolute -top-0.5 end-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
          {total > 9 ? '9+' : total}
        </span>
      )}
    </Link>
  );
}
