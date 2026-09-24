'use client';

// components/SystemHealthCard.tsx
// system_admin's "System Health" widget — live Firestore listener on
// errorReports (see server/src/services/errorReports.ts), same read-only
// direct-listener pattern app/admin/panel/page.tsx already uses for locked
// users / pending signoffs. Client crashes, API timeouts, and network/
// data-receiving failures reported from web+mobile all land here, deduped
// server-side per fingerprint so a burst of the same bug shows as ONE row
// with a count, not one row per occurrence.

import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { apiClient } from '@/lib/apiClient';

interface ErrorReportRow {
  id: string;
  kind: 'client_crash' | 'api_timeout' | 'network_failure';
  platform: 'web' | 'mobile';
  message: string;
  route: string | null;
  count: number;
  status: 'open' | 'resolved';
  lastOccurredMs: number | null;
}

const KIND_LABEL: Record<ErrorReportRow['kind'], { he: string; en: string; icon: string }> = {
  client_crash: { he: 'קריסת לקוח', en: 'Client crash', icon: '💥' },
  api_timeout: { he: 'תפוגת זמן', en: 'Timeout', icon: '⏱️' },
  network_failure: { he: 'כשל רשת/נתונים', en: 'Network/data failure', icon: '📡' },
};

export function SystemHealthCard({ lang }: { lang: 'he' | 'en' }) {
  const [rows, setRows] = useState<ErrorReportRow[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'errorReports'), orderBy('lastOccurredAt', 'desc'), limit(30));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const open: ErrorReportRow[] = [];
        snap.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          if (data.status !== 'open') return;
          const lastTs = data.lastOccurredAt as { toMillis?: () => number } | undefined;
          open.push({
            id: d.id,
            kind: (data.kind as ErrorReportRow['kind']) ?? 'client_crash',
            platform: (data.platform as ErrorReportRow['platform']) ?? 'web',
            message: (data.message as string) ?? '',
            route: (data.route as string) ?? null,
            count: typeof data.count === 'number' ? data.count : 1,
            status: 'open',
            lastOccurredMs: lastTs?.toMillis ? lastTs.toMillis() : null,
          });
        });
        setRows(open.slice(0, 8));
      },
      () => {}
    );
    return unsub;
  }, []);

  const resolve = async (id: string) => {
    setResolvingId(id);
    try {
      await apiClient.patch(`/api/admin/system/error-reports/${id}/resolve`);
    } catch {
      // Live listener above will simply keep showing it if this failed —
      // no separate error UI needed for a dismiss action on this widget.
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="mt-4 rounded-admin-lg border border-admin-outline-variant bg-admin-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-admin-on-surface">
          🩺 {lang === 'he' ? 'תקינות המערכת' : 'System Health'}
        </h2>
        {rows.length > 0 && (
          <span className="rounded-full bg-admin-error-container px-2 py-0.5 text-xs font-bold text-admin-error">
            {rows.length}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-admin-on-surface-variant">
          {lang === 'he' ? 'אין תקלות פתוחות כרגע' : 'No open errors right now'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const kindMeta = KIND_LABEL[r.kind];
            return (
              <li key={r.id} className="rounded-md border border-admin-outline-variant/60 p-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-medium text-admin-on-surface">
                      <span>{kindMeta.icon}</span>
                      <span>{lang === 'he' ? kindMeta.he : kindMeta.en}</span>
                      <span className="rounded-full bg-admin-surface-container px-1.5 py-0.5 text-[10px] uppercase text-admin-on-surface-variant">
                        {r.platform}
                      </span>
                      {r.count > 1 && (
                        <span className="rounded-full bg-admin-error-container px-1.5 py-0.5 text-[10px] font-bold text-admin-error">
                          ×{r.count}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-admin-on-surface-variant" title={r.message}>
                      {r.message}
                    </p>
                    {r.route && <p className="text-xs text-admin-on-surface-variant">{r.route}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => resolve(r.id)}
                    disabled={resolvingId === r.id}
                    className="shrink-0 rounded-md border border-admin-outline-variant px-2 py-1 text-xs font-medium text-admin-on-surface hover:border-admin-primary disabled:opacity-50"
                  >
                    {resolvingId === r.id ? '…' : lang === 'he' ? 'סמן כטופל' : 'Resolve'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
