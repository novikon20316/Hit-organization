'use client';

// app/student/home/AnnouncementsBanner.tsx
// Running faculty/college announcements (requirements doc section 15) —
// shown to active students on the dashboard Overview tab, not just the
// ineligible-state InfoScreen (which already lists both announcements and
// procedures via the same GET /api/faculty-content).

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';

interface Announcement {
  id: string;
  titleHe: string;
  titleEn: string;
  bodyHe: string;
  bodyEn: string;
}

export function AnnouncementsBanner() {
  const { lang } = useLanguage();
  const [items, setItems] = useState<Announcement[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getFacultyContent()
      .then((res) => {
        if (!cancelled) setItems((res.items ?? []).filter((c) => c.type === 'announcement'));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = (id: string) => {
    setItems((prev) => prev.filter((a) => a.id !== id));
    apiClient.dismissFacultyContent(id).catch(() => {});
  };

  if (items.length === 0) return null;

  return (
    <div className="grid gap-2">
      {items.map((a) => (
        <div key={a.id} className="relative rounded-[var(--radius)] border border-accent bg-[#FBF3E3] p-4">
          <button
            type="button"
            onClick={() => dismiss(a.id)}
            aria-label={lang === 'he' ? 'סגור הודעה' : 'Dismiss announcement'}
            className="absolute end-3 top-3 text-muted hover:text-ink"
          >
            ✕
          </button>
          <p className="pe-6 text-sm font-semibold text-ink">📣 {lang === 'he' ? a.titleHe || a.titleEn : a.titleEn || a.titleHe}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{lang === 'he' ? a.bodyHe || a.bodyEn : a.bodyEn || a.bodyHe}</p>
        </div>
      ))}
    </div>
  );
}
