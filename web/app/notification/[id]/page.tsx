'use client';

// app/notification/[id]/page.tsx — full-screen view of a single notification,
// reached by tapping a row in app/notifications/page.tsx. Mirrors
// mobile/app/notification/[id].tsx.

import { useRouter, useSearchParams } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useLanguage } from '@/contexts/LanguageContext';
import { TYPE_STYLE } from '@/app/notifications/types';

export default function NotificationDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang } = useLanguage();

  const type        = searchParams.get('type') ?? '';
  const titleHe     = searchParams.get('titleHe') ?? '';
  const titleEn     = searchParams.get('titleEn') ?? '';
  const bodyHe      = searchParams.get('bodyHe') ?? '';
  const bodyEn      = searchParams.get('bodyEn') ?? '';
  const createdAt   = searchParams.get('createdAt') ?? '';
  const targetRoute = searchParams.get('targetRoute') ?? '';

  const style = TYPE_STYLE[type] ?? TYPE_STYLE.project_published;
  const title = lang === 'he' ? titleHe : titleEn;
  const body  = lang === 'he' ? bodyHe : bodyEn;

  const date = createdAt ? new Date(createdAt) : null;
  const timestamp =
    date && !isNaN(date.getTime())
      ? date.toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', {
          day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
        })
      : '';

  return (
    <DashboardShell
      title={lang === 'he' ? 'התראה' : 'Notification'}
      actions={
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-paper"
        >
          {lang === 'he' ? '→ חזרה' : '← Back'}
        </button>
      }
    >
      <div className="mx-auto grid max-w-2xl gap-4">
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
